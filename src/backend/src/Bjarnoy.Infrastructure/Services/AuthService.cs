using System.Security.Cryptography;
using System.Text;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Infrastructure.Services;

public enum AuthOutcome
{
    Success,
    UserNameTaken,
    InvalidCredentials,
    Banned,
}

public enum RefreshOutcome
{
    Success,

    /// <summary>Unknown hash, already revoked, or expired.</summary>
    Invalid,

    Banned,
}

/// <param name="RefreshToken">The raw (unhashed) token — only ever handed back here, never stored.</param>
public sealed record AuthResult(AuthOutcome Outcome, UserEntity? User, string? RefreshToken);

/// <param name="RefreshToken">The raw rotated-in token.</param>
public sealed record RefreshResult(RefreshOutcome Outcome, UserEntity? User, string? RefreshToken);

/// <summary>
/// Accounts, password verification, and rotating refresh tokens. See
/// <c>docs/tech/backend.md</c>, "Not in here yet" — this is that auth
/// foundation landing.
/// </summary>
/// <remarks>
/// Access tokens themselves (JWTs) are minted in <c>Bjarnoy.Api</c> — see
/// <c>JwtTokenService</c> — because signing them needs
/// <c>System.IdentityModel.Tokens.Jwt</c>, which arrives with the JWT bearer
/// package the API host already references, rather than adding another
/// package reference to this project.
/// </remarks>
public sealed class AuthService(GameDbContext dbContext, TimeProvider timeProvider)
{
    /// <summary>How long a refresh token is good for before it must be rotated by use.</summary>
    public static readonly TimeSpan RefreshTokenLifetime = TimeSpan.FromDays(30);

    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly PasswordHasher<UserEntity> _hasher = new();

    /// <param name="existingOwnerId">
    /// The client-generated local id (<c>SettlementEntity.OwnerId</c>) this
    /// browser was already playing under, if any. Every settlement still
    /// carrying that id and no owning user is claimed by the new account —
    /// real, relational ownership via <see cref="SettlementEntity.UserId"/> —
    /// in the same transaction as registering. Claiming a settlement someone
    /// else already registered under the same local id (a shared machine, a
    /// copied id) is not attempted here; only unclaimed ones are touched.
    /// </param>
    public async Task<AuthResult> RegisterAsync(
        string userName, string password, string? existingOwnerId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(userName);
        ArgumentException.ThrowIfNullOrWhiteSpace(password);

        var normalized = Normalize(userName);
        if (await _dbContext.Users.AnyAsync(u => u.NormalizedUserName == normalized, cancellationToken))
        {
            return new AuthResult(AuthOutcome.UserNameTaken, null, null);
        }

        var user = new UserEntity
        {
            UserName = userName.Trim(),
            NormalizedUserName = normalized,
            PasswordHash = string.Empty,
            Role = UserRole.Player,
            Status = UserStatus.Active,
            CreatedAt = _timeProvider.GetUtcNow(),
        };
        user.PasswordHash = _hasher.HashPassword(user, password);

        _dbContext.Users.Add(user);

        if (!string.IsNullOrWhiteSpace(existingOwnerId))
        {
            // Tracked updates, not ExecuteUpdateAsync: that issues its UPDATE
            // immediately, ahead of the user row's own INSERT below (which
            // only happens at SaveChangesAsync), and would violate the
            // UserId foreign key. Letting the change tracker hold both means
            // SaveChangesAsync orders the insert before the update itself.
            var toClaim = await _dbContext.Settlements
                .Where(s => s.OwnerId == existingOwnerId && s.UserId == SystemUserIds.Abandoned)
                .ToListAsync(cancellationToken);

            foreach (var settlement in toClaim)
            {
                settlement.UserId = user.Id;
            }
        }

        var (raw, token) = IssueRefreshToken(user.Id);
        _dbContext.RefreshTokens.Add(token);

        await _dbContext.SaveChangesAsync(cancellationToken);

        return new AuthResult(AuthOutcome.Success, user, raw);
    }

    public async Task<AuthResult> LoginAsync(
        string userName, string password, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(userName);
        ArgumentException.ThrowIfNullOrWhiteSpace(password);

        var normalized = Normalize(userName);
        var user = await _dbContext.Users.FirstOrDefaultAsync(
            u => u.NormalizedUserName == normalized, cancellationToken);

        // A reserved system account (e.g. "Abandoned") is refused outright,
        // rather than relying solely on its PasswordHash never verifying —
        // belt and braces, since it also means a system account can never
        // even reach the hasher (whose VerifyHashedPassword throws
        // FormatException on a hash it didn't produce, like our sentinel).
        if (user is null || user.IsSystem)
        {
            return new AuthResult(AuthOutcome.InvalidCredentials, null, null);
        }

        var verification = _hasher.VerifyHashedPassword(user, user.PasswordHash, password);
        if (verification == PasswordVerificationResult.Failed)
        {
            return new AuthResult(AuthOutcome.InvalidCredentials, null, null);
        }

        if (user.Status == UserStatus.Banned)
        {
            return new AuthResult(AuthOutcome.Banned, user, null);
        }

        if (verification == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.PasswordHash = _hasher.HashPassword(user, password);
        }

        user.LastLoginAt = _timeProvider.GetUtcNow();

        var (raw, token) = IssueRefreshToken(user.Id);
        _dbContext.RefreshTokens.Add(token);

        await _dbContext.SaveChangesAsync(cancellationToken);

        return new AuthResult(AuthOutcome.Success, user, raw);
    }

