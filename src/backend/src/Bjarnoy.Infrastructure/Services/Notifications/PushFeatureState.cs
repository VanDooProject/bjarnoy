namespace Bjarnoy.Infrastructure.Services.Notifications;

/// <summary>
/// Whether push is configured in this environment (all three of
/// <c>Push:VapidPublicKey</c>/<c>VapidPrivateKey</c>/<c>Subject</c> set) —
/// registered unconditionally in <c>Program.cs</c> so
/// <see cref="NotificationEnqueuer"/> can short-circuit without depending on
/// <c>Bjarnoy.Api.Hosting.PushOptions</c>, which <c>Bjarnoy.Infrastructure</c>
/// cannot reference (see <see cref="PushSenderSettings"/> for the same
/// layering reason).
/// </summary>
public sealed class PushFeatureState
{
    public required bool Enabled { get; init; }
}
