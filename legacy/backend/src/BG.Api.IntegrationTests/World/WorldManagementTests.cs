using System.Net;
using System.Net.Http.Json;
using BG.Api.IntegrationTests.Infrastructure;
using BG.API.Models.Auth;
using BG.API.Models;
using BG.Core.Models;
using BG.Core.Interfaces.Repositories;
using BG.Core.Models.Enums;
using BG.Api.IntegrationTests.Infrastructure.TestServices;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Http;
using System.IdentityModel.Tokens.Jwt;

namespace BG.Api.IntegrationTests.World;

public class WorldManagementTests : IntegrationTestBase
{
    private HttpClient _client = null!;
    private string _accessToken = string.Empty;
    private string _username = string.Empty;

    [SetUp]
    public async Task Setup()
    {
        _client = CreateClientWithStrictJson();
        
        // Register an admin user and get tokens
        _username = $"worldadmin-{TestId}";
        await _client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            Username = _username,
            Email = $"worldadmin-{TestId}@example.com",
            Password = "Admin123!"
        }, StrictJsonOptions);

        var userRepository = _factory.Services.GetRequiredService<IUserRepository>();
        await userRepository.SetUserRolesAndActivate(_username, new[] { "admin" });

        // Activate the user and login
        var user = await userRepository.GetByUsernameAsync(_username);
        user!.UpdateStatus(UserStatus.Active);
        await userRepository.UpdateAsync(user);

        var loginResponse = await _client.PostAsJsonAsync("/api/v1/auth/login", new 
        {
            Username = _username,
            Password = "Admin123!"
        }, StrictJsonOptions);

        var authResponse = await loginResponse.Content.ReadFromJsonAsync<AuthResponse>(StrictJsonOptions);
        _accessToken = authResponse?.Tokens.AccessToken ?? throw new InvalidOperationException("No access token received");
        
        _client.DefaultRequestHeaders.Authorization = new("Bearer", _accessToken);

        // to debug id issue:
        var handler = new JwtSecurityTokenHandler();
        var token = handler.ReadJwtToken(_accessToken);
        var tokenUserId = token.Claims.FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Sub)?.Value;
        Assert.That(tokenUserId, Is.Not.Null.Or.Empty);
    }

    [TearDown]
    public void Cleanup()
    {
        _client?.Dispose();
    }

    [Test]
    public async Task CreateWorld_WhenAdmin_ShouldSucceed()
    {
        // Arrange
        var request = new { Name = "Test World", MaxPlayers = 100 };

        // Act
        var response = await _client.PostAsJsonAsync("/api/v1/worlds", request, StrictJsonOptions);

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Created));
        var world = await response.Content.ReadFromJsonAsync<BG.Core.Models.World>(StrictJsonOptions);
        Assert.Multiple(() =>
        {
            Assert.That(world, Is.Not.Null);
            Assert.That(world!.Name, Is.EqualTo(request.Name));
            Assert.That(world.MaxPlayers, Is.EqualTo(request.MaxPlayers));
            Assert.That(world.CurrentPlayerCount, Is.EqualTo(0));
        });
    }

    [Test]
    public async Task JoinWorld_WhenWorldExists_ShouldSucceed()
    {
        // Arrange
        var createResponse = await _client.PostAsJsonAsync("/api/v1/worlds", new 
        { 
            Name = "Join Test World", 
            MaxPlayers = 100 
        }, StrictJsonOptions);
        var world = await createResponse.Content.ReadFromJsonAsync<BG.Core.Models.World>(StrictJsonOptions);
        
        // Act
        var response = await _client.PostAsJsonAsync(
            $"/api/v1/worlds/{world!.Id}/join",
            new { PlayerName = "TestPlayer" }, StrictJsonOptions);

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK), $"Join failed: {response.ReasonPhrase}");
        var player = await response.Content.ReadFromJsonAsync<Player>(StrictJsonOptions);
        Assert.Multiple(() =>
        {
            Assert.That(player, Is.Not.Null);
            Assert.That(player!.Name, Is.EqualTo("TestPlayer"));
            Assert.That(player.WorldId, Is.EqualTo(world.Id));
        });
    }

    [Test]
    public async Task JoinWorld_WhenWorldIsFull_ShouldFail()
    {
        // Arrange
        var createResponse = await _client.PostAsJsonAsync("/api/v1/worlds", new 
        { 
            Name = "Full World", 
            MaxPlayers = 1 
        }, StrictJsonOptions);
        var world = await createResponse.Content.ReadFromJsonAsync<BG.Core.Models.World>(StrictJsonOptions);
        
        // Join with first player
        await _client.PostAsJsonAsync(
            $"/api/v1/worlds/{world!.Id}/join",
            new { PlayerName = "Player1" }, StrictJsonOptions);

        // Act - Try to join with second player
        var response = await _client.PostAsJsonAsync(
            $"/api/v1/worlds/{world.Id}/join",
            new { PlayerName = "Player2" }, StrictJsonOptions);

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }
}