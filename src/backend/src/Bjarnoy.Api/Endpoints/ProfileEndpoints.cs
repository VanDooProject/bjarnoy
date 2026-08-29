using System.Security.Claims;
using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// The player-facing profile surface (issue #42): anyone can read a profile
/// (they're public, like a settlement's owner name on the map), a logged-in
/// user can edit their own bio, and a logged-in user can report another
/// player's profile for moderation. The mutating endpoints carry
/// <see cref="ActiveUserEndpointFilter"/> so a locked user is refused, same
/// as every other mutating game action.
/// </summary>
public static class ProfileEndpoints
{
    public static IEndpointRouteBuilder MapProfileEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var profiles = app.MapGroup("/api/v1/profiles")
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("Profiles");

        profiles.MapGet("/{userId:guid}", GetProfileById)
            .WithName("GetProfileById")
            .WithSummary("A user's public profile, by id.");

        // Literal "by-name" segment so it can never collide with the guid
        // route above; usernames are matched case-insensitively via the
        // normalized column.
        profiles.MapGet("/by-name/{userName}", GetProfileByUserName)
            .WithName("GetProfileByUserName")
            .WithSummary("A user's public profile, by username (case-insensitive).");

        profiles.MapPut("/me/bio", UpdateOwnBio)
            .WithName("UpdateOwnBio")
            .WithSummary("Sets (or clears) the caller's own profile bio.")
            .RequireAuthorization()
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        profiles.MapPost("/{userId:guid}/reports", ReportProfile)
            .WithName("ReportProfile")
            .WithSummary("Reports another player's profile for moderator review.")
            .RequireAuthorization()
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        return app;
    }

    private static async Task<Results<Ok<ProfileResponse>, NotFound>> GetProfileById(
        Guid userId,
        ProfileService profileService,
        CancellationToken cancellationToken)
    {
        var profile = await profileService.GetProfileByIdAsync(userId, cancellationToken);
        return profile is null
            ? TypedResults.NotFound()
            : TypedResults.Ok(ProfileResponse.From(profile.User, profile.SettlementCount));
    }

    private static async Task<Results<Ok<ProfileResponse>, NotFound>> GetProfileByUserName(
        string userName,
        ProfileService profileService,
        CancellationToken cancellationToken)
    {
        var profile = await profileService.GetProfileByUserNameAsync(userName, cancellationToken);
        return profile is null
            ? TypedResults.NotFound()
            : TypedResults.Ok(ProfileResponse.From(profile.User, profile.SettlementCount));
    }

    private static async Task<Results<Ok<ProfileResponse>, NotFound>> UpdateOwnBio(
        UpdateBioRequest request,
        ProfileService profileService,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        // RequireAuthorization guarantees a valid JWT, so the claim is present.
        var userId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var (outcome, user) = await profileService.UpdateBioAsync(userId, request.Bio, cancellationToken);

        if (outcome == BioUpdateOutcome.NotFound)
        {
            return TypedResults.NotFound();
        }

        var settlementCount = await profileService.GetProfileByIdAsync(userId, cancellationToken);
        return TypedResults.Ok(ProfileResponse.From(user!, settlementCount?.SettlementCount ?? 0));
    }

    private static async Task<Results<Created<ReportResponse>, NotFound, ValidationProblem>> ReportProfile(
        Guid userId,
        ReportProfileRequest request,
        ProfileService profileService,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var reporterUserId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var (outcome, report) = await profileService.ReportProfileAsync(
            reporterUserId, userId, request.Reason, request.Note, cancellationToken);

        return outcome switch
        {
            ProfileReportOutcome.ReportedUserNotFound => TypedResults.NotFound(),
            ProfileReportOutcome.CannotReportSelf => TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["userId"] = ["You cannot report your own profile."],
            }),
            ProfileReportOutcome.AlreadyReported => TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["userId"] = ["You already have a pending report against this user."],
            }),
            _ => TypedResults.Created($"/api/v1/admin/reports/{report!.Id}", ReportResponse.From(report)),
        };
    }
}
