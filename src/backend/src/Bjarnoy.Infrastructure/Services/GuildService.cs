using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Guilds;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// Why a guild operation was refused. Shared across every guild operation
/// rather than one enum per method (contrast <see cref="FoundingRejection"/>
/// and <see cref="BuildRejection"/>): a guild has many small operations and
/// most rejections (<see cref="Forbidden"/>, <see cref="NotAMember"/>,
/// <see cref="GuildNotFound"/>) recur across most of them.
/// </summary>
public enum GuildRejection
{
    None = 0,
    WorldNotFound,
    GuildNotFound,
    TargetGuildNotFound,
    NameTaken,
    TagTaken,
    AlreadyInAGuild,
    NotAMember,
    GuildFull,
    NotEnoughResources,
    NoSettlement,
    Forbidden,
    TargetIsSelf,
    TreatyCapReached,
    TreatyAlreadyActive,
    TreatyNotFound,
    TreatyNotPending,
    TopicNotFound,
    TopicLocked,
    LeaderCannotLeave,
}

public sealed record GuildResult(GuildRejection Rejection, GuildEntity? Guild = null)
{
    public bool Accepted => Rejection == GuildRejection.None && Guild is not null;
}

public sealed record GuildMembershipResult(GuildRejection Rejection, GuildMembershipEntity? Membership = null)
{
    public bool Accepted => Rejection == GuildRejection.None && Membership is not null;
}

public sealed record GuildBoardTopicResult(GuildRejection Rejection, GuildBoardTopicEntity? Topic = null)
{
    public bool Accepted => Rejection == GuildRejection.None && Topic is not null;
}

public sealed record GuildBoardPostResult(GuildRejection Rejection, GuildBoardPostEntity? Post = null)
{
    public bool Accepted => Rejection == GuildRejection.None && Post is not null;
}

public sealed record GuildTreatyResult(GuildRejection Rejection, GuildPeaceTreatyEntity? Treaty = null)
{
    public bool Accepted => Rejection == GuildRejection.None && Treaty is not null;
}

/// <summary>The perks and caps a guild's current fee tier and roster imply — see <see cref="GuildRules"/>.</summary>
public sealed record GuildPerksSummary(GuildPerks Perks, int MemberCap, int MaxActivePeaceTreaties);

