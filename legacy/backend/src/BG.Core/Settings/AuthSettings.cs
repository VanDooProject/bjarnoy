namespace BG.Core.Settings;

public class AuthSettings
{
    public const string ConfigurationSection = "Auth";

    public bool SkipEmailVerification { get; set; } = false;
}