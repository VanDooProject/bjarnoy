namespace Bjarnoy.Infrastructure.Services.Notifications;

/// <summary>
/// A server-rendered, already-localised notification: exactly what
/// <c>notification_outbox.PayloadJson</c> stores and what the service
/// worker's <c>push</c> handler expects (<c>{title, body, url, tag}</c>).
/// </summary>
public sealed record NotificationPayload(string Title, string Body, string Url, string Tag);
