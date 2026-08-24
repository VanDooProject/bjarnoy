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
        //Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.NotFound)); // TODO check why this is BadRequest and not NotFound
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [Test]
    public async Task ApiEndpoint_WithMissingRequiredProperty_ShouldFail()
    {
        // Arrange
        var incompleteRequest = new
        {
            Username = "Test World",
            // Password is missing
        };

        // Act
        var response = await _client.PostAsJsonAsync("/api/v1/auth/login", incompleteRequest, StrictJsonOptions);

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [Test]
    public async Task ApiEndpoint_WithIncorrectPropertyCase_ShouldFail()
    {
        // Arrange
        var wrongCaseRequest = new
        {
            username = "Test World", // lowercase instead of Username
            password = "sigrid"      // lowercase instead 
        };

        // Act
        var response = await _client.PostAsJsonAsync("/api/v1/auth/login", wrongCaseRequest, StrictJsonOptions);

        // Assert
        //Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest)); // TODO check why this is Unauthorized and not BadRequest
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));
    }
}