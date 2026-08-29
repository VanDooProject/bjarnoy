namespace Bjarnoy.Infrastructure.Entities;

public enum UserRole
{
    Player = 0,
    Admin = 1,
}

/// <summary>
/// A user's standing. <see cref="Locked"/> may still log in but is refused any
/// mutating game action; <see cref="Banned"/> is refused login outright.
/// </summary>
public enum UserStatus
{
    Active = 0,
    Locked = 1,
    Banned = 2,
}

/// <summary>
/// A player account: the auth foundation this repo did not have before — see
/// <c>docs/tech/backend.md</c>, "Not in here yet".
/// </summary>
/// <remarks>
/// Before this, a settlement's owner was just a client-generated localStorage
/// id (<see cref="SettlementEntity.OwnerId"/>). <see cref="SettlementEntity.UserId"/>
/// is the real, relational ownership column this account gets: one user can
/// own several settlements (<see cref="Settlements"/>), and registering with
/// the local id already on the client claims whatever settlements it founded
/// — see <c>AuthService.RegisterAsync</c>. The old string columns stay as-is
/// for settlements nobody has claimed yet.
/// </remarks>
public class UserEntity
{
    /// <summary>UUIDv7, so primary keys are time-ordered and index well.</summary>
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public required string UserName { get; set; }

    /// <summary>
    /// <see cref="UserName"/> lower-cased, for a case-insensitive unique index —
    /// SQLite has no case-insensitive collation for arbitrary Unicode that both
    /// providers agree on, so uniqueness is enforced on this column instead.
    /// </summary>
    public required string NormalizedUserName { get; set; }

    /// <summary>PBKDF2 hash from <see cref="Microsoft.AspNetCore.Identity.PasswordHasher{TUser}"/>.</summary>
    public required string PasswordHash { get; set; }

    public UserRole Role { get; set; } = UserRole.Player;

    public UserStatus Status { get; set; } = UserStatus.Active;

    public string? DisplayName { get; set; }

    /// <summary>
    /// Free-text profile bio (issue #42). Whitespace and line breaks are
    /// significant — the frontend renders it with <c>white-space: pre</c> so
    /// ASCII art survives — which is why nothing here trims or normalizes it.
    /// It is stored and served as plain text; the frontend never interprets
    /// it as HTML (Vue's escaped interpolation, no <c>v-html</c>).
    /// </summary>
    public string? Bio { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? LastLoginAt { get; set; }

    /// <summary>Why the account is in its current <see cref="Status"/>, for moderators.</summary>
    public string? StatusReason { get; set; }

    public DateTimeOffset? StatusChangedAt { get; set; }

    /// <summary>
    /// True for a reserved, non-player account (<see cref="SystemUserIds"/>) —
    /// e.g. <c>"Abandoned"</c>, the owner every settlement without a real
    /// player falls back to now that <see cref="SettlementEntity.UserId"/> is
    /// required. A system user can never log in: <c>AuthService.LoginAsync</c>
    /// refuses it outright, regardless of <see cref="PasswordHash"/>.
    /// </summary>
    public bool IsSystem { get; set; }

    public List<RefreshTokenEntity> RefreshTokens { get; set; } = [];

    /// <summary>
    /// Settlements this user owns via <see cref="SettlementEntity.UserId"/> —
    /// one user, many settlements. Populated by claiming (at registration) or,
    /// in future, by founding while logged in; unrelated to the legacy
    /// <see cref="SettlementEntity.OwnerId"/> string a settlement may also carry.
    /// </summary>
    public List<SettlementEntity> Settlements { get; set; } = [];
}

/// <summary>
/// Fixed ids for the reserved system accounts seeded by the <c>AddUsers</c>
/// migration (see <c>GameDbContext.OnModelCreating</c>'s <c>HasData</c> for
/// <see cref="UserEntity"/>). Fixed rather than <c>Guid.CreateVersion7()</c>
/// because <c>HasData</c> needs literal, stable values baked into the
/// migration, and because other code (<c>SettlementService.FoundAsync</c>,
/// <c>AuthService.RegisterAsync</c>) needs to reference them without a
/// database round trip.
/// </summary>
public static class SystemUserIds
{
    /// <summary>
    /// Owns every settlement with no real player: anonymous/unclaimed play,
    /// and every settlement that existed before accounts did (backfilled by
    /// the <c>AddUsers</c> migration).
    /// </summary>
    public static readonly Guid Abandoned = new("00000000-0000-0000-0000-000000000001");

    /// <summary>Reserved for future barbarian-camp settlements. Unused for now.</summary>
    public static readonly Guid Barbarians = new("00000000-0000-0000-0000-000000000002");

    /// <summary>Reserved for a future end-game boss's settlement(s). Unused for now.</summary>
    public static readonly Guid Endboss = new("00000000-0000-0000-0000-000000000003");
}

/// <summary>
/// A server-side revocable rotating refresh token. Revoking on ban or logout
/// (or on rotation, since reuse of a rotated-out token is itself treated as
/// revoked) means a lock or ban takes effect within one refresh cycle rather
/// than only when the short-lived access token expires.
/// </summary>
public class RefreshTokenEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid UserId { get; set; }

    public UserEntity? User { get; set; }

    /// <summary>SHA-256 of the raw token, hex-encoded. The raw token is never stored.</summary>
    public required string TokenHash { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
