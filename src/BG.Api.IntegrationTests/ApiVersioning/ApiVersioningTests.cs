using System.Net;
using System.Net.Http.Json;
using BG.Api.IntegrationTests.Infrastructure;
using BG.API.Models.Auth;
using BG.Core.Models;

namespace BG.Api.IntegrationTests.ApiVersioning;

public class ApiVersioningTests : IntegrationTestBase
{
    private HttpClient _client = null!;

    [SetUp]
    public void Setup()
    {
        _client = CreateClientWithStrictJson();
    }

    [TearDown]
    public void Cleanup()
    {
        _client?.Dispose();
    }

    [Test]
    public async Task ApiEndpoint_WithCorrectVersion_ShouldSucceed()
    {
        // Arrange & Act
        var response = await _client.GetAsync("/api/v1/worlds");

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
    }

    [Test]
    public async Task ApiEndpoint_WithInvalidVersion_ShouldFail()
    {
        // Arrange & Act
        var response = await _client.GetAsync("/api/v2/worlds");

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.NotFound));
    }

    [Test]
    public async Task ApiEndpoint_WithMissingRequiredProperty_ShouldFail()
    {
        // Arrange
        var incompleteRequest = new
        {
            // MaxPlayers is missing
            Name = "Test World"
        };

        // Act
        var response = await _client.PostAsJsonAsync("/api/v1/worlds", incompleteRequest, StrictJsonOptions);

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [Test]
    public async Task ApiEndpoint_WithIncorrectPropertyCase_ShouldFail()
    {
        // Arrange
        var wrongCaseRequest = new
        {
            name = "Test World", // lowercase instead of Name
            maxPlayers = 100     // lowercase instead of MaxPlayers
        };

        // Act
        var response = await _client.PostAsJsonAsync("/api/v1/worlds", wrongCaseRequest, StrictJsonOptions);

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }
}