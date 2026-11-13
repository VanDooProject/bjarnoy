namespace Bjarnoy.Domain.Units;

/// <summary>
/// The unit roster (issue #40 phase 1). Names and rough roles come from the
/// Viking setting; numbers are placeholders for a later balancing pass, not a
/// finished economy.
/// </summary>
/// <remarks>
/// Serialised to the client by name, lowercased, the same convention
/// <see cref="Bjarnoy.Domain.Buildings.BuildingType"/> uses.
/// </remarks>
public enum UnitType
{
    /// <summary>Cheap loot-carrier and the settlement's baseline defender.</summary>
    Thrall = 0,

    /// <summary>Balanced early infantry.</summary>
    Spearman = 1,

    /// <summary>Attack-leaning infantry.</summary>
    Axeman = 2,

    /// <summary>Defence-leaning infantry.</summary>
    Bowman = 3,

    /// <summary>Elite infantry; requires Axeman to be trainable first.</summary>
    Berserker = 4,

    /// <summary>Civilian food-carry specialist for supply runs.</summary>
    Provisioner = 5,

    /// <summary>Siege unit; requires Berserker to be trainable first.</summary>
    Catapult = 6,

    /// <summary>Troop transport ship. Trained at the Harbour.</summary>
    Karve = 7,

    /// <summary>The standard warship. Trained at the Shipyard.</summary>
    Snekkja = 8,

    /// <summary>
    /// Civilian coloniser (issue #55): five, standing together on an
    /// unclaimed hex, found a new settlement — see
    /// <see cref="Bjarnoy.Domain.Settlers.Founding"/>.
    /// </summary>
    Settler = 9,

    /// <summary>
    /// Siege unit (endgame step 2b): sturdier and slower than the catapult, the same siege power;
    /// requires Berserker to be trainable first.
    /// </summary>
    Ram = 10,

    /// <summary>
    /// Fire Hulk (was the Fire Ship): a hull with no attack and no slots, sent with a fleet to burn a building standing in the water (see
    /// <c>docs/design/economy.md</c>, "Fire Ship"). Trained at the Shipyard (the Fire Hulk).
    /// </summary>
    FireHulk = 11,

    /// <summary>
    /// Civilian that sets up a beach camp (<see cref="Bjarnoy.Domain.Settlers.BeachCamp"/>): two of them, landed on a free sand
    /// shore, build it and are used up doing so. See <c>docs/design/skirmish/beach-camp.md</c>.
    /// </summary>
    CampBuilder = 12,

    /// <summary>
    /// Fast, cheap ranged foot unit trained at the Archery Range: throws spears in the volley before the main fight
    /// (<c>docs/design/units-and-ships.md</c> section 4), weak in the fight itself.
    /// </summary>
    Skirmisher = 13,

    /// <summary>Scout boat: tiny, fast, wide vision, no cargo. Trained at the Harbour.</summary>
    Faering = 14,

    /// <summary>Small cargo ship, no troops. Trained at the Harbour.</summary>
    Byrding = 15,

    /// <summary>Big cargo ship, no troops. Trained at the Harbour.</summary>
    Knarr = 16,

    /// <summary>The heavier longship: the fastest and strongest warship. Trained at the Shipyard.</summary>
    Skeid = 17,

    /// <summary>Cheap fire craft: fifty burn one building level in the water. Trained at the Shipyard.</summary>
    FireRaft = 18,

}

public static class UnitTypeExtensions
{
    public static string ToWireName(this UnitType type) => type switch
    {
        UnitType.Thrall => "thrall",
        UnitType.Spearman => "spearman",
        UnitType.Axeman => "axeman",
        UnitType.Bowman => "bowman",
        UnitType.Berserker => "berserker",
        UnitType.Provisioner => "provisioner",
        UnitType.Catapult => "catapult",
        UnitType.Karve => "karve",
        UnitType.Snekkja => "snekkja",
        UnitType.Settler => "settler",
        UnitType.Ram => "ram",
        UnitType.FireHulk => "firehulk",
        UnitType.CampBuilder => "campbuilder",
        UnitType.Faering => "faering",
        UnitType.Byrding => "byrding",
        UnitType.Knarr => "knarr",
        UnitType.Skeid => "skeid",
        UnitType.FireRaft => "fireraft",
        UnitType.Skirmisher => "skirmisher",
        _ => throw new ArgumentOutOfRangeException(nameof(type), type, "Unknown unit type"),
    };
}
