using System.ComponentModel.DataAnnotations;
using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Api.Contracts;

/// <summary>
/// One unit line in an admin army edit. Unlike <see cref="UnitCountRequest"/>
/// (a player's dispatch, where asking for zero of something is meaningless) a
/// count of zero is allowed here and simply drops that stack.
/// </summary>
public sealed record AdminUnitCountRequest(
    [property: Required] string Unit,
    [property: Range(0, int.MaxValue)] int Count);

/// <param name="Units">
/// Full replacement for the army's stacks. Omit to leave them alone; a list
/// that leaves the army with no units at all is refused (delete is not an
/// edit).
/// </param>
/// <param name="Provisions">Absolute food load, not a delta. Omit to leave it alone.</param>
/// <param name="ArriveInMinutes">
/// Retimes the army's current journey so it arrives this many game-minutes
/// from now — <c>0</c> lands it immediately. Omit to leave the timing alone.
/// Only meaningful for an army actually travelling.
/// </param>
/// <param name="Position">Hex to place the army on, standing there as of now with a fresh route home.</param>
public sealed record AdminEditArmyRequest(
    IReadOnlyList<AdminUnitCountRequest>? Units = null,
    double? Provisions = null,
    double? ArriveInMinutes = null,
    HexPointRequest? Position = null);

/// <summary>An army in the admin troop browser: the army itself plus who owns it.</summary>
public sealed record AdminArmyResponse(
    ArmyResponse Army, Guid WorldId, string SettlementName, string OwnerName)
{
    public static AdminArmyResponse From(ArmyEntity entity, DateTimeOffset gameNow)
    {
        ArgumentNullException.ThrowIfNull(entity);
        ArgumentNullException.ThrowIfNull(entity.Settlement);

        return new AdminArmyResponse(
            ArmyResponse.From(entity, gameNow),
            entity.Settlement.WorldId,
            entity.Settlement.Name,
            entity.Settlement.OwnerName);
    }
}
