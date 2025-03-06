using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using BG.Core.Models;
using BG.Core.Models.Enums;
using BG.Core.ValueObjects;
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
            new(ClaimTypes.NameIdentifier, userId),
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
            new(ClaimTypes.Email, "test@example.com")
        };
        var identity = new ClaimsIdentity(claims);
        var principal = new ClaimsPrincipal(identity);

        // Act
        var result = _tokenService.GetUserIdFromClaims(principal);

        // Assert
        Assert.That(result, Is.Null);
    }

    [Test]
    public void ValidateAccessToken_WithExpiredToken_ShouldReturnFalse()
    {
        // Arrange
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:SecretKey"] = SecretKey,
                ["Jwt:Issuer"] = Issuer,
                ["Jwt:Audience"] = Audience,
                ["Jwt:AccessTokenExpirationMinutes"] = "0" // Immediate expiration
            })
            .Build();

        var tokenService = new JwtTokenService(configuration);
        var user = new User
        {
            Id = EntityId.NewId(),
            Username = "testuser",
            Email = "test@example.com"
        };

        var token = tokenService.GenerateAccessToken(user);
        Thread.Sleep(1000); // Wait for token to expire

        // Act
        var isValid = tokenService.ValidateAccessToken(token);

        // Assert
        Assert.That(isValid, Is.False);
    }

    [Test]
    public void ValidateAccessToken_WithWrongIssuer_ShouldReturnFalse()
    {
        // Arrange
        var wrongConfiguration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:SecretKey"] = SecretKey,
                ["Jwt:Issuer"] = "wrong-issuer",
                ["Jwt:Audience"] = Audience,
                ["Jwt:AccessTokenExpirationMinutes"] = "15"
            })
            .Build();

        var wrongTokenService = new JwtTokenService(wrongConfiguration);
        var user = new User
        {
            Id = EntityId.NewId(),
            Username = "testuser",
            Email = "test@example.com"
        };

        var token = wrongTokenService.GenerateAccessToken(user);

        // Act
        var isValid = _tokenService.ValidateAccessToken(token);

        // Assert
        Assert.That(isValid, Is.False);
    }

    
    private static IEnumerable<TestCaseData> InvalidUserCases()
    {
        yield return new TestCaseData(
            new User 
            { 
                Username = "test",
                Email = "test@example.com",
                // Missing Id
            }).SetName("NoUserId");

        yield return new TestCaseData(
            new User 
            { 
                Id = EntityId.NewId(),
                Email = "test@example.com",
                // Missing Username
            }).SetName("NoUsername");

        yield return new TestCaseData(
            new User 
            { 
                Id = EntityId.NewId(),
                Username = "test",
                // Missing Email
            }).SetName("NoEmail");
    }

    [TestCaseSource(nameof(InvalidUserCases))]
    public void GenerateAccessToken_WithInvalidUser_ShouldGenerateValidToken(User user)
    {
        // Act
        var token = _tokenService.GenerateAccessToken(user);
        var handler = new JwtSecurityTokenHandler();
        var jwtToken = handler.ReadJwtToken(token);

        // Assert - Token should still be structurally valid even with missing claims
        Assert.Multiple(() =>
        {
            Assert.That(jwtToken.Issuer, Is.EqualTo(Issuer));
            Assert.That(jwtToken.Audiences.Single(), Is.EqualTo(Audience));
            Assert.That(jwtToken.ValidTo, Is.GreaterThan(DateTime.UtcNow));
        });
    }

    private static IEnumerable<TestCaseData> InvalidConfigCases()
    {
        yield return new TestCaseData(new Dictionary<string, string?> 
        {
            ["Jwt:SecretKey"] = "", // Empty secret key
            ["Jwt:Issuer"] = Issuer,
            ["Jwt:Audience"] = Audience,
            ["Jwt:AccessTokenExpirationMinutes"] = "15"
        }).SetName("EmptySecretKey");

        yield return new TestCaseData(new Dictionary<string, string?> 
        {
            ["Jwt:SecretKey"] = SecretKey,
            ["Jwt:Issuer"] = Issuer,
            ["Jwt:Audience"] = Audience,
            ["Jwt:AccessTokenExpirationMinutes"] = "-1" // Invalid expiration
        }).SetName("NegativeExpiration");

        yield return new TestCaseData(new Dictionary<string, string?> 
        {
            ["Jwt:SecretKey"] = SecretKey,
            ["Jwt:Issuer"] = Issuer,
            ["Jwt:Audience"] = "", // Empty audience
            ["Jwt:AccessTokenExpirationMinutes"] = "15"
        }).SetName("EmptyAudience");

        yield return new TestCaseData(new Dictionary<string, string?> 
        {
            ["Jwt:SecretKey"] = "short", // Too short for HMAC-SHA256
            ["Jwt:Issuer"] = Issuer,
            ["Jwt:Audience"] = Audience,
            ["Jwt:AccessTokenExpirationMinutes"] = "15"
        }).SetName("InvalidKeyLength");
    }

    [TestCaseSource(nameof(InvalidConfigCases))]
    public void GenerateAccessToken_WithInvalidConfig_ShouldThrowException(Dictionary<string, string?> config)
    {
        // Arrange
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(config)
            .Build();
        var tokenService = new JwtTokenService(configuration);

        // Act & Assert
        Assert.That(() => tokenService.GenerateAccessToken(new User()), Throws.InstanceOf<InvalidOperationException>());
    }

    [Test]
    public void GenerateAccessToken_ShouldSetCorrectExpirationTime()
    {
        // Arrange
        const int expirationMinutes = 30;
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:SecretKey"] = SecretKey,
                ["Jwt:Issuer"] = Issuer,
                ["Jwt:Audience"] = Audience,
                ["Jwt:AccessTokenExpirationMinutes"] = expirationMinutes.ToString()
            })
            .Build();
        var tokenService = new JwtTokenService(configuration);
        var user = new User();

        // Act
        var token = tokenService.GenerateAccessToken(user);
        var jwtToken = new JwtSecurityTokenHandler().ReadJwtToken(token);
        var validitySpan = jwtToken.ValidTo - jwtToken.ValidFrom;
        Assert.That(validitySpan.TotalMinutes, Is.EqualTo(expirationMinutes));
    }

    [Test]
    public void GenerateRefreshToken_ShouldCreateSecureToken()
    {
        // Act
        var token = _tokenService.GenerateRefreshToken();

        // Assert
        Assert.Multiple(() =>
        {
            // Base64 encoded 32 bytes should be 44 characters
            Assert.That(token.Length, Is.EqualTo(44), "Refresh token should be 44 characters (32 bytes in Base64)");
            // Should be valid Base64
            Assert.That(() => Convert.FromBase64String(token), Throws.Nothing, 
                "Refresh token should be valid Base64");
        });
    }
}