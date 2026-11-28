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

/// <summary>What <see cref="FieldBattleService.TryResolveAsync"/> did to the army it was called for.</summary>
public enum FieldBattleOutcome
{
    /// <summary>No battle happened; the army is untouched.</summary>
    None,

    /// <summary>A battle was fought and the army has survivors (marching on or retreating); its row is kept.</summary>
    Fought,

    /// <summary>A battle was fought and every unit of the army fell; its row is removed.</summary>
    ArmyDestroyed,
}

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
    /// <see cref="FieldBattleOutcome.Fought"/> or <see cref="FieldBattleOutcome.ArmyDestroyed"/> if a battle was found, claimed,
    /// and applied — <paramref name="army"/> and the other side's <see cref="ArmyEntity"/> (also added to this context) now carry
    /// the post-battle state, a side that lost every unit is removed from the context, and a <see cref="FieldBattleReportEntity"/>
    /// was added; the caller still owns calling <c>SaveChangesAsync</c>. <see cref="FieldBattleOutcome.None"/> means either
    /// nothing was found, or a concurrent request already claimed the one meeting that was found — in both cases
    /// <paramref name="army"/> is untouched and the caller's normal settle logic should proceed as if this call had never happened.
    /// </returns>
    public async Task<FieldBattleOutcome> TryResolveAsync(
        ArmyEntity army, Army domain, DateTimeOffset now, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(army);
        ArgumentNullException.ThrowIfNull(domain);

        if (domain.Location is not ArmyLocation.InTransit { Movement: var movement })
        {
            return FieldBattleOutcome.None;
        }

        // The army's own world and owner: an army without a home has them too.
        var worldId = army.WorldId;
        var homeA = domain.HomeSpot;

        var candidates = await _dbContext.Armies
            .Include(a => a.Stacks)
            .Include(a => a.World)
            .Include(a => a.Settlement!).ThenInclude(s => s.Buildings)
            .Where(a => a.Id != army.Id
                && !a.AtHome
                && !a.IsSupporting
                && a.WorldId == worldId)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var userIds = candidates.Select(a => a.UserId).Append(army.UserId).Distinct().ToList();
        var guildOf = await _dbContext.Users
            .AsNoTracking()
            .Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.GuildId, cancellationToken).ConfigureAwait(false);

        (ArmyEntity Other, Army OtherDomain, Movement OtherMovement, HexCoord Hex, DateTimeOffset At)? earliest = null;

        foreach (var other in candidates)
        {
            if (!FieldBattleResolver.IsHostile(
                    army.UserId, guildOf.GetValueOrDefault(army.UserId),
                    other.UserId, guildOf.GetValueOrDefault(other.UserId)))
            {
                continue;
            }

            var otherDomain = other.ToDomain();
            if (otherDomain.Location is not ArmyLocation.InTransit { Movement: var otherMovement })
            {
                continue;
            }

            var homeB = otherDomain.HomeSpot;
            // An army fleeing a lost field battle cannot be fought until its protection ends (docs/design/troop-movement-range.md §2a).
            var notBefore = Max(movement.FieldBattleImmuneUntil, otherMovement.FieldBattleImmuneUntil);
            var meeting = MovementOccupancy.EarliestMeeting(movement, otherMovement, homeA, homeB, notBefore);
            if (meeting is not { } found || found.At > now)
            {
                continue;
            }

            // A stranded army that has starved by then is no longer there to fight, on either side.
            if (found.At >= domain.StarvesAt || found.At >= otherDomain.StarvesAt)
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
            return FieldBattleOutcome.None;
        }

        if (!await TryClaimAsync(army.Id, chosen.Other.Id, chosen.At, cancellationToken).ConfigureAwait(false))
        {
            // Someone else (a concurrent request touching either army) is
            // already resolving this exact meeting — back off, nothing to
            // apply on our side.
            return FieldBattleOutcome.None;
        }

        var giants = await LoadGiantIndexAsync(worldId, cancellationToken).ConfigureAwait(false);
        var realms = await PlayerRealms.ForWorldAsync(_dbContext, worldId, cancellationToken).ConfigureAwait(false);
        var bog = await WorldTerrain.OverlayAsync(_dbContext, worldId, cancellationToken).ConfigureAwait(false);
        var rivers = await WorldRivers.IndexAsync(_dbContext, worldId, cancellationToken).ConfigureAwait(false);
        var walls = await WorldBridges.RouteIndexAsync(
            _dbContext, worldId, new TerrainSampler(army.World!.ToGenerationOptions()).WithBogOverlay(bog).TerrainAt,
            rivers.IsWide, chosen.At, cancellationToken).ConfigureAwait(false);
        var destroyed = Resolve(
            army, domain, movement, chosen.Other, chosen.OtherDomain, chosen.OtherMovement, chosen.Hex, chosen.At, giants, bog, rivers, walls, realms);
        return destroyed ? FieldBattleOutcome.ArmyDestroyed : FieldBattleOutcome.Fought;
    }

    /// <summary>Every giant across every island of <paramref name="worldId"/> — see <c>ArmyService.LoadGiantIndexAsync</c>.</summary>
    private async Task<IGiantIndex> LoadGiantIndexAsync(Guid worldId, CancellationToken cancellationToken)
    {
        var islands = await _dbContext.Islands
            .AsNoTracking()
            .Where(i => i.WorldId == worldId)
            .Select(i => i.Giants)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var giants = islands
            .SelectMany(g => g)
            .Select(g => new Giant(new HexCoord(g.Q, g.R), g.Family, (TileOrientation)g.Orientation))
            .ToList();

        return new GiantIndex(giants);
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
        catch (DbUpdateException ex) when (!ConcurrentWriteExecutor.IsRetryable(ex))
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
    /// <c>SaveChangesAsync</c>. A side that lost every unit is removed instead of retreating.
    /// </summary>
    /// <returns>Whether <paramref name="armyA"/> lost every unit (its row is removed).</returns>
    private bool Resolve(
        ArmyEntity armyA, Army domainA, Movement movementA,
        ArmyEntity armyB, Army domainB, Movement movementB,
        HexCoord hex, DateTimeOffset at, IGiantIndex giants, IReadOnlyDictionary<HexCoord, Terrain> bog,
        RiverIndex rivers, LandRouteIndex walls, IReadOnlyDictionary<Guid, ConnectedRealm> realms)
    {
        var claimA = ClaimOf(armyA, hex, giants, realms);
        var claimB = ClaimOf(armyB, hex, giants, realms);

        var seed = BitConverter.ToInt32(ClaimId(armyA.Id, armyB.Id, at).ToByteArray(), 0);

        var plan = FieldBattleResolver.Resolve(
            domainA.Stacks, claimA, domainB.Stacks, claimB, domainA.Loot, domainB.Loot,
            domainA.ProvisionsAt(at), domainB.ProvisionsAt(at), seed);

        // A side that lost every unit is gone: no retreat is worked out for it (an army without units has no speed, and without upkeep
        // it would never starve either). A tie takes no loot from either side (issue #206 §3), both retreat.
        Army? updatedA = plan.SideASurvivors.Sum(u => u.Count) <= 0
            ? null
            : plan.Winner == FieldBattleWinner.SideA
                ? ApplyWin(domainA, movementA, plan.SideASurvivors, plan.LootTakenByWinner, plan.FoodRefillToWinner, at)
                : ApplyLoss(armyA, domainA, hex, at, plan.SideASurvivors,
                    plan.Winner == FieldBattleWinner.SideB ? TakenFromLoser(plan) : ResourceAmounts.Zero, bog, rivers, walls);
        Army? updatedB = plan.SideBSurvivors.Sum(u => u.Count) <= 0
            ? null
            : plan.Winner == FieldBattleWinner.SideB
                ? ApplyWin(domainB, movementB, plan.SideBSurvivors, plan.LootTakenByWinner, plan.FoodRefillToWinner, at)
                : ApplyLoss(armyB, domainB, hex, at, plan.SideBSurvivors,
                    plan.Winner == FieldBattleWinner.SideA ? TakenFromLoser(plan) : ResourceAmounts.Zero, bog, rivers, walls);

        var destroyedA = ApplyOrRemove(armyA, updatedA, movementA, at);
        var destroyedB = ApplyOrRemove(armyB, updatedB, movementB, at);

        var report = FieldBattleReportEntity.FromDomain(
            Guid.CreateVersion7(), at, hex, armyA.Id, armyA.SettlementId ?? Guid.Empty, armyB.Id, armyB.SettlementId ?? Guid.Empty, plan, seed);
        report.WorldId = armyA.WorldId;
        report.SideAOwnerId = armyA.OwnerId;
        report.SideBOwnerId = armyB.OwnerId;
        _dbContext.FieldBattleReports.Add(report);

        _logger.LogInformation(
            "Field battle at ({Q},{R}) between army {ArmyA} and army {ArmyB}: {Winner} won "
                + "({PowerA} vs {PowerB}).",
            hex.Q, hex.R, armyA.Id, armyB.Id, plan.Winner, plan.SideAPower, plan.SideBPower);
        if (destroyedA || destroyedB)
        {
            _logger.LogInformation(
                "Field battle at ({Q},{R}) wiped out {Destroyed}.",
                hex.Q, hex.R, string.Join(" and ", new[] { (destroyedA, armyA.Id), (destroyedB, armyB.Id) }.Where(d => d.Item1).Select(d => d.Item2)));
        }

        return destroyedA;
    }

    /// <summary>
    /// Stores <paramref name="updated"/> on <paramref name="entity"/>, or — when no unit of it is left (<see langword="null"/>) —
    /// removes the row where the battle caught it.
    /// </summary>
    /// <returns>Whether the row was removed.</returns>
    private bool ApplyOrRemove(ArmyEntity entity, Army? updated, Movement movement, DateTimeOffset at)
    {
        if (updated is not null)
        {
            entity.ApplyDomain(updated);
            return false;
        }

        // The ground it crossed up to the battle still counts as explored.
        entity.WalkedLegs.Add(new WalkedLeg(movement, at));
        _dbContext.Armies.Remove(entity);
        return true;
    }

    /// <summary>
    /// The claim <paramref name="army"/> fights with at <paramref name="hex"/>: its home settlement's (<see cref="FieldBattleResolver.ClaimAt"/>).
    /// An army without a home has no settlement behind it, so no claim.
    /// </summary>
    private static FieldBattleClaim ClaimOf(
        ArmyEntity army, HexCoord hex, IGiantIndex giants, IReadOnlyDictionary<Guid, ConnectedRealm> realms) =>
        army.Settlement is { } home
            ? FieldBattleResolver.ClaimAt(
                hex, new HexCoord(home.CentreQ, home.CentreR), home.Buildings.Select(b => b.ToPlacedBuilding()).ToList(), giants,
                realms.GetValueOrDefault(home.Id), home.Id)
            : FieldBattleClaim.None;

    private static DateTimeOffset? Max(DateTimeOffset? a, DateTimeOffset? b) =>
        a is { } x && b is { } y ? (x > y ? x : y) : a ?? b;

    /// <summary>What the winner took from the loser's carried loot: the loot and the food that refilled its provisions.</summary>
    private static ResourceAmounts TakenFromLoser(FieldBattlePlan plan) =>
        plan.LootTakenByWinner + new ResourceAmounts(0, 0, plan.FoodRefillToWinner, 0);

    private static Army ApplyWin(
        Army domain, Movement movement, IReadOnlyList<UnitStack> survivors, ResourceAmounts lootTaken, double foodRefill,
        DateTimeOffset at) =>
        // The refill tops the provisions up, on top of the loot. The stored figure is the leg's departure baseline and the survivors
        // burn less than the full army did, so it is rebased: what the army carried at the battle, plus the refill, from `at` on.
        (domain with
        {
            Stacks = survivors,
            Loot = domain.Loot + lootTaken,
            // The winner's own journey is untouched — it simply continues
            // wherever it was already headed (issue #206 §3).
            Location = new ArmyLocation.InTransit(movement),
        }).WithProvisionsAt(at, domain.ProvisionsAt(at) + foodRefill);

    private static Army ApplyLoss(
        ArmyEntity loser,
        Army domain, HexCoord hex, DateTimeOffset at,
        IReadOnlyList<UnitStack> survivors, ResourceAmounts lootTakenFromThisSide,
        IReadOnlyDictionary<HexCoord, Terrain> bog, RiverIndex rivers, LandRouteIndex walls)
    {
        var loserSampler = new TerrainSampler(loser.World!.ToGenerationOptions()).WithBogOverlay(bog);
        var home = domain.Home;

        var afterLosses = domain with
        {
            Stacks = survivors,
            Loot = (domain.Loot - lootTakenFromThisSide).ClampToZero(),
        };

        return afterLosses.ForceFieldRetreat(at, hex, home, loserSampler.TerrainAt, loser.World.SpeedFactor, rivers.IsRiver, rivers.IsWide,
            walls.ForOwner(loser.WallOwnerKey),
            provisionsAtBattle: domain.ProvisionsAt(at));
    }
}