    /// <summary>
    /// Validates a refresh token and, if it is good, rotates it: the old one is
    /// revoked and a new one issued in the same call. The user's <em>current</em>
    /// status is re-checked here too, which is what lets a ban or lock propagate
    /// before the access token would otherwise have expired.
    /// </summary>
    public async Task<RefreshResult> RefreshAsync(string refreshToken, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(refreshToken);

        var hash = HashToken(refreshToken);
        var now = _timeProvider.GetUtcNow();

        var stored = await _dbContext.RefreshTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash == hash, cancellationToken);

        if (stored is null || stored.User is null || stored.RevokedAt is not null || stored.ExpiresAt <= now)
        {
            return new RefreshResult(RefreshOutcome.Invalid, null, null);
        }

        if (stored.User.Status == UserStatus.Banned)
        {
            return new RefreshResult(RefreshOutcome.Banned, stored.User, null);
        }

        stored.RevokedAt = now;

        var (raw, token) = IssueRefreshToken(stored.UserId);
        _dbContext.RefreshTokens.Add(token);

        await _dbContext.SaveChangesAsync(cancellationToken);

        return new RefreshResult(RefreshOutcome.Success, stored.User, raw);
    }

    /// <summary>Revokes a refresh token. A no-op (not an error) if it is unknown or already revoked.</summary>
    public async Task LogoutAsync(string refreshToken, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(refreshToken);

        var hash = HashToken(refreshToken);
        var stored = await _dbContext.RefreshTokens.FirstOrDefaultAsync(
            t => t.TokenHash == hash, cancellationToken);

        if (stored is null || stored.RevokedAt is not null)
        {
            return;
        }

        stored.RevokedAt = _timeProvider.GetUtcNow();
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public Task<UserEntity?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default) =>
        _dbContext.Users.FirstOrDefaultAsync(u => u.Id == id, cancellationToken);

    public Task<UserStatus?> GetStatusAsync(Guid id, CancellationToken cancellationToken = default) =>
        _dbContext.Users.Where(u => u.Id == id).Select(u => (UserStatus?)u.Status)
            .FirstOrDefaultAsync(cancellationToken);

    /// <summary>
    /// A live DB read of <see cref="UserEntity.IsPremium"/> (issue #40 phase
    /// 7) — mirrors <see cref="GetStatusAsync"/>'s shape, so a premium grant
    /// or revocation takes effect immediately rather than only once a stale
    /// access token expires. <see langword="null"/> when the user does not
    /// exist (distinct from an existing, non-premium user's <see langword="false"/>).
    /// </summary>
    public async Task<bool?> GetIsPremiumAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var found = await _dbContext.Users
            .Where(u => u.Id == id)
            .Select(u => new { u.IsPremium })
            .FirstOrDefaultAsync(cancellationToken);

        return found?.IsPremium;
    }

    /// <summary>
    /// Seeds the first admin from <c>ADMIN_BOOTSTRAP_USERNAME</c>/
    /// <c>ADMIN_BOOTSTRAP_PASSWORD</c>, once, if no Admin exists yet. Called
    /// from <c>Program.cs</c> on every startup; safe to call with either
    /// variable unset — it warns and does nothing, so the app still starts
    /// fine with no bootstrap admin configured (e.g. in tests).
    /// </summary>
    public async Task SeedAdminIfConfiguredAsync(
        string? userName, string? password, ILogger logger, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(logger);

        if (string.IsNullOrWhiteSpace(userName) || string.IsNullOrWhiteSpace(password))
        {
            logger.LogWarning(
                "ADMIN_BOOTSTRAP_USERNAME/ADMIN_BOOTSTRAP_PASSWORD not both set; " +
                "no admin account will be seeded. Set both to bootstrap the first admin.");
            return;
        }

        if (await _dbContext.Users.AnyAsync(u => u.Role == UserRole.Admin, cancellationToken))
        {
            return;
        }

        var normalized = Normalize(userName);
        var existing = await _dbContext.Users.FirstOrDefaultAsync(
            u => u.NormalizedUserName == normalized, cancellationToken);

        if (existing is not null)
        {
            existing.Role = UserRole.Admin;
            await _dbContext.SaveChangesAsync(cancellationToken);
            logger.LogInformation("Promoted existing user {UserName} to Admin.", existing.UserName);
            return;
        }

        var admin = new UserEntity
        {
            UserName = userName.Trim(),
            NormalizedUserName = normalized,
            PasswordHash = string.Empty,
            Role = UserRole.Admin,
            Status = UserStatus.Active,
            CreatedAt = _timeProvider.GetUtcNow(),
        };
        admin.PasswordHash = _hasher.HashPassword(admin, password);

        _dbContext.Users.Add(admin);
        await _dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Seeded bootstrap admin account {UserName}.", admin.UserName);
    }

    private (string Raw, RefreshTokenEntity Entity) IssueRefreshToken(Guid userId)
    {
        var raw = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        var now = _timeProvider.GetUtcNow();

        var entity = new RefreshTokenEntity
        {
            UserId = userId,
            TokenHash = HashToken(raw),
            ExpiresAt = now + RefreshTokenLifetime,
            CreatedAt = now,
        };

        return (raw, entity);
    }

    /// <summary>SHA-256 of the raw token, hex-encoded — never store the raw token itself.</summary>
    public static string HashToken(string raw) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));

    private static string Normalize(string userName) => userName.Trim().ToLowerInvariant();
}
