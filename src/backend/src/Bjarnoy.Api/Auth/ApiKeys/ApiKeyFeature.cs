using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Api.Auth.ApiKeys;

/// <summary>One entry of the feature catalogue, as <c>GET /api/v1/api-keys/features</c> lists it.</summary>
/// <param name="Id">The string id used in JSON and storage.</param>
/// <param name="WorldScoped">Whether a key with a world allow-list is checked against the world a request touches.</param>
/// <param name="Admin">Whether the feature opens an admin surface (only a key owned by an admin may carry it).</param>
/// <param name="Description">What the feature covers, for the person or agent choosing.</param>
public sealed record ApiKeyFeatureInfo(string Id, bool WorldScoped, bool Admin, string Description);

/// <summary>
/// The catalogue of things an API key can be allowed to do. Each endpoint group is wired to exactly one feature (or to
/// <see cref="ApiKeyEndpointMarker.Public"/> / <see cref="ApiKeyEndpointMarker.Forbidden"/>) with the extension methods
/// in <see cref="ApiKeyEndpointExtensions"/>; <c>ApiKeyScopePolicyTests</c> fails for any <c>/api/v1</c> endpoint that
/// is not, so a new endpoint cannot ship reachable (or silently unreachable) by keys by accident.
/// </summary>
public static class ApiKeyFeature
{
    public const string Worlds = "worlds";
    public const string Settlements = "settlements";
    public const string Armies = "armies";
    public const string Guilds = "guilds";
    public const string Trade = "trade";
    public const string Leaderboards = "leaderboards";
    public const string Chat = "chat";
    public const string Profiles = "profiles";
    public const string Simulator = "simulator";
    public const string AdminWorlds = "admin.worlds";
    public const string AdminSettlements = "admin.settlements";
    public const string AdminArmies = "admin.armies";
    public const string AdminUsers = "admin.users";
    public const string AdminReports = "admin.reports";
    public const string AdminActivity = "admin.activity";

    /// <summary>Every feature, in the order the admin UI shows them.</summary>
    public static IReadOnlyList<ApiKeyFeatureInfo> Catalogue { get; } =
    [
        new(Worlds, true, false, "Worlds: listing, islands, camps, tiles, fog, membership, plot suggestions, and the caller's own renown and settlements."),
        new(Settlements, true, false, "Settlements: founding, reading, build and training queues, feasts, quests and runes."),
        new(Armies, true, false, "Armies: dispatching, retargeting and reading armies, plus battle, field-battle and camp reports."),
        new(Guilds, true, false, "Guilds: directory, membership, board, fees and peace treaties."),
        new(Trade, true, false, "Trade: offers, the board, shipments and trade reports."),
        new(Leaderboards, true, false, "Leaderboards: boards, own rank and weekly stat cards."),
        new(Chat, false, false, "Direct messages between users."),
        new(Profiles, false, false, "Player profiles: reading them, editing the owner's bio and locale, reporting a profile."),
        new(Simulator, false, false, "The premium battle simulator."),
        new(AdminWorlds, true, true, "Admin: create, configure, reseed and run-state of worlds."),
        new(AdminSettlements, true, true, "Admin: search settlements, grant resources and runes, edit layouts and garrisons."),
        new(AdminArmies, true, true, "Admin: list and edit armies."),
        new(AdminUsers, false, true, "Admin: list, edit, lock/ban and grant premium to users."),
        new(AdminReports, false, true, "Admin: moderation reports (messages and profiles)."),
        new(AdminActivity, false, true, "Admin: user activity summaries and sessions."),
    ];

    private static readonly Dictionary<string, ApiKeyFeatureInfo> ById =
        Catalogue.ToDictionary(f => f.Id, StringComparer.Ordinal);

    /// <summary>The catalogue entry for <paramref name="id"/>, or null when it is not a known feature.</summary>
    public static ApiKeyFeatureInfo? Find(string id) => ById.GetValueOrDefault(id);

    public static bool IsKnown(string id) => ById.ContainsKey(id);

    /// <summary>The lowest level a request with <paramref name="method"/> needs: safe methods read, everything else writes.</summary>
    public static ApiKeyAccess RequiredAccess(string method) =>
        HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method)
            ? ApiKeyAccess.Read
            : ApiKeyAccess.ReadWrite;
}
