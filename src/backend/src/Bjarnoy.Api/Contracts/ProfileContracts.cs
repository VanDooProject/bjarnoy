using System.ComponentModel.DataAnnotations;
using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Api.Contracts;

/// <summary>
/// A user's public profile (issue #42). <see cref="Bio"/> is plain text with
/// significant whitespace (ASCII art); the frontend renders it escaped, with
/// <c>white-space: pre</c>.
/// </summary>
public sealed record ProfileResponse(
    Guid Id,
    string UserName,
    string? DisplayName,
    string? Bio,
    DateTimeOffset CreatedAt,
    int SettlementCount)
{
    public static ProfileResponse From(UserEntity user, int settlementCount)
    {
        ArgumentNullException.ThrowIfNull(user);

        return new ProfileResponse(
            user.Id,
            user.UserName,
            user.DisplayName,
            user.Bio,
            user.CreatedAt,
            settlementCount);
    }
}

/// <param name="Bio">The new bio; <c>null</c> or empty clears it. Stored verbatim (whitespace is significant).</param>
public sealed record UpdateBioRequest([property: MaxLength(2000)] string? Bio);

/// <param name="Reason">Why the profile is being reported.</param>
/// <param name="Note">Optional extra context.</param>
public sealed record ReportProfileRequest(
    [property: Required, MaxLength(200)] string Reason,
    [property: MaxLength(2000)] string? Note = null);
