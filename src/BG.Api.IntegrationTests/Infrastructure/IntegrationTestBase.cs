using Microsoft.AspNetCore.Mvc.Testing;
using System.Net;

namespace BG.Api.IntegrationTests.Infrastructure;

public class IntegrationTestBase
{
    protected readonly WebApplicationFactory<BG.API.Program> _factory;

    public IntegrationTestBase()
    {
        _factory = new WebApplicationFactory<BG.API.Program>();
    }

    [OneTimeTearDown]
    public void TearDown()
    {
        _factory.Dispose();
    }
}