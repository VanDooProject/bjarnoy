namespace Bjarnoy.Api.Contracts;

/// <summary>
/// A request body that names the settlement the caller is acting <em>as</em>,
/// for routes whose own path parameter is something else (an offer id, say),
/// so <see cref="Bjarnoy.Api.Auth.SettlementOwnershipEndpointFilter"/>'s
/// "first route argument is the settlement" shape doesn't fit. The id is
/// caller-supplied, which is exactly why it must be ownership-checked (see
/// <see cref="Bjarnoy.Api.Auth.RequestSettlementOwnershipEndpointFilter"/>)
/// before any handler trusts it.
/// </summary>
public interface ISettlementScopedRequest
{
    Guid ActingSettlementId { get; }
}
