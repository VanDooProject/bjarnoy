using Bjarnoy.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.Auth;

/// <summary>
/// Runs the rest of the endpoint (its handler) under
/// <see cref="ConcurrentWriteExecutor"/>, so a request that lost a write race
/// on a settlement is re-run against fresh state instead of silently
/// overwriting the winner (issue #341). After the retries are exhausted the
/// caller gets 409 and can simply try again.
/// </summary>
/// <remarks>
/// Must be the <em>last</em> (innermost) filter on an endpoint — use
/// <see cref="ConcurrencyRetryBuilderExtensions.WithConcurrencyRetry"/>, never a
/// group-level filter. <see cref="UserActivityEndpointFilter"/> saves
/// before the handler runs; if that ran inside the executor it would open the
/// lazy transaction for the whole request, and on SQLite that is a
/// whole-database write lock. Re-running the handler must not repeat the
/// activity write either.
/// </remarks>
public sealed class ConcurrencyRetryEndpointFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(next);

        // Resolved from RequestServices, not constructor-injected — same
        // reasoning as ActiveUserEndpointFilter: this filter is built once at
        // endpoint-build time via the root service provider, which cannot
        // hand out a Scoped service.
        var executor = context.HttpContext.RequestServices.GetRequiredService<ConcurrentWriteExecutor>();
        try
        {
            return await executor.ExecuteAsync(
                async _ => await next(context),
                context.HttpContext.RequestAborted);
        }
        catch (ConcurrentUpdateException)
        {
            return TypedResults.Problem(new ProblemDetails
            {
                Title = "The settlement was modified concurrently.",
                Detail = "The settlement changed while your request was being processed. Please try again.",
                Status = StatusCodes.Status409Conflict,
            });
        }
    }
}

/// <summary>Marker metadata so a test can enumerate which endpoints opted in.</summary>
public sealed class ConcurrencyRetryMetadata
{
    public static readonly ConcurrencyRetryMetadata Instance = new();

    private ConcurrencyRetryMetadata()
    {
    }
}

public static class ConcurrencyRetryBuilderExtensions
{
    /// <summary>
    /// Wraps the endpoint in <see cref="ConcurrencyRetryEndpointFilter"/>.
    /// Call it <b>last</b> on the endpoint so it is the innermost filter.
    /// </summary>
    public static RouteHandlerBuilder WithConcurrencyRetry(this RouteHandlerBuilder builder) =>
        builder.AddEndpointFilter<ConcurrencyRetryEndpointFilter>().WithMetadata(ConcurrencyRetryMetadata.Instance);
}
