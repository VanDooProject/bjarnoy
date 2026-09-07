using System.Security.Cryptography;
using System.Text;

namespace Bjarnoy.Api.Auth;

/// <summary>
/// A coarse, server-side hash approximating "this browser on this device" —
/// the third identity signal <c>PlotReservationService</c>'s abuse caps use
/// alongside <c>OwnerId</c> (the primary pin) and IP (a NAT-tolerant cap).
/// Aimed specifically at incognito/private-window <c>OwnerId</c> churn:
/// a private window wipes localStorage (and so the client's persisted
/// <c>OwnerId</c>) but not its User-Agent, Accept-Language, or the client's
/// own cheap device fingerprint header, so it still hashes to the same value.
/// Not a security control — a determined visitor can still vary these — only
/// a cheap deterrent, same trust level as the IP cap it sits alongside.
/// </summary>
internal static class ClientFingerprint
{
    public const string ClientFingerprintHeaderName = "X-Client-Fingerprint";

    public static string Derive(IHeaderDictionary headers)
    {
        var userAgent = headers["User-Agent"].ToString();
        var acceptLanguage = headers["Accept-Language"].ToString();
        var clientHint = headers[ClientFingerprintHeaderName].ToString();

        var raw = $"{userAgent}\n{acceptLanguage}\n{clientHint}";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexStringLower(hash);
    }
}
