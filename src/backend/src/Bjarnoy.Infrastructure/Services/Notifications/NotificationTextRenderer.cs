namespace Bjarnoy.Infrastructure.Services.Notifications;

/// <summary>
/// Renders the localised <c>{title, body, url, tag}</c> for each
/// <see cref="Domain.Notifications.NotificationType"/>. One method per type
/// (as more types are wired up, e.g. builds/reports/guild), so each stays a
/// small, reviewable block rather than one large switch. Falls back to
/// <c>en</c> for any locale it doesn't recognise — the same fallback
/// <c>UserEntity.PreferredLocale</c> being null already implies.
/// </summary>
public static class NotificationTextRenderer
{
    /// <summary><see cref="Infrastructure.Entities.UserEntity.PreferredLocale"/>'s source of truth, mirrored — see <c>ProfileService.SupportedLocales</c>.</summary>
    private static string Normalize(string? locale) => locale is "de" ? "de" : "en";

    public static NotificationPayload RenderDirectMessage(string? locale, string senderDisplayName, string messageBody)
    {
        var excerpt = messageBody.Length > 80 ? string.Concat(messageBody.AsSpan(0, 80), "…") : messageBody;

        return Normalize(locale) switch
        {
            "de" => new NotificationPayload(
                Title: $"Neue Nachricht von {senderDisplayName}",
                Body: excerpt,
                Url: "/messages",
                Tag: "message"),
            _ => new NotificationPayload(
                Title: $"New message from {senderDisplayName}",
                Body: excerpt,
                Url: "/messages",
                Tag: "message"),
        };
    }

    public static NotificationPayload RenderTest(string? locale) =>
        Normalize(locale) switch
        {
            "de" => new NotificationPayload(
                Title: "Testbenachrichtigung",
                Body: "Wenn du das siehst, funktionieren Push-Benachrichtigungen auf diesem Gerät.",
                Url: "/settings/notifications",
                Tag: "test"),
            _ => new NotificationPayload(
                Title: "Test notification",
                Body: "If you can see this, push notifications work on this device.",
                Url: "/settings/notifications",
                Tag: "test"),
        };
}
