namespace Bjarnoy.Infrastructure.Services.Notifications;

/// <summary>
/// The subset of <c>Bjarnoy.Api.Hosting.PushOptions</c> (the <c>Push</c>
/// config section) <see cref="WebPushSender"/> needs. A separate type
/// because <c>Bjarnoy.Infrastructure</c> cannot reference <c>Bjarnoy.Api</c>
/// (the project-reference graph only goes the other way) — <c>Program.cs</c>
/// binds this and <c>PushOptions</c> from the same section.
/// </summary>
public sealed class PushSenderSettings
{
    public required string VapidPublicKey { get; set; }

    public required string VapidPrivateKey { get; set; }

    public required string Subject { get; set; }
}
