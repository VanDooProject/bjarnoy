namespace BG.Api.IntegrationTests.Infrastructure;

public class TestSettings
{
    public const string ConfigurationKey = "TestSettings";

    public bool UseMockServices { get; set; } = false;
    public bool UseTestEmailService { get; set; } = true;
}