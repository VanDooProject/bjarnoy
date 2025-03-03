using Microsoft.AspNetCore.Mvc.Testing;
using BG.API;

namespace BG.Api.IntegrationTests.Infrastructure;

public class IntegrationTestBase
{
    protected readonly WebApplicationFactory<Program> _factory;

    public IntegrationTestBase()
    {
        _factory = new WebApplicationFactory<Program>();
    }

    [OneTimeTearDown]
    public void TearDown()
    {
        _factory.Dispose();
    }
}