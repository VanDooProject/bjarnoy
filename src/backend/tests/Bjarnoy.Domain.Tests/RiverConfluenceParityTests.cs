using System.Text.Json;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// <c>RiverConfluence.Classify</c> against <c>src/shared/confluence-representability.json</c>,
/// the same table the frontend's <c>confluenceKind</c> is checked against.
/// </summary>
public class RiverConfluenceParityTests
{
    [Fact]
    public void Classify_matches_the_shared_table()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Bjarnoy.slnx")))
        {
            dir = dir.Parent;
        }

        var path = Path.Combine(dir!.Parent!.FullName, "shared", "confluence-representability.json");
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        var rows = doc.RootElement.GetProperty("rows").EnumerateArray().ToList();
        Assert.Equal(6 * 15, rows.Count);

        foreach (var row in rows)
        {
            var o = row.GetProperty("out").GetInt32();
            var a = row.GetProperty("inA").GetInt32();
            var b = row.GetProperty("inB").GetInt32();
            var expected = row.GetProperty("kind").GetString();
            var expectedKind = expected switch { "narrow" => ConfluenceKind.Narrow, "wide" => ConfluenceKind.Wide, _ => (ConfluenceKind?)null };

            Assert.Equal(expectedKind, RiverConfluence.Classify(a, b, o));
            Assert.Equal(expectedKind, RiverConfluence.Classify(b, a, o));
        }
    }

    [Fact]
    public void Classify_with_widths_matches_the_shared_table()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Bjarnoy.slnx")))
        {
            dir = dir.Parent;
        }

        var path = Path.Combine(dir!.Parent!.FullName, "shared", "confluence-representability.json");
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        var rows = doc.RootElement.GetProperty("riverStreamRows").EnumerateArray().ToList();
        Assert.Equal(6 * 30, rows.Count);

        foreach (var row in rows)
        {
            var o = row.GetProperty("out").GetInt32();
            var river = row.GetProperty("riverIn").GetInt32();
            var stream = row.GetProperty("streamIn").GetInt32();
            ConfluenceKind? expected = row.GetProperty("kind").GetString() == "riverstreamwide" ? ConfluenceKind.RiverStreamWide : null;

            Assert.Equal(expected, RiverConfluence.Classify(river, true, stream, false, o));
            Assert.Equal(expected, RiverConfluence.Classify(stream, false, river, true, o));
        }
    }
}
