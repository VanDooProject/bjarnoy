using System.Net;
using Bjarnoy.Infrastructure.Entities;
using Lib.Net.Http.WebPush;
using Lib.Net.Http.WebPush.Authentication;
using Microsoft.Extensions.Options;

namespace Bjarnoy.Infrastructure.Services.Notifications;

/// <summary>
/// The only class that references <c>Lib.Net.Http.WebPush</c> — everything
/// else depends on <see cref="IPushSender"/> so the choice of library stays
/// swappable and tests never need a real push service.
/// </summary>
public sealed class WebPushSender(PushServiceClient client, IOptions<PushSenderSettings> settings) : IPushSender
{
    private readonly PushServiceClient _client = client;
    private readonly PushSenderSettings _settings = settings.Value;

    public async Task<PushSendResult> SendAsync(
        PushSubscriptionEntity subscription,
        string payloadJson,
        TimeSpan timeToLive,
        CancellationToken cancellationToken)
    {
        var pushSubscription = new PushSubscription { Endpoint = subscription.Endpoint };
        pushSubscription.SetKey(PushEncryptionKeyName.P256DH, subscription.P256dh);
        pushSubscription.SetKey(PushEncryptionKeyName.Auth, subscription.Auth);

        var message = new PushMessage(payloadJson) { TimeToLive = (int)timeToLive.TotalSeconds };
        var authentication = new VapidAuthentication(_settings.VapidPublicKey, _settings.VapidPrivateKey)
        {
            Subject = _settings.Subject,
        };

        try
        {
            await _client.RequestPushMessageDeliveryAsync(pushSubscription, message, authentication, cancellationToken);
            return new PushSendResult(PushSendOutcome.Delivered);
        }
        catch (PushServiceClientException ex) when (ex.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone)
        {
            return new PushSendResult(PushSendOutcome.Gone, ex.Message);
        }
        catch (PushServiceClientException ex)
        {
            return new PushSendResult(PushSendOutcome.TransientFailure, ex.Message);
        }
    }
}
