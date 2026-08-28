using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Bjarnoy.Infrastructure.Entities;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Bjarnoy.Api.Auth;

/// <summary>Mints short-lived, signed access tokens for a user.</summary>
/// <remarks>
/// Deliberately not in <c>Bjarnoy.Infrastructure</c>: signing needs
/// <c>System.IdentityModel.Tokens.Jwt</c>, which arrives transitively with the
/// <c>Microsoft.AspNetCore.Authentication.JwtBearer</c> package this API host
/// already references to validate incoming tokens — so this stays a single
/// package reference rather than two.
/// </remarks>
public sealed class JwtTokenService(IOptions<JwtOptions> options, TimeProvider timeProvider)
{
    private readonly JwtOptions _options = options.Value;
    private readonly TimeProvider _timeProvider = timeProvider;

    public string CreateAccessToken(UserEntity user)
    {
        ArgumentNullException.ThrowIfNull(user);

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.SigningKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var now = _timeProvider.GetUtcNow();

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.UniqueName, user.UserName),
            new Claim(ClaimTypes.Role, user.Role.ToString()),
        };

        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: now.AddMinutes(_options.AccessTokenLifetimeMinutes).UtcDateTime,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
