using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using BG.Core.Models;
using BG.Core.Models.Enums;
using BG.Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using NUnit.Framework;

namespace BG.Tests.Infrastructure.Services;

public class JwtTokenServiceTests
{
    private JwtTokenService _tokenService = null!;
    private const string SecretKey = "abcdefghijklmnopqrstuvwxyz123456";
    private const string Issuer = "test-issuer";
    private const string Audience = "test-audience";

    [SetUp]
    public void Setup()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:SecretKey"] = SecretKey,
                ["Jwt:Issuer"] = Issuer,
                ["Jwt:Audience"] = Audience,
                ["Jwt:AccessTokenExpirationMinutes"] = "15"
            })
            .Build();

        _tokenService = new JwtTokenService(configuration);
    }

    [Test]
    public void GenerateAccessToken_WithValidUser_ShouldIncludeCorrectClaims()
    {
        // Arrange
        var user = new User
        {
            Id = EntityId.NewId(),
            Username = "testuser",
            Email = "test@example.com",
            Roles = new[] { "user", "admin" }
        };

        // Act
        var token = _tokenService.GenerateAccessToken(user);

        // Assert
        var handler = new JwtSecurityTokenHandler();
        var jwtToken = handler.ReadJwtToken(token);
        
        Assert.Multiple(() =>
        {
            Assert.That(jwtToken.Claims.First(c => c.Type == JwtRegisteredClaimNames.Sub).Value, Is.EqualTo(user.Id.ToString()));
            Assert.That(jwtToken.Claims.First(c => c.Type == JwtRegisteredClaimNames.UniqueName).Value, Is.EqualTo(user.Username));
            Assert.That(jwtToken.Claims.First(c => c.Type == JwtRegisteredClaimNames.Email).Value, Is.EqualTo(user.Email));
            Assert.That(jwtToken.Claims.Where(c => c.Type == ClaimTypes.Role).Select(c => c.Value), Is.EquivalentTo(user.Roles));
            Assert.That(jwtToken.Issuer, Is.EqualTo(Issuer));
            Assert.That(jwtToken.Audiences.Single(), Is.EqualTo(Audience));
        });
    }

    [Test]
    public void GenerateRefreshToken_ShouldGenerateUniqueTokens()
    {
        // Act
        var token1 = _tokenService.GenerateRefreshToken();
        var token2 = _tokenService.GenerateRefreshToken();

        // Assert
        Assert.Multiple(() =>
        {
            Assert.That(token1, Is.Not.Empty);
            Assert.That(token2, Is.Not.Empty);
            Assert.That(token1, Is.Not.EqualTo(token2));
        });
    }

    [Test]
    public void ValidateAccessToken_WithValidToken_ShouldReturnTrue()
    {
        // Arrange
        var user = new User
        {
            Id = EntityId.NewId(),
            Username = "testuser",
            Email = "test@example.com"
        };
        var token = _tokenService.GenerateAccessToken(user);

        // Act
        var isValid = _tokenService.ValidateAccessToken(token);

        // Assert
        Assert.That(isValid, Is.True);
    }

    [Test]
    public void ValidateAccessToken_WithInvalidToken_ShouldReturnFalse()
    {
        // Act
        var isValid = _tokenService.ValidateAccessToken("invalid-token");

        // Assert
        Assert.That(isValid, Is.False);
    }

    [Test]
    public void GetUserInfoFromToken_WithValidToken_ShouldReturnCorrectInfo()
    {
        // Arrange
        var user = new User
        {
            Id = EntityId.NewId(),
            Username = "testuser",
            Email = "test@example.com",
            Roles = new[] { "user", "admin" }
        };
        var token = _tokenService.GenerateAccessToken(user);

        // Act
        var userInfo = _tokenService.GetUserInfoFromToken(token);

        // Assert
        Assert.Multiple(() =>
        {
            Assert.That(userInfo, Is.Not.Null);
            Assert.That(userInfo!.Value.UserId, Is.EqualTo(user.Id.ToString()));
            Assert.That(userInfo.Value.Roles, Is.EquivalentTo(user.Roles));
        });
    }

    [Test]
    public void GetUserInfoFromToken_WithInvalidToken_ShouldReturnNull()
    {
        // Act
        var userInfo = _tokenService.GetUserInfoFromToken("invalid-token");

        // Assert
        Assert.That(userInfo, Is.Null);
    }

    [Test]
    public void GetUserIdFromClaims_WithValidClaims_ShouldReturnUserId()
    {
        // Arrange
        var userId = EntityId.NewId().ToString();
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId),
            new(JwtRegisteredClaimNames.Email, "test@example.com")
        };
        var identity = new ClaimsIdentity(claims);
        var principal = new ClaimsPrincipal(identity);

        // Act
        var result = _tokenService.GetUserIdFromClaims(principal);

        // Assert
        Assert.That(result, Is.EqualTo(userId));
    }

    [Test] // this test is also somehow testing a invalid token since each token should have the id
    public void GetUserIdFromClaims_WithoutUserIdClaim_ShouldReturnNull()
    {
        // Arrange
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Email, "test@example.com")
        };
        var identity = new ClaimsIdentity(claims);
        var principal = new ClaimsPrincipal(identity);

        // Act
        var result = _tokenService.GetUserIdFromClaims(principal);

        // Assert
        Assert.That(result, Is.Null);
    }

    // TODO validity tests
}