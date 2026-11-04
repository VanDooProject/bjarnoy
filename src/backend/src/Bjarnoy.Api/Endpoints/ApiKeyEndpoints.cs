using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth.ApiKeys;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// The two read-only routes an API key (or the agent about to ask for one) uses to find out what exists and what it has:
/// the feature catalogue, and the calling key's own settings.
/// </summary>
/// <remarks>
/// Both are marked <see cref="ApiKeyEndpointMarker.Public"/>: any valid key may call them regardless of its features,
/// since they only describe the catalogue and the key itself.
/// </remarks>
public static class ApiKeyEndpoints
{
    public static IEndpointRouteBuilder MapApiKeyEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var keys = app.MapGroup("/api/v1/api-keys")
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("API keys")
            .ApiKeyPublic();

        keys.MapGet("/features", ListFeatures)
            .WithName("ListApiKeyFeatures")
            .WithSummary("The features an API key can be granted, so a requester knows what to ask for.")
            .AllowAnonymous();

        keys.MapGet("/self", GetSelf)
            .WithName("GetOwnApiKey")
            .WithSummary("The settings of the API key making this call (401 for any other kind of caller).")
            .RequireAuthorization();

        return app;
    }

    private static Ok<IReadOnlyList<ApiKeyFeatureResponse>> ListFeatures() =>
        TypedResults.Ok<IReadOnlyList<ApiKeyFeatureResponse>>(
            [.. ApiKeyFeature.Catalogue.Select(f => new ApiKeyFeatureResponse(f.Id, f.WorldScoped, f.Admin, f.Description))]);

    private static async Task<Results<Ok<ApiKeyResponse>, UnauthorizedHttpResult>> GetSelf(
        HttpContext http,
        GameDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (http.User.GetApiKeyId() is not { } keyId)
        {
            return TypedResults.Unauthorized();
        }

        var key = await dbContext.ApiKeys.AsNoTracking()
            .Include(k => k.OwnerUser)
            .Include(k => k.CreatedByUser)
            .FirstOrDefaultAsync(k => k.Id == keyId, cancellationToken);
        return key is null
            ? TypedResults.Unauthorized()
            : TypedResults.Ok(ApiKeyResponse.From(key, timeProvider.GetUtcNow()));
    }
}
