using Bjarnoy.Domain.Ai;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>Why <see cref="AiTakeoverService.TakeOverAsync"/> did not create an AI player.</summary>
public enum TakeoverOutcome
{
    Applied,
    NotFound,

    /// <summary>
    /// The settlement is not currently owned by <see cref="SystemUserIds.Abandoned"/>
    /// — either a real (claimed) account already owns it, or an earlier
    /// takeover already handed it to an AI jarl. Both read the same way here:
    /// only an anonymous settlement is ever eligible — see
    /// <c>docs/design/ai-players.md</c>'s "Takeover rule".
    /// </summary>
    NotAnonymous,
}

public sealed record TakeoverResult(
    TakeoverOutcome Outcome, AiPlayerEntity? AiPlayer = null, SettlementEntity? Settlement = null)
{
    public bool Accepted => Outcome == TakeoverOutcome.Applied && AiPlayer is not null;
}

/// <summary>
/// Hands an abandoned settlement to a newly created AI account — see
/// <c>docs/design/ai-players.md</c>'s "Takeover rule". <see cref="RunAsync"/>
/// is the periodic sweep (<c>AiPlayersHostedService</c>); <see cref="TakeOverAsync"/>
/// is also the method a later admin "take over now" endpoint calls directly,
/// skipping only the inactivity threshold — every other eligibility rule
/// (anonymous-owned, i.e. still <see cref="SystemUserIds.Abandoned"/>) is
/// shared between both paths.
/// </summary>
public sealed class AiTakeoverService(
    GameDbContext dbContext,
    TimeProvider timeProvider,
    IOptions<AiPlayersOptions> options,
    ILogger<AiTakeoverService> logger)
{
    /// <summary>
    /// Old Norse-flavoured given names an AI jarl's display name is drawn
    /// from ("Jarl {Name}"), picked deterministically from the taken-over
    /// settlement's id (see <see cref="GenerateUniqueNameAsync"/>) so the same
    /// settlement always proposes the same first candidate name.
    /// </summary>
    private static readonly IReadOnlyList<string> NorseNames =
    [
        "Bjorn", "Ragnar", "Ivar", "Leif", "Erik", "Sven", "Harald", "Gunnar", "Olaf", "Halvar",
        "Thorstein", "Ulf", "Sigurd", "Knut", "Vidar", "Bragi", "Skarde", "Frode", "Rurik", "Torvald",
        "Eskil", "Hakon", "Bard", "Steinar", "Aslak", "Kettil", "Alrik", "Yngvar", "Osvald", "Tryggve",
    ];

    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly AiPlayersOptions _options = options.Value;
    private readonly ILogger<AiTakeoverService> _logger = logger;

    /// <summary>
    /// Takes over every settlement that is both anonymous-owned and abandoned
    /// long enough, in a world that is currently running. Returns how many
    /// were taken over. A failure on one settlement is logged and skipped —
    /// it never stops the sweep from reaching the rest.
    /// </summary>
    public async Task<int> RunAsync(CancellationToken cancellationToken = default)
    {
        if (!_options.Enabled)
        {
            return 0;
        }

        var now = _timeProvider.GetUtcNow();
        var cutoff = now - _options.TakeoverAfter;

        // EF Core's SQLite provider cannot translate a relational comparison
        // on a DateTimeOffset column (see UserActivityRetentionService's own
        // remarks) — the cutoff/world-state filter happens in memory, over
        // just the columns needed to decide it.
        var candidates = await _dbContext.Settlements
            .AsNoTracking()
            .Where(s => s.UserId == SystemUserIds.Abandoned)
            .Select(s => new
            {
                s.Id,
                s.LastOwnerActivityAt,
                RunState = s.World!.RunState,
                s.World.EndbossTriggeredAt,
            })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var due = candidates
            .Where(c => c.LastOwnerActivityAt < cutoff
                && c.RunState == WorldRunState.Running
                && c.EndbossTriggeredAt is null)
            .Select(c => c.Id)
            .ToList();

        var takenOver = 0;
        foreach (var settlementId in due)
        {
            try
            {
                var result = await TakeOverAsync(settlementId, personality: null, cancellationToken)
                    .ConfigureAwait(false);
                if (result.Accepted)
                {
                    takenOver++;
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Takeover of settlement {SettlementId} failed; skipping.", settlementId);
            }
        }

        return takenOver;
    }

    /// <summary>
    /// Takes over one settlement right now, regardless of how long it has
    /// been abandoned — <see cref="RunAsync"/>'s per-settlement worker, and
    /// the method a future admin "take over now" endpoint calls directly.
    /// </summary>
    public async Task<TakeoverResult> TakeOverAsync(
        Guid settlementId, AiPersonality? personality, CancellationToken cancellationToken = default)
    {
        var settlement = await _dbContext.Settlements
            .FirstOrDefaultAsync(s => s.Id == settlementId, cancellationToken)
            .ConfigureAwait(false);

        if (settlement is null)
        {
            return new TakeoverResult(TakeoverOutcome.NotFound);
        }

        if (settlement.UserId != SystemUserIds.Abandoned)
        {
            return new TakeoverResult(TakeoverOutcome.NotAnonymous);
        }

        var now = _timeProvider.GetUtcNow();
        var chosenPersonality = personality ?? PickPersonality(settlementId);
        var aiName = await GenerateUniqueNameAsync(settlementId, cancellationToken).ConfigureAwait(false);

        var user = new UserEntity
        {
            UserName = aiName,
            NormalizedUserName = aiName.ToLowerInvariant(),
            // Never a real hash any hasher produces, and AuthService.LoginAsync
            // additionally refuses any IsSystem user outright — same posture
            // as the seeded system accounts in GameDbContext.OnModelCreating.
            PasswordHash = "SYSTEM-ACCOUNT-NO-LOGIN",
            Role = UserRole.Player,
            Status = UserStatus.Active,
            IsSystem = true,
            CreatedAt = now,
            RenownSettledAt = now,
        };
        _dbContext.Users.Add(user);

        settlement.UserId = user.Id;
        settlement.OwnerId = $"ai:{user.Id}";
        settlement.OwnerName = aiName;

        var profile = AiProfiles.For(chosenPersonality);
        var aiPlayer = new AiPlayerEntity
        {
            UserId = user.Id,
            WorldId = settlement.WorldId,
            Personality = chosenPersonality,
            Objectives = [.. profile.DefaultObjectives],
            NextActAt = now,
            CreatedAt = now,
            TakenOverSettlementId = settlementId,
        };
        _dbContext.AiPlayers.Add(aiPlayer);

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Settlement {SettlementId} taken over by AI jarl {Name} ({Personality}).",
            settlementId, aiName, chosenPersonality);

        return new TakeoverResult(TakeoverOutcome.Applied, aiPlayer, settlement);
    }

    /// <summary>
    /// Weighted-random personality pick, seeded from the settlement's own id
    /// so a given takeover is reproducible in a test without threading a
    /// shared <see cref="Random"/> through the service — see
    /// <c>AiPlayersOptions.PersonalityWeights</c>. A personality missing from
    /// the configured weights (including every one of them, when the section
    /// is empty) gets weight 1.
    /// </summary>
    private AiPersonality PickPersonality(Guid settlementId)
    {
        var weights = Enum.GetValues<AiPersonality>()
            .Select(p => (Personality: p, Weight: _options.PersonalityWeights.GetValueOrDefault(p, 1.0)))
            .Where(w => w.Weight > 0)
            .ToList();

        if (weights.Count == 0)
        {
            return AiPersonality.Balanced;
        }

        var totalWeight = weights.Sum(w => w.Weight);
        var rng = new Random(settlementId.GetHashCode());
        var roll = rng.NextDouble() * totalWeight;

        var cumulative = 0.0;
        foreach (var (personalityCandidate, weight) in weights)
        {
            cumulative += weight;
            if (roll < cumulative)
            {
                return personalityCandidate;
            }
        }

        return weights[^1].Personality;
    }

    /// <summary>
    /// A display name of the form "Jarl {Name}", deterministically chosen
    /// from the settlement's id, with a numeric suffix appended on a
    /// collision against <see cref="UserEntity.NormalizedUserName"/>'s unique
    /// index.
    /// </summary>
    private async Task<string> GenerateUniqueNameAsync(Guid settlementId, CancellationToken cancellationToken)
    {
        var rng = new Random(settlementId.GetHashCode());
        var baseName = $"Jarl {NorseNames[rng.Next(NorseNames.Count)]}";

        var candidate = baseName;
        var suffix = 1;
        while (await _dbContext.Users
            .AnyAsync(u => u.NormalizedUserName == candidate.ToLowerInvariant(), cancellationToken)
            .ConfigureAwait(false))
        {
            suffix++;
            candidate = $"{baseName} {suffix}";
        }

        return candidate;
    }
}
