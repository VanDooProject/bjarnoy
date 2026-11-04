using System.Text.Json;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// Reads a JSON request body that may be absent altogether.
/// </summary>
/// <remarks>
/// A minimal-API handler parameter bound from the body makes the endpoint advertise a required
/// <c>application/json</c> content type to the router, so a bodyless <c>POST</c> (a plain <c>curl -X POST</c>, which is
/// exactly how an agent or an admin script calls "approve" or "renew" with no overrides) is not matched at all and
/// falls through to the <c>/api</c> JSON 404 — a baffling answer for a route that exists. Endpoints whose body is
/// entirely optional therefore read it by hand with this helper.
/// </remarks>
internal static class OptionalBody
{
    /// <summary>
    /// The deserialised body, or null when there is none; or, when there is one that cannot be read, the problem to
    /// answer with (415 for a non-JSON content type, 400 for malformed JSON).
    /// </summary>
    public static async Task<(T? Body, IResult? Error)> ReadAsync<T>(HttpRequest request, CancellationToken cancellationToken)
        where T : class
    {
        ArgumentNullException.ThrowIfNull(request);

        if (request.ContentLength is null or 0 && !request.Headers.ContainsKey("Transfer-Encoding"))
        {
            return (null, null);
        }

        if (!request.HasJsonContentType())
        {
            return (null, Results.Problem(
                title: "The body must be application/json.", statusCode: StatusCodes.Status415UnsupportedMediaType));
        }

        try
        {
            return (await request.ReadFromJsonAsync<T>(cancellationToken), null);
        }
        catch (JsonException)
        {
            return (null, Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["body"] = ["The request body is not valid JSON for this route."],
            }));
        }
    }
}
