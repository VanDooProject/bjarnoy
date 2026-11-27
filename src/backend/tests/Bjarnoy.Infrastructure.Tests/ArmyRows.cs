using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Tests;

/// <summary>Army rows a test writes straight to the database.</summary>
internal static class ArmyRows
{
    /// <summary>
    /// Adds <paramref name="armies"/> to the context with the world and owner of each one's home settlement, as a real dispatch
    /// gives them (<see cref="ArmyEntity.For"/>). The home is read from the army's navigation, the context's unsaved settlements or the database.
    /// </summary>
    public static void AddArmyRows(this GameDbContext db, params ArmyEntity[] armies)
    {
        foreach (var army in armies)
        {
            var home = army.Settlement
                ?? db.Settlements.Local.FirstOrDefault(s => s.Id == army.SettlementId)
                ?? db.Settlements.AsNoTracking().Single(s => s.Id == army.SettlementId);
            army.WorldId = home.WorldId;
            army.OwnerId = home.OwnerId;
            army.UserId = home.UserId;
            db.Armies.Add(army);
        }
    }
}
