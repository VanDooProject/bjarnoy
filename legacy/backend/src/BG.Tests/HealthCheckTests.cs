﻿﻿﻿using Microsoft.AspNetCore.Mvc.Testing;
using System.Net;

namespace BG.Tests;

public class HealthCheckTests
{
    private readonly WebApplicationFactory<BG.API.Program> _factory;

    public HealthCheckTests()
    {
        _factory = new WebApplicationFactory<BG.API.Program>();
    }

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

    [OneTimeTearDown]
    public void TearDown()
    {
        _factory.Dispose();
    }
}

