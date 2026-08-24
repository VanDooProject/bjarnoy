using System.Net;
using BG.Api.IntegrationTests.Infrastructure;

namespace BG.Api.IntegrationTests;

[Category("IntegrationTests")]
public class HealthCheckIntegrationTests : IntegrationTestBase
{
    [Test]
    public async Task HealthCheck_ReturnsHealthy()
    {
        // Arrange
        var client = _factory.CreateClient();

        // Act
        var response = await client.GetAsync("/health");

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
    }
}