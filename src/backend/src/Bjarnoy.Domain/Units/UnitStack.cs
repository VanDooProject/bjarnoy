namespace Bjarnoy.Domain.Units;

/// <summary>Some number of one unit type standing in a garrison.</summary>
public readonly record struct UnitStack(UnitType Type, int Count);
