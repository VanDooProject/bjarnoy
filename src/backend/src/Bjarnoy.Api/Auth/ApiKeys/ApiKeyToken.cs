using System.Security.Cryptography;
using System.Text;

namespace Bjarnoy.Api.Auth.ApiKeys;

/// <summary>
/// The API key token format <c>bjk_&lt;keyId&gt;_&lt;secret&gt;</c> and its hashing.
/// </summary>
/// <remarks>
/// <c>keyId</c> is 16 lowercase hex characters (8 random bytes) and is public: it appears in the admin list and finds
/// the row. <c>secret</c> is the base64url of 32 random bytes; only its SHA-256 is stored, compared in fixed time. A
/// fast hash is the right tool here (unlike a password): the secret is 256 bits of entropy, so there is nothing to
/// brute-force, and the check sits on every request.
/// </remarks>
public static class ApiKeyToken
{
    public const string Prefix = "bjk_";

    private const int KeyIdHexLength = 16;

    /// <summary>A fresh key id and secret, plus the token that carries both.</summary>
    public static (string KeyId, string Secret, string Token) Generate()
    {
        var keyId = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(8));
        var secret = ToBase64Url(RandomNumberGenerator.GetBytes(32));
        return (keyId, secret, $"{Prefix}{keyId}_{secret}");
    }

    /// <summary>A fresh secret for the request flow's poll secret, same shape as a key secret.</summary>
    public static string GenerateSecret() => ToBase64Url(RandomNumberGenerator.GetBytes(32));

    /// <summary>The hint shown in lists: enough to tell keys apart, nothing usable.</summary>
    public static string Hint(string keyId) => $"{Prefix}{keyId}_…";

    /// <summary>Splits a token into key id and secret; false for anything not shaped like one.</summary>
    public static bool TryParse(string? token, out string keyId, out string secret)
    {
        keyId = secret = string.Empty;
        if (string.IsNullOrEmpty(token) || !token.StartsWith(Prefix, StringComparison.Ordinal))
        {
            return false;
        }

        var rest = token.AsSpan(Prefix.Length);
        var separator = rest.IndexOf('_');
        if (separator != KeyIdHexLength || separator + 1 >= rest.Length)
        {
            return false;
        }

        var id = rest[..separator];
        foreach (var c in id)
        {
            if (c is not ((>= '0' and <= '9') or (>= 'a' and <= 'f')))
            {
                return false;
            }
        }

        keyId = id.ToString();
        secret = rest[(separator + 1)..].ToString();
        return true;
    }

    /// <summary>SHA-256 of a secret, hex-encoded — what is stored.</summary>
    public static string HashSecret(string secret) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(secret)));

    /// <summary>Whether <paramref name="secret"/> hashes to <paramref name="storedHash"/>, in fixed time.</summary>
    public static bool Verify(string secret, string storedHash) =>
        CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(HashSecret(secret)),
            Encoding.ASCII.GetBytes(storedHash.ToUpperInvariant()));

    private static string ToBase64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
