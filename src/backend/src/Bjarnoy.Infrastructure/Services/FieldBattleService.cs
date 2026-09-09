using System.Security.Cryptography;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Movement = Bjarnoy.Domain.Movement.Movement;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// In-flight army-vs-army interception (issue #206). Detection and
/// resolution are one and the same step here, run from
/// <c>ArmyService.SettleAndFoldAsync</c> — exactly the "pure, compute-on-read"
/// posture the rest of this domain already uses for position, resources and
/// arrival: nothing is ever pre-computed or cached ahead of time, so a
/// changed route can never leave a stale prediction behind (there is none to
/// go stale). Every call recomputes <see cref="MovementOccupancy.EarliestMeeting"/>
/// fresh from whichever armies are currently in transit.
/// </summary>
/// <remarks>
/// This trades away the bounding-box/island/route-version pre-filtering a
/// bigger deployment would eventually want for query performance, in favour
/// of a plain in-memory scan over the (typically small) set of currently
/// in-transit armies in one world. Purely a performance concern, not a
/// correctness one — see the PR's implementation notes for why this is the
/// minimal-surprise call given the rest of this codebase's "no background
/// job, compute on read" design.
/// </remarks>
public sealed class FieldBattleService(GameDbContext dbContext, ILogger<FieldBattleService> logger)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly ILogger<FieldBattleService> _logger = logger;

    /// <summary>
    /// Checks <paramref name="army"/> (already settled to <paramref name="now"/>
    /// by the caller, and still tracked by this same <see cref="GameDbContext"/>)
    /// for an in-flight interception that has already happened as of
    /// <paramref name="now"/>, and resolves it if so.
    /// </summary>
    /// <returns>
    /// <see langword="true"/> if a battle was found, claimed, and applied —
    /// <paramref name="army"/> and the other side's <see cref="ArmyEntity"/>
    /// (also added to this context) now carry the post-battle state and a
    /// <see cref="FieldBattleReportEntity"/> was added; the caller still owns
    /// calling <c>SaveChangesAsync</c>. <see langword="false"/> means either
    /// nothing was found, or a concurrent request already claimed the one
    /// meeting that was found — in both cases <paramref name="army"/> is
    /// untouched and the caller's normal settle logic should proceed as if
    /// this call had never happened.
    /// </returns>
    public async Task<bool> TryResolveAsync(
        ArmyEntity army, Army domain, DateTimeOffset now, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(army);
        ArgumentNullException.ThrowIfNull(domain);

        if (domain.Location is not ArmyLocation.InTransit { Movement: var movement })
        {
            return false;
        }

        // A voluntary Recall (IsReturning but not RetreatImmune) is still
        // fully interceptable — only the two immune legs are exempt (issue
        // #206 §5).
        if (movement.IsReturning && movement.RetreatImmune)
        {
            return false;
        }

        var homeA = new HexCoord(army.Settlement!.CentreQ, army.Settlement.CentreR);
        var worldId = army.Settlement.WorldId;

        var candidates = await _dbContext.Armies
            .Include(a => a.Stacks)
            .Include(a => a.Settlement!).ThenInclude(s => s.Buildings)
            .Include(a => a.Settlement!).ThenInclude(s => s.Owner)
            .Include(a => a.Settlement!).ThenInclude(s => s.World)
            .Where(a => a.Id != army.Id
                && !a.AtHome
                && !a.IsSupporting
                && a.Settlement!.WorldId == worldId
                && !(a.IsReturning && a.RetreatImmune))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        (ArmyEntity Other, Army OtherDomain, Movement OtherMovement, HexCoord Hex, DateTimeOffset At)? earliest = null;

        foreach (var other in candidates)
        {
            if (!FieldBattleResolver.IsHostile(
                    army.Settlement.UserId, army.Settlement.Owner?.GuildId,
                    other.Settlement!.UserId, other.Settlement.Owner?.GuildId))
            {
                continue;
            }

            var otherDomain = other.ToDomain();
            if (otherDomain.Location is not ArmyLocation.InTransit { Movement: var otherMovement })
            {
                continue;
            }

            var homeB = new HexCoord(other.Settlement.CentreQ, other.Settlement.CentreR);
            var meeting = MovementOccupancy.EarliestMeeting(movement, otherMovement, homeA, homeB);
            if (meeting is not { } found || found.At > now)
            {
                continue;
            }

            if (earliest is null || found.At < earliest.Value.At
                || (found.At == earliest.Value.At && other.Id < earliest.Value.Other.Id))
            {
                earliest = (other, otherDomain, otherMovement, found.Hex, found.At);
            }
        }

        if (earliest is not { } chosen)
        {
            return false;
        }

        if (!await TryClaimAsync(army.Id, chosen.Other.Id, chosen.At, cancellationToken).ConfigureAwait(false))
        {
            // Someone else (a concurrent request touching either army) is
            // already resolving this exact meeting — back off, nothing to
            // apply on our side.
            return false;
        }

        Resolve(army, domain, movement, chosen.Other, chosen.OtherDomain, chosen.OtherMovement, chosen.Hex, chosen.At);
        return true;
    }

    /// <summary>
    /// Atomically claims one specific meeting via a dedicated, immediate
    /// <c>SaveChangesAsync</c> — see <see cref="FieldBattleClaimEntity"/>'s
    /// remarks for why a unique primary key alone is enough for
    /// exactly-once resolution without any row locking.
    /// </summary>
    private async Task<bool> TryClaimAsync(
        Guid armyIdA, Guid armyIdB, DateTimeOffset meetingAt, CancellationToken cancellationToken)
    {
        var claim = new FieldBattleClaimEntity
        {
            Id = ClaimId(armyIdA, armyIdB, meetingAt),
            ClaimedAt = meetingAt,
        };

        _dbContext.FieldBattleClaims.Add(claim);
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return true;
        }
        catch (DbUpdateException)
        {
            _dbContext.Entry(claim).State = EntityState.Detached;
            return false;
        }
    }

    /// <summary>
    /// Deterministic from the unordered army-id pair and the exact meeting
    /// instant, so two callers who independently detect the same meeting
    /// always compute the same id (see <see cref="FieldBattleClaimEntity"/>).
    /// </summary>
    private static Guid ClaimId(Guid armyIdA, Guid armyIdB, DateTimeOffset meetingAt)
    {
        var (low, high) = armyIdA.CompareTo(armyIdB) <= 0 ? (armyIdA, armyIdB) : (armyIdB, armyIdA);

        Span<byte> buffer = stackalloc byte[16 + 16 + 8];
        low.TryWriteBytes(buffer);
        high.TryWriteBytes(buffer[16..]);
        BitConverter.TryWriteBytes(buffer[32..], meetingAt.UtcTicks);

        Span<byte> hash = stackalloc byte[32];
        SHA256.HashData(buffer, hash);
        return new Guid(hash[..16]);
    }

    /// <summary>
    /// Applies one resolved <see cref="FieldBattlePlan"/> to both
    /// <see cref="ArmyEntity"/> rows and adds the
    /// <see cref="FieldBattleReportEntity"/> — the caller still owns
    /// <c>SaveChangesAsync</c>.
    /// </summary>
    private void Resolve(
        ArmyEntity armyA, Army domainA, Movement movementA,
        ArmyEntity armyB, Army domainB, Movement movementB,
        HexCoord hex, DateTimeOffset at)
    {
        var claimA = FieldBattleResolver.ClaimAt(
            hex, new HexCoord(armyA.Settlement!.CentreQ, armyA.Settlement.CentreR), ToPlacedBuildings(armyA.Settlement.Buildings));
        var claimB = FieldBattleResolver.ClaimAt(
            hex, new HexCoord(armyB.Settlement!.CentreQ, armyB.Settlement.CentreR), ToPlacedBuildings(armyB.Settlement.Buildings));

        var seed = BitConverter.ToInt32(ClaimId(armyA.Id, armyB.Id, at).ToByteArray(), 0);

        var plan = FieldBattleResolver.Resolve(
            domainA.Stacks, claimA, domainB.Stacks, claimB, domainA.Loot, domainB.Loot, seed);

        Army updatedA;
        Army updatedB;

        switch (plan.Winner)
        {
            case FieldBattleWinner.SideA:
                updatedA = ApplyWin(domainA, movementA, plan.SideASurvivors, plan.LootTakenByWinner);
                updatedB = ApplyLoss(armyB.Settlement, domainB, hex, at, plan.SideBSurvivors, plan.LootTakenByWinner);
                break;

            case FieldBattleWinner.SideB:
                updatedA = ApplyLoss(armyA.Settlement, domainA, hex, at, plan.SideASurvivors, plan.LootTakenByWinner);
                updatedB = ApplyWin(domainB, movementB, plan.SideBSurvivors, plan.LootTakenByWinner);
                break;

            default:
                // A tie: no loot changes hands (issue #206 §3), both retreat.
                updatedA = ApplyLoss(armyA.Settlement, domainA, hex, at, plan.SideASurvivors, ResourceAmounts.Zero);
                updatedB = ApplyLoss(armyB.Settlement, domainB, hex, at, plan.SideBSurvivors, ResourceAmounts.Zero);
                break;
        }

        armyA.ApplyDomain(updatedA);
        armyB.ApplyDomain(updatedB);

        var report = FieldBattleReportEntity.FromDomain(
            Guid.CreateVersion7(), at, hex, armyA.Id, armyA.SettlementId, armyB.Id, armyB.SettlementId, plan, seed);
        _dbContext.FieldBattleReports.Add(report);

        _logger.LogInformation(
            "Field battle at ({Q},{R}) between army {ArmyA} and army {ArmyB}: {Winner} won "
                + "({PowerA} vs {PowerB}).",
            hex.Q, hex.R, armyA.Id, armyB.Id, plan.Winner, plan.SideAPower, plan.SideBPower);
    }

    private static Army ApplyWin(Army domain, Movement movement, IReadOnlyList<UnitStack> survivors, ResourceAmounts lootTaken) =>
        domain with
        {
            Stacks = survivors,
            Loot = domain.Loot + lootTaken,
            // The winner's own journey is untouched — it simply continues
            // wherever it was already headed (issue #206 §3).
            Location = new ArmyLocation.InTransit(movement),
        };

    private static Army ApplyLoss(
        SettlementEntity? loserSettlement,
        Army domain, HexCoord hex, DateTimeOffset at,
        IReadOnlyList<UnitStack> survivors, ResourceAmounts lootTakenFromThisSide)
    {
        var loserSampler = new TerrainSampler(loserSettlement!.World!.ToGenerationOptions());
        var home = new HexCoord(loserSettlement.CentreQ, loserSettlement.CentreR);

        var afterLosses = domain with
        {
            Stacks = survivors,
            Loot = (domain.Loot - lootTakenFromThisSide).ClampToZero(),
        };

        return afterLosses.ForceFieldRetreat(at, hex, home, loserSampler.TerrainAt, loserSettlement.World.SpeedFactor);
    }

    private static IReadOnlyList<PlacedBuilding> ToPlacedBuildings(IEnumerable<PlacedBuildingEntity> buildings) =>
        [.. buildings.Select(b => new PlacedBuilding(new HexCoord(b.Q, b.R), b.Type, b.Level))];
}