/// <summary>
/// Guilds: founding, membership, the recurring fee, the message board, and
/// peace treaties between guilds. See docs/design/guild-alliance-system.md for
/// the full design and what v1 deliberately defers (invites/applications,
/// audit log, a shared guild bank, and more).
/// </summary>
public sealed class GuildService(
    GameDbContext dbContext,
    TimeProvider timeProvider,
    ILogger<GuildService> logger)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly ILogger<GuildService> _logger = logger;

    /// <summary>Founds a guild. The founder becomes its Leader.</summary>
    public async Task<GuildResult> CreateAsync(
        Guid worldId,
        Guid founderUserId,
        string name,
        string tag,
        string? description,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentException.ThrowIfNullOrWhiteSpace(tag);

        if (!await _dbContext.Worlds.AnyAsync(w => w.Id == worldId, cancellationToken).ConfigureAwait(false))
        {
            return new GuildResult(GuildRejection.WorldNotFound);
        }

        if (await _dbContext.GuildMemberships.AnyAsync(m => m.UserId == founderUserId, cancellationToken)
            .ConfigureAwait(false))
        {
            return new GuildResult(GuildRejection.AlreadyInAGuild);
        }

        var now = _timeProvider.GetUtcNow();
        var guild = new GuildEntity
        {
            WorldId = worldId,
            Name = name,
            Tag = tag,
            Description = description,
            FeeTier = GuildFeeTier.Copper,
            CreatedAt = now,
        };

        guild.Memberships.Add(new GuildMembershipEntity
        {
            GuildId = guild.Id,
            UserId = founderUserId,
            Role = GuildRole.Leader,
            JoinedAt = now,
        });

        _dbContext.Guilds.Add(guild);

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateException)
        {
            // Two founders raced on the same name/tag, or the same player
            // founded twice from two requests. The unique indexes are what
            // actually decided it, so re-read to see which before reporting.
            _dbContext.Entry(guild).State = EntityState.Detached;

            if (await _dbContext.Guilds.AnyAsync(
                g => g.WorldId == worldId && g.Name == name, cancellationToken).ConfigureAwait(false))
            {
                return new GuildResult(GuildRejection.NameTaken);
            }

            if (await _dbContext.Guilds.AnyAsync(
                g => g.WorldId == worldId && g.Tag == tag, cancellationToken).ConfigureAwait(false))
            {
                return new GuildResult(GuildRejection.TagTaken);
            }

            if (await _dbContext.GuildMemberships.AnyAsync(m => m.UserId == founderUserId, cancellationToken)
                .ConfigureAwait(false))
            {
                return new GuildResult(GuildRejection.AlreadyInAGuild);
            }

            throw;
        }

        _logger.LogInformation(
            "Guild {Name} ({Id}) founded by {UserId} in world {WorldId}.", name, guild.Id, founderUserId, worldId);

        return new GuildResult(GuildRejection.None, guild);
    }

    public Task<GuildEntity?> GetAsync(Guid guildId, CancellationToken cancellationToken = default) =>
        _dbContext.Guilds.AsNoTracking()
            .Include(g => g.Memberships)
            .FirstOrDefaultAsync(g => g.Id == guildId, cancellationToken);

    /// <summary>Active (not disbanded) guilds in a world.</summary>
    public Task<List<GuildEntity>> ListAsync(Guid worldId, CancellationToken cancellationToken = default) =>
        _dbContext.Guilds.AsNoTracking()
            .Include(g => g.Memberships)
            .Where(g => g.WorldId == worldId && g.DisbandedAt == null)
            .OrderBy(g => g.Id)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// The perks and caps a guild's fee tier currently unlocks — the single
    /// surface a future trade/army system reads instead of reaching into the
    /// guild module (see <see cref="GuildPerks"/>).
    /// </summary>
    public async Task<GuildPerksSummary?> GetPerksAsync(Guid guildId, CancellationToken cancellationToken = default)
    {
        var guild = await _dbContext.Guilds
            .Include(g => g.Memberships)
            .FirstOrDefaultAsync(g => g.Id == guildId, cancellationToken).ConfigureAwait(false);

        if (guild is null)
        {
            return null;
        }

        var highestLonghouse = await HighestLonghouseLevelAsync(
            guild.WorldId, guild.Memberships.Select(m => m.UserId), cancellationToken).ConfigureAwait(false);

        return new GuildPerksSummary(
            GuildRules.Perks(guild.FeeTier),
            GuildRules.MemberCap(guild.FeeTier, highestLonghouse),
            GuildRules.MaxActivePeaceTreaties(guild.FeeTier));
    }

    /// <summary>Joins a guild, refusing once its member cap (fee tier + highest longhouse level) is reached.</summary>
    public async Task<GuildMembershipResult> JoinAsync(
        Guid guildId, Guid userId, CancellationToken cancellationToken = default)
    {
        var guild = await _dbContext.Guilds
            .Include(g => g.Memberships)
            .FirstOrDefaultAsync(g => g.Id == guildId, cancellationToken).ConfigureAwait(false);

        if (guild is null || guild.DisbandedAt is not null)
        {
            return new GuildMembershipResult(GuildRejection.GuildNotFound);
        }

        if (await _dbContext.GuildMemberships.AnyAsync(m => m.UserId == userId, cancellationToken)
            .ConfigureAwait(false))
        {
            return new GuildMembershipResult(GuildRejection.AlreadyInAGuild);
        }

        var highestLonghouse = await HighestLonghouseLevelAsync(
            guild.WorldId, guild.Memberships.Select(m => m.UserId), cancellationToken).ConfigureAwait(false);
        var cap = GuildRules.MemberCap(guild.FeeTier, highestLonghouse);

        if (guild.Memberships.Count >= cap)
        {
            return new GuildMembershipResult(GuildRejection.GuildFull);
        }

        var membership = new GuildMembershipEntity
        {
            GuildId = guildId,
            UserId = userId,
            Role = GuildRole.Member,
            JoinedAt = _timeProvider.GetUtcNow(),
        };

        _dbContext.GuildMemberships.Add(membership);

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateException)
        {
            _dbContext.Entry(membership).State = EntityState.Detached;
            return new GuildMembershipResult(GuildRejection.AlreadyInAGuild);
        }

        _logger.LogInformation("User {UserId} joined guild {GuildId}.", userId, guildId);
        return new GuildMembershipResult(GuildRejection.None, membership);
    }

    /// <summary>
    /// Leaves a guild. The Leader may only leave alone (disbanding the guild);
    /// otherwise they must hand leadership to another member first via
    /// <see cref="SetRoleAsync"/>.
    /// </summary>
    public async Task<GuildMembershipResult> LeaveAsync(
        Guid guildId, Guid userId, CancellationToken cancellationToken = default)
    {
        var membership = await FindMembershipAsync(guildId, userId, cancellationToken).ConfigureAwait(false);
        if (membership is null)
        {
            return new GuildMembershipResult(GuildRejection.NotAMember);
        }

        if (membership.Role == GuildRole.Leader)
        {
            var otherMembers = await _dbContext.GuildMemberships
                .CountAsync(m => m.GuildId == guildId && m.UserId != userId, cancellationToken)
                .ConfigureAwait(false);

            if (otherMembers > 0)
            {
                return new GuildMembershipResult(GuildRejection.LeaderCannotLeave);
            }

            var guild = await _dbContext.Guilds
                .FirstAsync(g => g.Id == guildId, cancellationToken).ConfigureAwait(false);
            guild.DisbandedAt = _timeProvider.GetUtcNow();
        }

        _dbContext.GuildMemberships.Remove(membership);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation("User {UserId} left guild {GuildId}.", userId, guildId);
        return new GuildMembershipResult(GuildRejection.None, membership);
    }

    /// <summary>A Leader may kick anyone but themselves; an Officer may only kick a Member.</summary>
    public async Task<GuildMembershipResult> KickAsync(
        Guid guildId, Guid actingUserId, Guid targetUserId, CancellationToken cancellationToken = default)
    {
        if (actingUserId == targetUserId)
        {
            return new GuildMembershipResult(GuildRejection.Forbidden);
        }

        var acting = await FindMembershipAsync(guildId, actingUserId, cancellationToken).ConfigureAwait(false);
        var target = await FindMembershipAsync(guildId, targetUserId, cancellationToken).ConfigureAwait(false);

        if (target is null)
        {
            return new GuildMembershipResult(GuildRejection.NotAMember);
        }

        var allowed = acting?.Role switch
        {
            GuildRole.Leader => true,
            GuildRole.Officer => target.Role == GuildRole.Member,
            _ => false,
        };

        if (!allowed)
        {
            return new GuildMembershipResult(GuildRejection.Forbidden);
        }

        _dbContext.GuildMemberships.Remove(target);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "User {TargetUserId} was kicked from guild {GuildId} by {ActingUserId}.",
            targetUserId, guildId, actingUserId);

        return new GuildMembershipResult(GuildRejection.None, target);
    }

    /// <summary>
    /// Sets a member's role. Only the Leader may call this. Promoting someone
    /// else to Leader demotes the acting Leader to Officer — this is the only
    /// leadership transfer path in v1.
    /// </summary>
    public async Task<GuildMembershipResult> SetRoleAsync(
        Guid guildId, Guid actingUserId, Guid targetUserId, GuildRole role, CancellationToken cancellationToken = default)
    {
        if (!await IsLeaderAsync(guildId, actingUserId, cancellationToken).ConfigureAwait(false))
        {
            return new GuildMembershipResult(GuildRejection.Forbidden);
        }

        var target = await FindMembershipAsync(guildId, targetUserId, cancellationToken).ConfigureAwait(false);
        if (target is null)
        {
            return new GuildMembershipResult(GuildRejection.NotAMember);
        }

        if (role == GuildRole.Leader && target.UserId != actingUserId)
        {
            var currentLeader = await FindMembershipAsync(guildId, actingUserId, cancellationToken)
                .ConfigureAwait(false);
            if (currentLeader is not null)
            {
                currentLeader.Role = GuildRole.Officer;
            }
        }

        target.Role = role;
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Guild {GuildId}: {TargetUserId} set to {Role} by {ActingUserId}.",
            guildId, targetUserId, role, actingUserId);

        return new GuildMembershipResult(GuildRejection.None, target);
    }

    /// <summary>Changes a guild's fee tier. Only the Leader may call this.</summary>
    /// <remarks>
    /// Lowering a tier below what the current roster or treaty count needs is
    /// allowed: nothing is auto-kicked and no treaty is auto-broken. The guild
    /// simply cannot accept new members or propose new treaties until it is
    /// back under the new, lower caps on its own — the "frozen state" from the
    /// design doc, which falls out of <see cref="JoinAsync"/> and
    /// <see cref="ProposeTreatyAsync"/> checking live caps rather than needing
    /// a separate mechanism.
    /// </remarks>
    public async Task<GuildResult> SetFeeTierAsync(
        Guid guildId, Guid actingUserId, GuildFeeTier tier, CancellationToken cancellationToken = default)
    {
        if (!await IsLeaderAsync(guildId, actingUserId, cancellationToken).ConfigureAwait(false))
        {
            return new GuildResult(GuildRejection.Forbidden);
        }

        var guild = await _dbContext.Guilds
            .FirstOrDefaultAsync(g => g.Id == guildId, cancellationToken).ConfigureAwait(false);
        if (guild is null)
        {
            return new GuildResult(GuildRejection.GuildNotFound);
        }

        guild.FeeTier = tier;
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation("Guild {GuildId} fee tier set to {Tier} by {ActingUserId}.", guildId, tier, actingUserId);
        return new GuildResult(GuildRejection.None, guild);
    }

    /// <summary>
    /// Pays the guild's current fee from the member's settlement in the
    /// guild's world, extending <see cref="GuildMembershipEntity.FeePaidThroughAt"/>
    /// by <see cref="GuildRules.FeePeriod"/>.
    /// </summary>
    public async Task<GuildMembershipResult> PayFeeAsync(
        Guid guildId, Guid userId, CancellationToken cancellationToken = default)
    {
        var membership = await _dbContext.GuildMemberships
            .Include(m => m.Guild)
            .FirstOrDefaultAsync(m => m.GuildId == guildId && m.UserId == userId, cancellationToken)
            .ConfigureAwait(false);

        if (membership?.Guild is null)
        {
            return new GuildMembershipResult(GuildRejection.NotAMember);
        }

        var settlement = await _dbContext.Settlements
            .Include(s => s.World)
            .Include(s => s.Buildings)
            .Include(s => s.Queue)
            .Include(s => s.Runes)
            .FirstOrDefaultAsync(
                s => s.UserId == userId && s.WorldId == membership.Guild.WorldId, cancellationToken)
            .ConfigureAwait(false);

        if (settlement?.World is null)
        {
            return new GuildMembershipResult(GuildRejection.NoSettlement);
        }

        var clock = settlement.World.ToClock();
        var now = clock.ToGameTime(_timeProvider.GetUtcNow());

        var settled = settlement.ToDomain().SettleTo(now, settlement.World.SpeedFactor).Settlement;
        var cost = GuildRules.FeeCost(membership.Guild.FeeTier);

        if (!settled.Resources.TrySpend(cost, now, out var paid))
        {
            settlement.ApplyDomain(settled);
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return new GuildMembershipResult(GuildRejection.NotEnoughResources);
        }

        settlement.ApplyDomain(settled with { Resources = paid });

        // A fee paid early stacks onto whatever time is left rather than being
        // wasted, but a very overdue member does not need to pay for the
        // missed days to catch up — the new period starts from now either way.
        var periodStart = membership.FeePaidThroughAt is { } paidThrough && paidThrough > now ? paidThrough : now;
        membership.FeePaidThroughAt = periodStart + GuildRules.FeePeriod;

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "User {UserId} paid the {Tier} guild fee for {GuildId}, covering through {Until}.",
            userId, membership.Guild.FeeTier, guildId, membership.FeePaidThroughAt);

        return new GuildMembershipResult(GuildRejection.None, membership);
    }

    /// <summary>Creates a board topic with its opening post.</summary>
    public async Task<GuildBoardTopicResult> CreateTopicAsync(
        Guid guildId,
        Guid authorUserId,
        string title,
        GuildBoardTopicKind kind,
        string body,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(title);
        ArgumentException.ThrowIfNullOrWhiteSpace(body);

        if (!await IsActiveMemberAsync(guildId, authorUserId, cancellationToken).ConfigureAwait(false))
        {
            return new GuildBoardTopicResult(GuildRejection.NotAMember);
        }

        var now = _timeProvider.GetUtcNow();
        var topic = new GuildBoardTopicEntity
        {
            GuildId = guildId,
            AuthorUserId = authorUserId,
            Title = title,
            Kind = kind,
            CreatedAt = now,
        };

        topic.Posts.Add(new GuildBoardPostEntity
        {
            TopicId = topic.Id,
            AuthorUserId = authorUserId,
            Body = body,
            CreatedAt = now,
        });

        _dbContext.GuildBoardTopics.Add(topic);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return new GuildBoardTopicResult(GuildRejection.None, topic);
    }

    /// <summary>Replies to a board topic. Refused once the topic is locked.</summary>
    public async Task<GuildBoardPostResult> ReplyAsync(
        Guid topicId, Guid authorUserId, string body, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(body);

        var topic = await _dbContext.GuildBoardTopics
            .FirstOrDefaultAsync(t => t.Id == topicId, cancellationToken).ConfigureAwait(false);
        if (topic is null)
        {
            return new GuildBoardPostResult(GuildRejection.TopicNotFound);
        }

        if (!await IsActiveMemberAsync(topic.GuildId, authorUserId, cancellationToken).ConfigureAwait(false))
        {
            return new GuildBoardPostResult(GuildRejection.NotAMember);
        }

        if (topic.Locked)
        {
            return new GuildBoardPostResult(GuildRejection.TopicLocked);
        }

        var post = new GuildBoardPostEntity
        {
            TopicId = topicId,
            AuthorUserId = authorUserId,
            Body = body,
            CreatedAt = _timeProvider.GetUtcNow(),
        };

        _dbContext.GuildBoardPosts.Add(post);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return new GuildBoardPostResult(GuildRejection.None, post);
    }

    // Ordered by Id, not CreatedAt: ids are UUIDv7 and therefore already
    // time-ordered, and SQLite cannot ORDER BY a DateTimeOffset (see
    // docs/tech/backend.md) — the same reason SettlementService pages by Id.
    public Task<List<GuildBoardTopicEntity>> GetTopicsAsync(
        Guid guildId, CancellationToken cancellationToken = default) =>
        _dbContext.GuildBoardTopics.AsNoTracking()
            .Where(t => t.GuildId == guildId)
            .OrderByDescending(t => t.Pinned).ThenByDescending(t => t.Id)
            .ToListAsync(cancellationToken);

    public Task<GuildBoardTopicEntity?> GetTopicAsync(
        Guid topicId, CancellationToken cancellationToken = default) =>
        _dbContext.GuildBoardTopics.AsNoTracking()
            .Include(t => t.Posts.OrderBy(p => p.Id))
            .FirstOrDefaultAsync(t => t.Id == topicId, cancellationToken);

    /// <summary>Proposes a peace treaty. Only a Leader or Officer of the proposing guild may call this.</summary>
    public async Task<GuildTreatyResult> ProposeTreatyAsync(
        Guid proposerGuildId, Guid targetGuildId, Guid proposedByUserId, CancellationToken cancellationToken = default)
    {
        if (proposerGuildId == targetGuildId)
        {
            return new GuildTreatyResult(GuildRejection.TargetIsSelf);
        }

        if (!await IsOfficerOrLeaderAsync(proposerGuildId, proposedByUserId, cancellationToken).ConfigureAwait(false))
        {
            return new GuildTreatyResult(GuildRejection.Forbidden);
        }

        var proposer = await _dbContext.Guilds
            .FirstOrDefaultAsync(g => g.Id == proposerGuildId && g.DisbandedAt == null, cancellationToken)
            .ConfigureAwait(false);
        if (proposer is null)
        {
            return new GuildTreatyResult(GuildRejection.GuildNotFound);
        }

        var targetExists = await _dbContext.Guilds
            .AnyAsync(g => g.Id == targetGuildId && g.DisbandedAt == null, cancellationToken).ConfigureAwait(false);
        if (!targetExists)
        {
            return new GuildTreatyResult(GuildRejection.TargetGuildNotFound);
        }

        var existing = await _dbContext.GuildPeaceTreaties.AnyAsync(
            t => ((t.ProposerGuildId == proposerGuildId && t.TargetGuildId == targetGuildId)
                    || (t.ProposerGuildId == targetGuildId && t.TargetGuildId == proposerGuildId))
                && (t.Status == PeaceTreatyStatus.Proposed || t.Status == PeaceTreatyStatus.Active),
            cancellationToken).ConfigureAwait(false);

        if (existing)
        {
            return new GuildTreatyResult(GuildRejection.TreatyAlreadyActive);
        }

        var proposerActive = await ActiveTreatyCountAsync(proposerGuildId, cancellationToken).ConfigureAwait(false);
        if (proposerActive >= GuildRules.MaxActivePeaceTreaties(proposer.FeeTier))
        {
            return new GuildTreatyResult(GuildRejection.TreatyCapReached);
        }

        var treaty = new GuildPeaceTreatyEntity
        {
            ProposerGuildId = proposerGuildId,
            TargetGuildId = targetGuildId,
            ProposedByUserId = proposedByUserId,
            Status = PeaceTreatyStatus.Proposed,
            ProposedAt = _timeProvider.GetUtcNow(),
        };

        _dbContext.GuildPeaceTreaties.Add(treaty);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Guild {ProposerGuildId} proposed peace to {TargetGuildId} ({TreatyId}).",
            proposerGuildId, targetGuildId, treaty.Id);

        return new GuildTreatyResult(GuildRejection.None, treaty);
    }

    /// <summary>Accepts or rejects a pending treaty proposal. Only a Leader or Officer of the target guild may call this.</summary>
    public async Task<GuildTreatyResult> RespondTreatyAsync(
        Guid treatyId, Guid respondingUserId, bool accept, CancellationToken cancellationToken = default)
    {
        var treaty = await _dbContext.GuildPeaceTreaties
            .FirstOrDefaultAsync(t => t.Id == treatyId, cancellationToken).ConfigureAwait(false);
        if (treaty is null)
        {
            return new GuildTreatyResult(GuildRejection.TreatyNotFound);
        }

        if (treaty.Status != PeaceTreatyStatus.Proposed)
        {
            return new GuildTreatyResult(GuildRejection.TreatyNotPending);
        }

        if (!await IsOfficerOrLeaderAsync(treaty.TargetGuildId, respondingUserId, cancellationToken)
            .ConfigureAwait(false))
        {
            return new GuildTreatyResult(GuildRejection.Forbidden);
        }

        if (accept)
        {
            var target = await _dbContext.Guilds
                .FirstOrDefaultAsync(g => g.Id == treaty.TargetGuildId, cancellationToken).ConfigureAwait(false);
            if (target is null)
            {
                return new GuildTreatyResult(GuildRejection.GuildNotFound);
            }

            // This proposal is itself already counted (its Status is still
            // Proposed here), so the cap it must fit within is compared
            // inclusively rather than needing +1.
            var targetActive = await ActiveTreatyCountAsync(treaty.TargetGuildId, cancellationToken)
                .ConfigureAwait(false);
            if (targetActive > GuildRules.MaxActivePeaceTreaties(target.FeeTier))
            {
                return new GuildTreatyResult(GuildRejection.TreatyCapReached);
            }

            treaty.Status = PeaceTreatyStatus.Active;
        }
        else
        {
            treaty.Status = PeaceTreatyStatus.Rejected;
        }

        treaty.RespondedAt = _timeProvider.GetUtcNow();
        treaty.RespondedByUserId = respondingUserId;

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return new GuildTreatyResult(GuildRejection.None, treaty);
    }

    /// <summary>Breaks an active treaty. Only a Leader of either guild may call this.</summary>
    public async Task<GuildTreatyResult> BreakTreatyAsync(
        Guid treatyId, Guid actingUserId, CancellationToken cancellationToken = default)
    {
        var treaty = await _dbContext.GuildPeaceTreaties
            .FirstOrDefaultAsync(t => t.Id == treatyId, cancellationToken).ConfigureAwait(false);
        if (treaty is null)
        {
            return new GuildTreatyResult(GuildRejection.TreatyNotFound);
        }

        if (treaty.Status != PeaceTreatyStatus.Active)
        {
            return new GuildTreatyResult(GuildRejection.TreatyNotPending);
        }

        var isLeaderOfEither =
            await IsLeaderAsync(treaty.ProposerGuildId, actingUserId, cancellationToken).ConfigureAwait(false)
            || await IsLeaderAsync(treaty.TargetGuildId, actingUserId, cancellationToken).ConfigureAwait(false);

        if (!isLeaderOfEither)
        {
            return new GuildTreatyResult(GuildRejection.Forbidden);
        }

        treaty.Status = PeaceTreatyStatus.Broken;
        treaty.RespondedAt = _timeProvider.GetUtcNow();
        treaty.RespondedByUserId = actingUserId;

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation("Treaty {TreatyId} broken by {ActingUserId}.", treatyId, actingUserId);
        return new GuildTreatyResult(GuildRejection.None, treaty);
    }

    /// <summary>Every treaty (any status) a guild is party to, newest first.</summary>
    public Task<List<GuildPeaceTreatyEntity>> GetTreatiesAsync(
        Guid guildId, CancellationToken cancellationToken = default) =>
        _dbContext.GuildPeaceTreaties.AsNoTracking()
            .Where(t => t.ProposerGuildId == guildId || t.TargetGuildId == guildId)
            // By Id, not ProposedAt — see GetTopicsAsync.
            .OrderByDescending(t => t.Id)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// The highest Longhouse level among the given users' settlements in a
    /// world — the sole input to <see cref="GuildRules.MemberCap"/> today. See
    /// its remarks for how this indirection is meant to be replaced if a
    /// dedicated civic building takes over the role later.
    /// </summary>
    private async Task<int> HighestLonghouseLevelAsync(
        Guid worldId, IEnumerable<Guid> userIds, CancellationToken cancellationToken)
    {
        var ids = userIds.ToList();
        if (ids.Count == 0)
        {
            return 0;
        }

        var levels = await _dbContext.PlacedBuildings
            .Where(b => b.Type == BuildingType.Longhouse
                && b.Settlement!.WorldId == worldId
                && ids.Contains(b.Settlement!.UserId))
            .Select(b => b.Level)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return levels.Count == 0 ? 0 : levels.Max();
    }

    private Task<bool> IsActiveMemberAsync(Guid guildId, Guid userId, CancellationToken cancellationToken) =>
        _dbContext.GuildMemberships.AnyAsync(m => m.GuildId == guildId && m.UserId == userId, cancellationToken);

    private Task<GuildMembershipEntity?> FindMembershipAsync(
        Guid guildId, Guid userId, CancellationToken cancellationToken) =>
        _dbContext.GuildMemberships.FirstOrDefaultAsync(
            m => m.GuildId == guildId && m.UserId == userId, cancellationToken);

    private async Task<bool> IsLeaderAsync(Guid guildId, Guid userId, CancellationToken cancellationToken)
    {
        var membership = await FindMembershipAsync(guildId, userId, cancellationToken).ConfigureAwait(false);
        return membership?.Role == GuildRole.Leader;
    }

    private async Task<bool> IsOfficerOrLeaderAsync(Guid guildId, Guid userId, CancellationToken cancellationToken)
    {
        var membership = await FindMembershipAsync(guildId, userId, cancellationToken).ConfigureAwait(false);
        return membership is not null && membership.Role is GuildRole.Leader or GuildRole.Officer;
    }

    private Task<int> ActiveTreatyCountAsync(Guid guildId, CancellationToken cancellationToken) =>
        _dbContext.GuildPeaceTreaties.CountAsync(
            t => (t.ProposerGuildId == guildId || t.TargetGuildId == guildId)
                && (t.Status == PeaceTreatyStatus.Proposed || t.Status == PeaceTreatyStatus.Active),
            cancellationToken);
}
