using System.Net;
using System.Net.Http.Json;
using BG.Api.IntegrationTests.Infrastructure;
using BG.API.Models;
using BG.Core.Models;
using BG.Core.Interfaces.Repositories;
using BG.Api.IntegrationTests.Infrastructure.TestServices;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Http;

namespace BG.Api.IntegrationTests.World;

public class WorldManagementTests : IntegrationTestBase
{
    private HttpClient? _client;
    private string _accessToken = string.Empty;
    private TestUserRepository _userRepository = null!;

    // TODO make the tests also runnable as "resource dependent" integration tests so we can also test the actual db sql stuff
    protected override void ConfigureTestServices(IServiceCollection services)
    {
        base.ConfigureTestServices(services);

        _userRepository = new TestUserRepository();
        services.AddScoped<IUserRepository>(_ => _userRepository);

        var sp = services.BuildServiceProvider();
        using var scope = sp.CreateScope();
        var userRepo = scope.ServiceProvider.GetRequiredService<IUserRepository>();
        Assert.That(userRepo, Is.InstanceOf<TestUserRepository>());
    }

    [SetUp]
    public async Task Setup()
    {
        _client = _factory.CreateClient();
        
        // Register an admin user and get tokens
        await _client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            Username = "worldadmin",
            Email = "worldadmin@example.com",
            Password = "Admin123!"
        });

        
await _userRepository.SetUserRolesAndActivate("worldadmin", new[] { "admin" });

        var loginResponse = await _client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            Username = "worldadmin",
            Password = "Admin123!"
        });

        var tokens = await loginResponse.Content.ReadFromJsonAsync<TokenResponse>();
        _accessToken = tokens?.AccessToken ?? throw new InvalidOperationException("No access token received");
        
        _client.DefaultRequestHeaders.Authorization = new("Bearer", _accessToken);
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
        var response = await _client!.PostAsJsonAsync("/api/v1/worlds", request);

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Created));
        var world = await response.Content.ReadFromJsonAsync<BG.Core.Models.World>();
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
        var createResponse = await _client!.PostAsJsonAsync("/api/v1/worlds", new 
        { 
            Name = "Join Test World", 
            MaxPlayers = 100 
        });
        var world = await createResponse.Content.ReadFromJsonAsync<BG.Core.Models.World>();
        
        // Act
        var response = await _client.PostAsJsonAsync(
            $"/api/v1/worlds/{world!.Id}/join",
            new { PlayerName = "TestPlayer" });

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        var player = await response.Content.ReadFromJsonAsync<Player>();
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
        var createResponse = await _client!.PostAsJsonAsync("/api/v1/worlds", new 
        { 
            Name = "Full World", 
            MaxPlayers = 1 
        });
        var world = await createResponse.Content.ReadFromJsonAsync<BG.Core.Models.World>();
        
        // Join with first player
        await _client.PostAsJsonAsync(
            $"/api/v1/worlds/{world!.Id}/join",
            new { PlayerName = "Player1" });

        // Act - Try to join with second player
        var response = await _client.PostAsJsonAsync(
            $"/api/v1/worlds/{world.Id}/join",
            new { PlayerName = "Player2" });

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    private record TokenResponse(string AccessToken, string RefreshToken);
}