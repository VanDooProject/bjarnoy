using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>The report tables a player's inbox is built from.</summary>
public enum InboxReportKind
{
    Battle,
    Field,
    Camp,
    Army,
    Trade,
}

/// <summary>
/// Per-player report read state: each report side stores the wall time its player first opened it
/// (<c>ReadAt</c>, null = unread). Matching on the side's owner id is the ownership check.
/// </summary>
public sealed class ReportReadService(GameDbContext db, TimeProvider time)
{
    /// <summary>Parses the wire name of a report kind (battle|field|camp|army|trade, case-insensitive).</summary>
    public static bool TryParseKind(string? wire, out InboxReportKind kind)
    {
        kind = default;
        return wire is not null
            && Enum.TryParse(wire, ignoreCase: true, out kind)
            && Enum.IsDefined(kind)
            && !int.TryParse(wire, out _);
    }

    /// <summary>
    /// Marks one report read for <paramref name="ownerId"/> (both sides when the player is on both). Idempotent: the
    /// first read time is kept. False when the report is missing, in another world, or the player is no party to it.
    /// </summary>
    public async Task<bool> MarkReadAsync(Guid worldId, string ownerId, InboxReportKind kind, Guid reportId, CancellationToken ct)
    {
        var now = time.GetUtcNow();
        var matched = 0;
        switch (kind)
        {
            case InboxReportKind.Battle:
                matched += await db.BattleReports
                    .Where(r => r.Id == reportId && r.WorldId == worldId && r.AttackerOwnerId == ownerId)
                    .ExecuteUpdateAsync(s => s.SetProperty(r => r.AttackerReadAt, r => r.AttackerReadAt ?? now), ct);
                matched += await db.BattleReports
                    .Where(r => r.Id == reportId && r.WorldId == worldId && r.DefenderOwnerId == ownerId)
                    .ExecuteUpdateAsync(s => s.SetProperty(r => r.DefenderReadAt, r => r.DefenderReadAt ?? now), ct);
                break;
            case InboxReportKind.Field:
                matched += await db.FieldBattleReports
                    .Where(r => r.Id == reportId && r.WorldId == worldId && r.SideAOwnerId == ownerId)
                    .ExecuteUpdateAsync(s => s.SetProperty(r => r.SideAReadAt, r => r.SideAReadAt ?? now), ct);
                matched += await db.FieldBattleReports
                    .Where(r => r.Id == reportId && r.WorldId == worldId && r.SideBOwnerId == ownerId)
                    .ExecuteUpdateAsync(s => s.SetProperty(r => r.SideBReadAt, r => r.SideBReadAt ?? now), ct);
                break;
            case InboxReportKind.Trade:
                matched += await db.TradeReports
                    .Where(r => r.Id == reportId && r.WorldId == worldId && r.PosterOwnerId == ownerId)
                    .ExecuteUpdateAsync(s => s.SetProperty(r => r.PosterReadAt, r => r.PosterReadAt ?? now), ct);
                matched += await db.TradeReports
                    .Where(r => r.Id == reportId && r.WorldId == worldId && r.AcceptorOwnerId == ownerId)
                    .ExecuteUpdateAsync(s => s.SetProperty(r => r.AcceptorReadAt, r => r.AcceptorReadAt ?? now), ct);
                break;
            case InboxReportKind.Camp:
                matched += await db.CampReports
                    .Where(r => r.Id == reportId && r.WorldId == worldId && r.OwnerId == ownerId)
                    .ExecuteUpdateAsync(s => s.SetProperty(r => r.ReadAt, r => r.ReadAt ?? now), ct);
                break;
            case InboxReportKind.Army:
                matched += await db.ArmyReports
                    .Where(r => r.Id == reportId && r.WorldId == worldId && r.OwnerId == ownerId)
                    .ExecuteUpdateAsync(s => s.SetProperty(r => r.ReadAt, r => r.ReadAt ?? now), ct);
                break;
            default:
                return false;
        }

        return matched > 0;
    }

    /// <summary>Marks every unread report side of <paramref name="ownerId"/> in the world read; returns how many sides changed.</summary>
    public async Task<int> MarkAllReadAsync(Guid worldId, string ownerId, CancellationToken ct)
    {
        var now = time.GetUtcNow();
        var n = 0;
        n += await db.BattleReports
            .Where(r => r.WorldId == worldId && r.AttackerOwnerId == ownerId && r.AttackerReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.AttackerReadAt, now), ct);
        n += await db.BattleReports
            .Where(r => r.WorldId == worldId && r.DefenderOwnerId == ownerId && r.DefenderReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.DefenderReadAt, now), ct);
        n += await db.FieldBattleReports
            .Where(r => r.WorldId == worldId && r.SideAOwnerId == ownerId && r.SideAReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.SideAReadAt, now), ct);
        n += await db.FieldBattleReports
            .Where(r => r.WorldId == worldId && r.SideBOwnerId == ownerId && r.SideBReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.SideBReadAt, now), ct);
        n += await db.TradeReports
            .Where(r => r.WorldId == worldId && r.PosterOwnerId == ownerId && r.PosterReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.PosterReadAt, now), ct);
        n += await db.TradeReports
            .Where(r => r.WorldId == worldId && r.AcceptorOwnerId == ownerId && r.AcceptorReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.AcceptorReadAt, now), ct);
        n += await db.CampReports
            .Where(r => r.WorldId == worldId && r.OwnerId == ownerId && r.ReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.ReadAt, now), ct);
        n += await db.ArmyReports
            .Where(r => r.WorldId == worldId && r.OwnerId == ownerId && r.ReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.ReadAt, now), ct);
        return n;
    }
}
