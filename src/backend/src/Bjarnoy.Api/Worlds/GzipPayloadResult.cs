using Microsoft.Net.Http.Headers;

namespace Bjarnoy.Api.Worlds;

/// <summary>
/// Sends a <see cref="GzipPayload"/>: the stored gzip bytes as they are for a client that accepts gzip, decompressed for one that
/// does not, with <c>ETag</c> and <c>Cache-Control: no-cache</c> (the client keeps a copy but revalidates it each time) and a 304
/// for a matching <c>If-None-Match</c>. The app does no response compression of its own, so nothing compresses the bytes twice.
/// </summary>
public sealed class GzipPayloadResult(GzipPayload payload) : IResult
{
    public async Task ExecuteAsync(HttpContext httpContext)
    {
        ArgumentNullException.ThrowIfNull(httpContext);

        var request = httpContext.Request;
        var response = httpContext.Response;
        var acceptsGzip = AcceptsGzip(request.Headers.AcceptEncoding);

        // Same bytes the strong tag was made from for gzip; the decompressed form of them gets the weak form of it.
        var etag = acceptsGzip ? payload.ETag : "W/" + payload.ETag;
        response.Headers.ETag = etag;
        response.Headers.CacheControl = "no-cache";
        response.Headers.Vary = HeaderNames.AcceptEncoding;

        if (MatchesIfNoneMatch(request.Headers.IfNoneMatch, payload.ETag))
        {
            response.StatusCode = StatusCodes.Status304NotModified;
            return;
        }

        response.ContentType = "application/json; charset=utf-8";
        if (acceptsGzip)
        {
            response.Headers.ContentEncoding = "gzip";
            response.ContentLength = payload.Gzip.Length;
            await response.Body.WriteAsync(payload.Gzip, httpContext.RequestAborted).ConfigureAwait(false);
            return;
        }

        var plain = payload.Decompress();
        response.ContentLength = plain.Length;
        await response.Body.WriteAsync(plain, httpContext.RequestAborted).ConfigureAwait(false);
    }

    private static bool AcceptsGzip(Microsoft.Extensions.Primitives.StringValues acceptEncoding)
    {
        foreach (var value in acceptEncoding)
        {
            foreach (var coding in (value ?? string.Empty).Split(','))
            {
                var parts = coding.Split(';', 2, StringSplitOptions.TrimEntries);
                if (!parts[0].Equals("gzip", StringComparison.OrdinalIgnoreCase) && parts[0] != "*")
                {
                    continue;
                }

                // "gzip;q=0" refuses it.
                var refused = parts.Length == 2
                    && parts[1].StartsWith("q=", StringComparison.OrdinalIgnoreCase)
                    && double.TryParse(parts[1][2..], System.Globalization.CultureInfo.InvariantCulture, out var q)
                    && q <= 0;
                if (!refused)
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static bool MatchesIfNoneMatch(Microsoft.Extensions.Primitives.StringValues ifNoneMatch, string etag)
    {
        if (ifNoneMatch.Count == 0)
        {
            return false;
        }

        if (!EntityTagHeaderValue.TryParse(etag, out var current))
        {
            return false;
        }

        // If-None-Match compares weakly (RFC 9110): the gzip and the decompressed form of a payload share one tag.
        foreach (var candidate in ifNoneMatch.SelectMany(v => (v ?? string.Empty).Split(',', StringSplitOptions.TrimEntries)))
        {
            if (candidate == "*" || (EntityTagHeaderValue.TryParse(candidate, out var tag) && tag.Compare(current, useStrongComparison: false)))
            {
                return true;
            }
        }

        return false;
    }
}
