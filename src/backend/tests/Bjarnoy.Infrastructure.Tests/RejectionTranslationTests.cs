using System.Text.Json;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Settlers;
using Bjarnoy.Domain.Trade;
using Bjarnoy.Infrastructure.Services;
using Bjarnoy.Infrastructure.Services.PlotReservations;

namespace Bjarnoy.Infrastructure.Tests;

/// <summary>
/// The rejection codes of the enums below (sent as the <c>rejection</c> extension of a ProblemDetails) have a player text in the
/// frontend's <c>apiErrors.rejections</c>, in English and German. Without one the UI shows only its generic fallback
/// ("Dispatch failed.") and the player never learns why the order was refused.
/// </summary>
/// <remarks>
/// The single string codes (<c>WorldPaused</c>, <c>UsernameTaken</c>, <c>RouteRateLimited</c>) and
/// <c>RecallOutcome</c> are not enum-wide either and are not covered here.
/// </remarks>
public class RejectionTranslationTests
{
    public static TheoryData<string> Locales => new() { "en", "de" };

    /// <summary>The enums whose values the endpoints send as <c>rejection</c> (<c>rejection.ToString()</c>).</summary>
    private static readonly Type[] WireRejectionEnums =
    [
        typeof(DispatchRejection),
        typeof(FieldOrderRejection),
        typeof(BuildRejection),
        typeof(TrainRejection),
        typeof(TradeRejection),
        typeof(FeastRejection),
        typeof(QuestRejection),
        typeof(FoundingRejection),
        typeof(PlotSuggestionRejection),
        typeof(GuildRejection),
    ];

    [Theory]
    [MemberData(nameof(Locales))]
    public void Every_wire_rejection_code_has_a_translation(string locale)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Bjarnoy.slnx")))
        {
            dir = dir.Parent;
        }

        var path = Path.Combine(dir!.Parent!.FullName, "frontend", "src", "i18n", "locales", locale, "apiErrors.json");
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        var rejections = doc.RootElement.GetProperty("rejections");

        var missing = WireRejectionEnums
            .SelectMany(e => Enum.GetNames(e).Where(n => n != "None").Select(n => (Enum: e.Name, Code: n)))
            .Where(c => !rejections.TryGetProperty(c.Code, out var text) || string.IsNullOrWhiteSpace(text.GetString()))
            .Select(c => $"{c.Enum}.{c.Code}")
            .Distinct()
            .ToList();

        Assert.Empty(missing);
    }
}
