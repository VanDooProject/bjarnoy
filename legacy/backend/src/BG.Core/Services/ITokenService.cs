using BG.Core.Models;
using System.Security.Claims;

namespace BG.Core.Services;

public interface ITokenService
{
    string GenerateAccessToken(User user);
    string GenerateRefreshToken();
    bool ValidateAccessToken(string token);
    (string UserId, string[] Roles)? GetUserInfoFromToken(string token);
    string? GetUserIdFromClaims(IEnumerable<Claim> claims);
}