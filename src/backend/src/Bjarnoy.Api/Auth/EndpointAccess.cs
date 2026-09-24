namespace Bjarnoy.Api.Auth;

/// <summary>
/// Which shape of ownership check an endpoint answering per-player data
/// enforces — see <see cref="EndpointAccess"/> for why this exists as
/// endpoint metadata rather than just living in the filter pipeline.
/// </summary>
public enum EndpointAccessKind
{
    /// <summary>Caller must own the settlement id the route/handler resolves — <see cref="SettlementOwnershipEndpointFilter"/>.</summary>
    SettlementOwner,

    /// <summary>Caller must own the army's home settlement — <see cref="ArmyOwnershipEndpointFilter"/>.</summary>
    ArmyOwner,

    /// <summary>Caller must own either party's settlement (a battle report) — <see cref="ReportOwnershipEndpointFilter"/>/<see cref="FieldReportOwnershipEndpointFilter"/>.</summary>
    ReportParty,

    /// <summary>
    /// Caller must own the host settlement (sees every guest), or must own a
    /// listed guest army's home settlement (sees only that guest) — everyone
    /// else is refused. Gated in-handler, not by a shared filter, since the
    /// answer depends on which rows are even in the result —
    /// <c>ArmyEndpoints.ListGuestArmies</c>.
    /// </summary>
    HostOrGuestOwner,

    /// <summary>
    /// The handler resolves the caller's own realm itself, via
    /// <see cref="CallerRealmResolver"/>, rather than delegating to an
    /// endpoint filter — the per-world reads (membership, fog-mask,
    /// plot-suggestion, the fog-gated world settlement list, the fog-gated
    /// settlement view) that predate accounts and were never settlement-id
    /// shaped to begin with. See <see cref="CallerRealmResolver"/>'s own
    /// remarks for why these can't just reuse <see cref="SettlementOwnershipEndpointFilter"/>.
    /// </summary>
    CallerRealm,

    /// <summary>
    /// Requires an authenticated premium account
    /// (<see cref="PremiumUserEndpointFilter"/>) — an entitlement check, not
    /// an ownership one, but still a gate this endpoint can't be reached
    /// without.
    /// </summary>
    PremiumUser,
}

/// <summary>
/// Marks an endpoint as reading data an ownership check gates — attached
/// alongside the actual enforcing filter (see the <c>Require*</c> extension
/// methods below) purely so a reflection-based audit
/// (<c>EndpointAccessPolicyTests</c>) can see that *some* access rule is
/// wired to every endpoint that isn't plainly public, without having to
/// reverse-engineer that from the filter pipeline — <see cref="IEndpointFilter"/>
/// instances are not discoverable via <see cref="Microsoft.AspNetCore.Http.Endpoint.Metadata"/>,
/// so without a marker like this a newly added, un-gated endpoint would be
/// invisible to that audit rather than failing it.
/// </summary>
/// <param name="Kind">Which check this endpoint relies on — see <see cref="EndpointAccessKind"/>.</param>
public sealed record EndpointAccess(EndpointAccessKind Kind)
{
    public static readonly EndpointAccess SettlementOwner = new(EndpointAccessKind.SettlementOwner);

    public static readonly EndpointAccess ArmyOwner = new(EndpointAccessKind.ArmyOwner);

    public static readonly EndpointAccess ReportParty = new(EndpointAccessKind.ReportParty);

    public static readonly EndpointAccess HostOrGuestOwner = new(EndpointAccessKind.HostOrGuestOwner);

    public static readonly EndpointAccess CallerRealm = new(EndpointAccessKind.CallerRealm);

    public static readonly EndpointAccess PremiumUser = new(EndpointAccessKind.PremiumUser);
}

/// <summary>
/// One call site each for wiring an ownership-gated endpoint up correctly —
/// the filter that actually enforces it, and the <see cref="EndpointAccess"/>
/// marker <c>EndpointAccessPolicyTests</c> looks for, always together, so the
/// two can never drift apart the way two separate calls
/// (<c>.AddEndpointFilter&lt;...&gt;().WithMetadata(...)</c>) could if someone
/// added one and forgot the other.
/// </summary>
public static class EndpointAccessBuilderExtensions
{
    public static RouteHandlerBuilder RequireSettlementOwner(this RouteHandlerBuilder builder) =>
        builder.AddEndpointFilter<SettlementOwnershipEndpointFilter>().WithMetadata(EndpointAccess.SettlementOwner);

    public static RouteHandlerBuilder RequireArmyOwner(this RouteHandlerBuilder builder) =>
        builder.AddEndpointFilter<ArmyOwnershipEndpointFilter>().WithMetadata(EndpointAccess.ArmyOwner);

    /// <summary>For a battle-report-by-id read — see <see cref="ReportOwnershipEndpointFilter"/>.</summary>
    public static RouteHandlerBuilder RequireReportParty(this RouteHandlerBuilder builder) =>
        builder.AddEndpointFilter<ReportOwnershipEndpointFilter>().WithMetadata(EndpointAccess.ReportParty);

    /// <summary>For a field-battle-report-by-id read — see <see cref="FieldReportOwnershipEndpointFilter"/>.</summary>
    public static RouteHandlerBuilder RequireFieldReportParty(this RouteHandlerBuilder builder) =>
        builder.AddEndpointFilter<FieldReportOwnershipEndpointFilter>().WithMetadata(EndpointAccess.ReportParty);

    /// <summary>
    /// For a handler that resolves the caller's own realm itself via
    /// <see cref="CallerRealmResolver"/> instead of an endpoint filter — adds
    /// only the <see cref="EndpointAccess"/> marker, since there is no
    /// separate filter to attach alongside it.
    /// </summary>
    public static RouteHandlerBuilder RequireCallerRealm(this RouteHandlerBuilder builder) =>
        builder.WithMetadata(EndpointAccess.CallerRealm);

    /// <summary>
    /// For a handler that gates itself in-handler with the host-or-guest
    /// rule — see <see cref="EndpointAccessKind.HostOrGuestOwner"/>. Adds
    /// only the marker, same reasoning as <see cref="RequireCallerRealm"/>.
    /// </summary>
    public static RouteHandlerBuilder RequireHostOrGuestOwner(this RouteHandlerBuilder builder) =>
        builder.WithMetadata(EndpointAccess.HostOrGuestOwner);

    /// <summary>
    /// <see cref="RequestSettlementOwnershipEndpointFilter"/> + the
    /// <see cref="EndpointAccess.SettlementOwner"/> marker: the settlement
    /// being acted as comes from the request body
    /// (<see cref="Contracts.ISettlementScopedRequest"/>), not the route.
    /// </summary>
    public static RouteHandlerBuilder RequireRequestSettlementOwner(this RouteHandlerBuilder builder) =>
        builder.AddEndpointFilter<RequestSettlementOwnershipEndpointFilter>().WithMetadata(EndpointAccess.SettlementOwner);

    /// <summary><see cref="PremiumUserEndpointFilter"/> + its marker.</summary>
    public static RouteHandlerBuilder RequirePremiumUser(this RouteHandlerBuilder builder) =>
        builder.AddEndpointFilter<PremiumUserEndpointFilter>().WithMetadata(EndpointAccess.PremiumUser);
}
