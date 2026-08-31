using System.Security.Claims;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.Guilds;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// Guilds: founding, membership, the fee, the message board, and peace
/// treaties. Every mutating action needs a real account (unlike settlement
/// founding, which still allows anonymous play), so every route here requires
/// authentication; read routes are opened back up with <c>AllowAnonymous</c>.
/// </summary>
public static class GuildEndpoints
{
    public static IEndpointRouteBuilder MapGuildEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var worlds = app.MapGroup("/api/v1/worlds")
            .WithApiVersionSet(versionSet)
            .WithTags("Guilds")
            .RequireAuthorization();

        worlds.MapPost("/{worldId:guid}/guilds", Create)
            .WithName("CreateGuild")
            .WithSummary("Founds a guild in a world. The founder becomes its Leader.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        worlds.MapGet("/{worldId:guid}/guilds", ListForWorld)
            .WithName("ListWorldGuilds")
            .WithSummary("Lists the active guilds in a world.")
            .AllowAnonymous();

        var guilds = app.MapGroup("/api/v1/guilds")
            .WithApiVersionSet(versionSet)
            .WithTags("Guilds")
            .RequireAuthorization();

        guilds.MapGet("/{guildId:guid}", Get)
            .WithName("GetGuild")
            .WithSummary("Fetches a guild and its roster.")
            .AllowAnonymous();

        guilds.MapGet("/{guildId:guid}/perks", GetPerks)
            .WithName("GetGuildPerks")
            .WithSummary("The member cap, treaty cap and perks the guild's current fee tier unlocks.")
            .AllowAnonymous();

        guilds.MapPost("/{guildId:guid}/join", Join)
            .WithName("JoinGuild")
            .WithSummary("Joins a guild, refused once its member cap is reached.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        guilds.MapPost("/{guildId:guid}/leave", Leave)
            .WithName("LeaveGuild")
            .WithSummary("Leaves a guild. The Leader may only leave alone, which disbands the guild.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        guilds.MapPost("/{guildId:guid}/members/{userId:guid}/kick", Kick)
            .WithName("KickGuildMember")
            .WithSummary("Removes another member. Leader kicks anyone; Officer kicks Members only.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        guilds.MapPut("/{guildId:guid}/members/{userId:guid}/role", SetRole)
            .WithName("SetGuildMemberRole")
            .WithSummary("Sets a member's role. Leader-only; promoting to Leader transfers leadership.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        guilds.MapPut("/{guildId:guid}/fee-tier", SetFeeTier)
            .WithName("SetGuildFeeTier")
            .WithSummary("Changes the guild's fee tier. Leader-only.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        guilds.MapPost("/{guildId:guid}/fee-payment", PayFee)
            .WithName("PayGuildFee")
            .WithSummary("Pays the guild's current fee from the caller's settlement in that world.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        guilds.MapGet("/{guildId:guid}/board/topics", ListTopics)
            .WithName("ListGuildTopics")
            .WithSummary("Lists a guild's board topics, pinned first.")
            .AllowAnonymous();

        guilds.MapPost("/{guildId:guid}/board/topics", CreateTopic)
            .WithName("CreateGuildTopic")
            .WithSummary(
                "Starts a board topic with its opening post. Kind 'report' flags it for a future game-event-report feature.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        guilds.MapGet("/{guildId:guid}/board/topics/{topicId:guid}", GetTopic)
            .WithName("GetGuildTopic")
            .WithSummary("Fetches a topic and its posts.")
            .AllowAnonymous();

        guilds.MapPost("/{guildId:guid}/board/topics/{topicId:guid}/posts", Reply)
            .WithName("ReplyToGuildTopic")
            .WithSummary("Replies to a board topic.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        guilds.MapGet("/{guildId:guid}/treaties", ListTreaties)
            .WithName("ListGuildTreaties")
            .WithSummary("Lists every peace treaty (any status) a guild is party to.")
            .AllowAnonymous();

        guilds.MapPost("/{guildId:guid}/treaties", ProposeTreaty)
            .WithName("ProposeGuildTreaty")
            .WithSummary("Proposes a peace treaty to another guild. Leader/Officer only.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        var treaties = app.MapGroup("/api/v1/treaties")
            .WithApiVersionSet(versionSet)
            .WithTags("Guilds")
            .RequireAuthorization();

        treaties.MapPost("/{treatyId:guid}/accept", AcceptTreaty)
            .WithName("AcceptGuildTreaty")
            .WithSummary("Accepts a pending peace treaty proposal. Leader/Officer of the target guild only.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        treaties.MapPost("/{treatyId:guid}/reject", RejectTreaty)
            .WithName("RejectGuildTreaty")
            .WithSummary("Rejects a pending peace treaty proposal. Leader/Officer of the target guild only.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        treaties.MapPost("/{treatyId:guid}/break", BreakTreaty)
            .WithName("BreakGuildTreaty")
            .WithSummary("Breaks an active peace treaty. Leader of either guild only.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        return app;
    }

    private static async Task<Results<Created<GuildResponse>, ProblemHttpResult>> Create(
        Guid worldId,
        CreateGuildRequest request,
        ClaimsPrincipal principal,
        GuildService guilds,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var result = await guilds.CreateAsync(
            worldId, CurrentUserId(principal), request.Name, request.Tag, request.Description, cancellationToken);

        if (!result.Accepted)
        {
            return Problem(result.Rejection);
        }

        var guild = result.Guild!;
        return TypedResults.Created($"/api/v1/guilds/{guild.Id}", GuildResponse.From(guild, time.GetUtcNow()));
    }

    private static async Task<Results<Ok<GuildResponse>, NotFound>> Get(
        Guid guildId, GuildService guilds, TimeProvider time, CancellationToken cancellationToken)
    {
        var guild = await guilds.GetAsync(guildId, cancellationToken);
        return guild is null
            ? TypedResults.NotFound()
            : TypedResults.Ok(GuildResponse.From(guild, time.GetUtcNow()));
    }

    private static async Task<Ok<IReadOnlyList<GuildResponse>>> ListForWorld(
        Guid worldId, GuildService guilds, TimeProvider time, CancellationToken cancellationToken)
    {
        var list = await guilds.ListAsync(worldId, cancellationToken);
        var now = time.GetUtcNow();

        IReadOnlyList<GuildResponse> response = [.. list.Select(g => GuildResponse.From(g, now))];
        return TypedResults.Ok(response);
    }

    private static async Task<Results<Ok<GuildPerksResponse>, NotFound>> GetPerks(
        Guid guildId, GuildService guilds, CancellationToken cancellationToken)
    {
        var perks = await guilds.GetPerksAsync(guildId, cancellationToken);
        return perks is null ? TypedResults.NotFound() : TypedResults.Ok(GuildPerksResponse.From(perks));
    }

    private static async Task<Results<Ok<GuildMemberResponse>, ProblemHttpResult>> Join(
        Guid guildId, ClaimsPrincipal principal, GuildService guilds, TimeProvider time, CancellationToken cancellationToken)
    {
        var result = await guilds.JoinAsync(guildId, CurrentUserId(principal), cancellationToken);
        return result.Accepted
            ? TypedResults.Ok(GuildMemberResponse.From(result.Membership!, time.GetUtcNow()))
            : Problem(result.Rejection);
    }

    private static async Task<Results<Ok, ProblemHttpResult>> Leave(
        Guid guildId, ClaimsPrincipal principal, GuildService guilds, CancellationToken cancellationToken)
    {
        var result = await guilds.LeaveAsync(guildId, CurrentUserId(principal), cancellationToken);
        return result.Accepted ? TypedResults.Ok() : Problem(result.Rejection);
    }

    private static async Task<Results<Ok, ProblemHttpResult>> Kick(
        Guid guildId, Guid userId, ClaimsPrincipal principal, GuildService guilds, CancellationToken cancellationToken)
    {
        var result = await guilds.KickAsync(guildId, CurrentUserId(principal), userId, cancellationToken);
        return result.Accepted ? TypedResults.Ok() : Problem(result.Rejection);
    }

    private static async Task<Results<Ok<GuildMemberResponse>, BadRequest<ProblemDetails>, ProblemHttpResult>> SetRole(
        Guid guildId,
        Guid userId,
        SetGuildMemberRoleRequest request,
        ClaimsPrincipal principal,
        GuildService guilds,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!TryParseRole(request.Role, out var role))
        {
            return TypedResults.BadRequest(new ProblemDetails
            {
                Title = "Unknown guild role.",
                Detail = $"Valid: {string.Join(", ", Enum.GetValues<GuildRole>().Select(r => r.ToWireName()))}.",
                Status = StatusCodes.Status400BadRequest,
            });
        }

        var result = await guilds.SetRoleAsync(guildId, CurrentUserId(principal), userId, role, cancellationToken);
        return result.Accepted
            ? TypedResults.Ok(GuildMemberResponse.From(result.Membership!, time.GetUtcNow()))
            : Problem(result.Rejection);
    }

    private static async Task<Results<Ok<GuildResponse>, BadRequest<ProblemDetails>, ProblemHttpResult>> SetFeeTier(
        Guid guildId,
        SetGuildFeeTierRequest request,
        ClaimsPrincipal principal,
        GuildService guilds,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!TryParseFeeTier(request.FeeTier, out var tier))
        {
            return TypedResults.BadRequest(new ProblemDetails
            {
                Title = "Unknown fee tier.",
                Detail = $"Valid: {string.Join(", ", Enum.GetValues<GuildFeeTier>().Select(t => t.ToWireName()))}.",
                Status = StatusCodes.Status400BadRequest,
            });
        }

        var result = await guilds.SetFeeTierAsync(guildId, CurrentUserId(principal), tier, cancellationToken);
        return result.Accepted
            ? TypedResults.Ok(GuildResponse.From(result.Guild!, time.GetUtcNow()))
            : Problem(result.Rejection);
    }

    private static async Task<Results<Ok<GuildMemberResponse>, ProblemHttpResult>> PayFee(
        Guid guildId, ClaimsPrincipal principal, GuildService guilds, TimeProvider time, CancellationToken cancellationToken)
    {
        var result = await guilds.PayFeeAsync(guildId, CurrentUserId(principal), cancellationToken);
        return result.Accepted
            ? TypedResults.Ok(GuildMemberResponse.From(result.Membership!, time.GetUtcNow()))
            : Problem(result.Rejection);
    }

    private static async Task<Ok<IReadOnlyList<GuildBoardTopicResponse>>> ListTopics(
        Guid guildId, GuildService guilds, CancellationToken cancellationToken)
    {
        var topics = await guilds.GetTopicsAsync(guildId, cancellationToken);
        IReadOnlyList<GuildBoardTopicResponse> response = [.. topics.Select(GuildBoardTopicResponse.From)];
        return TypedResults.Ok(response);
    }

    private static async Task<Results<Created<GuildBoardTopicResponse>, BadRequest<ProblemDetails>, ProblemHttpResult>> CreateTopic(
        Guid guildId,
        CreateGuildTopicRequest request,
        ClaimsPrincipal principal,
        GuildService guilds,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!TryParseTopicKind(request.Kind, out var kind))
        {
            return TypedResults.BadRequest(new ProblemDetails
            {
                Title = "Unknown topic kind.",
                Detail = $"Valid: {string.Join(", ", Enum.GetValues<GuildBoardTopicKind>().Select(k => k.ToWireName()))}.",
                Status = StatusCodes.Status400BadRequest,
            });
        }

        var result = await guilds.CreateTopicAsync(
            guildId, CurrentUserId(principal), request.Title, kind, request.Body, cancellationToken);

        if (!result.Accepted)
        {
            return Problem(result.Rejection);
        }

        var topic = result.Topic!;
        return TypedResults.Created(
            $"/api/v1/guilds/{guildId}/board/topics/{topic.Id}", GuildBoardTopicResponse.From(topic));
    }

    private static async Task<Results<Ok<GuildBoardTopicResponse>, NotFound>> GetTopic(
        Guid guildId, Guid topicId, GuildService guilds, CancellationToken cancellationToken)
    {
        var topic = await guilds.GetTopicAsync(topicId, cancellationToken);
        return topic is null || topic.GuildId != guildId
            ? TypedResults.NotFound()
            : TypedResults.Ok(GuildBoardTopicResponse.From(topic));
    }

    private static async Task<Results<Created<GuildBoardPostResponse>, ProblemHttpResult>> Reply(
        Guid guildId,
        Guid topicId,
        CreateGuildPostRequest request,
        ClaimsPrincipal principal,
        GuildService guilds,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var result = await guilds.ReplyAsync(topicId, CurrentUserId(principal), request.Body, cancellationToken);
        if (!result.Accepted)
        {
            return Problem(result.Rejection);
        }

        var post = result.Post!;
        return TypedResults.Created(
            $"/api/v1/guilds/{guildId}/board/topics/{topicId}", GuildBoardPostResponse.From(post));
    }

    private static async Task<Ok<IReadOnlyList<GuildTreatyResponse>>> ListTreaties(
        Guid guildId, GuildService guilds, CancellationToken cancellationToken)
    {
        var treaties = await guilds.GetTreatiesAsync(guildId, cancellationToken);
        IReadOnlyList<GuildTreatyResponse> response = [.. treaties.Select(GuildTreatyResponse.From)];
        return TypedResults.Ok(response);
    }

    private static async Task<Results<Created<GuildTreatyResponse>, ProblemHttpResult>> ProposeTreaty(
        Guid guildId,
        ProposeTreatyRequest request,
        ClaimsPrincipal principal,
        GuildService guilds,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var result = await guilds.ProposeTreatyAsync(
            guildId, request.TargetGuildId, CurrentUserId(principal), cancellationToken);

        if (!result.Accepted)
        {
            return Problem(result.Rejection);
        }

        var treaty = result.Treaty!;
        return TypedResults.Created(
            $"/api/v1/guilds/{guildId}/treaties", GuildTreatyResponse.From(treaty));
    }

    private static async Task<Results<Ok<GuildTreatyResponse>, ProblemHttpResult>> AcceptTreaty(
        Guid treatyId, ClaimsPrincipal principal, GuildService guilds, CancellationToken cancellationToken)
    {
        var result = await guilds.RespondTreatyAsync(treatyId, CurrentUserId(principal), accept: true, cancellationToken);
        return result.Accepted
            ? TypedResults.Ok(GuildTreatyResponse.From(result.Treaty!))
            : Problem(result.Rejection);
    }

    private static async Task<Results<Ok<GuildTreatyResponse>, ProblemHttpResult>> RejectTreaty(
        Guid treatyId, ClaimsPrincipal principal, GuildService guilds, CancellationToken cancellationToken)
    {
        var result = await guilds.RespondTreatyAsync(treatyId, CurrentUserId(principal), accept: false, cancellationToken);
        return result.Accepted
            ? TypedResults.Ok(GuildTreatyResponse.From(result.Treaty!))
            : Problem(result.Rejection);
    }

    private static async Task<Results<Ok<GuildTreatyResponse>, ProblemHttpResult>> BreakTreaty(
        Guid treatyId, ClaimsPrincipal principal, GuildService guilds, CancellationToken cancellationToken)
    {
        var result = await guilds.BreakTreatyAsync(treatyId, CurrentUserId(principal), cancellationToken);
        return result.Accepted
            ? TypedResults.Ok(GuildTreatyResponse.From(result.Treaty!))
            : Problem(result.Rejection);
    }

    private static Guid CurrentUserId(ClaimsPrincipal principal) =>
        Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private static bool TryParseRole(string value, out GuildRole role)
    {
        foreach (var candidate in Enum.GetValues<GuildRole>())
        {
            if (string.Equals(candidate.ToWireName(), value, StringComparison.OrdinalIgnoreCase))
            {
                role = candidate;
                return true;
            }
        }

        role = default;
        return false;
    }

    private static bool TryParseFeeTier(string value, out GuildFeeTier tier)
    {
        foreach (var candidate in Enum.GetValues<GuildFeeTier>())
        {
            if (string.Equals(candidate.ToWireName(), value, StringComparison.OrdinalIgnoreCase))
            {
                tier = candidate;
                return true;
            }
        }

        tier = default;
        return false;
    }

    private static bool TryParseTopicKind(string value, out GuildBoardTopicKind kind)
    {
        foreach (var candidate in Enum.GetValues<GuildBoardTopicKind>())
        {
            if (string.Equals(candidate.ToWireName(), value, StringComparison.OrdinalIgnoreCase))
            {
                kind = candidate;
                return true;
            }
        }

        kind = default;
        return false;
    }

    private static ProblemHttpResult Problem(GuildRejection rejection) => TypedResults.Problem(
        title: "The guild request was refused.",
        detail: Describe(rejection),
        statusCode: StatusCode(rejection),
        // Several distinct rejections share the same HTTP status (see
        // SettlementEndpoints.Problem for the same reasoning), so the enum
        // itself is exposed for a caller to branch on rather than the
        // free-text Detail.
        extensions: new Dictionary<string, object?> { ["rejection"] = rejection.ToString() });

    private static int StatusCode(GuildRejection rejection) => rejection switch
    {
        GuildRejection.Forbidden => StatusCodes.Status403Forbidden,
        GuildRejection.WorldNotFound or GuildRejection.GuildNotFound or GuildRejection.TargetGuildNotFound
            or GuildRejection.TopicNotFound or GuildRejection.TreatyNotFound => StatusCodes.Status404NotFound,
        _ => StatusCodes.Status409Conflict,
    };

    private static string Describe(GuildRejection rejection) => rejection switch
    {
        GuildRejection.WorldNotFound => "No such world.",
        GuildRejection.GuildNotFound => "No such guild.",
        GuildRejection.TargetGuildNotFound => "No such target guild.",
        GuildRejection.NameTaken => "That guild name is already taken in this world.",
        GuildRejection.TagTaken => "That guild tag is already taken in this world.",
        GuildRejection.AlreadyInAGuild => "You are already a member of a guild.",
        GuildRejection.NotAMember => "Not a member of this guild.",
        GuildRejection.GuildFull => "The guild is at its member cap.",
        GuildRejection.NotEnoughResources => "Not enough resources to pay the fee.",
        GuildRejection.NoSettlement => "You have no settlement in this guild's world.",
        GuildRejection.Forbidden => "You are not allowed to do that.",
        GuildRejection.TargetIsSelf => "A guild cannot propose peace with itself.",
        GuildRejection.TreatyCapReached => "The guild's peace treaty cap is reached.",
        GuildRejection.TreatyAlreadyActive => "A treaty already exists between these guilds.",
        GuildRejection.TreatyNotFound => "No such treaty.",
        GuildRejection.TreatyNotPending => "That treaty is not in a state that accepts this action.",
        GuildRejection.TopicNotFound => "No such topic.",
        GuildRejection.TopicLocked => "That topic is locked.",
        GuildRejection.LeaderCannotLeave => "Transfer leadership before leaving, or leave alone to disband the guild.",
        _ => "Refused.",
    };
}
