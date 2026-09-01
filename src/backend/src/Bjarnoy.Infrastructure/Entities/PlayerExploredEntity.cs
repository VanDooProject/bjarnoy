namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// A player's persisted explored-history bitset for one world (issue: fog v2
/// §1e) — the "you've been here, can't see it now" memory that a pure
/// function of *current* settlements/armies has no way to keep. See
/// <c>Bjarnoy.Domain.World.PersistedExploredBitset</c> for the bit-packing
/// itself; this entity only stores the resulting bytes.
/// </summary>
/// <remarks>
/// Whole-world, not per-chunk: §1e's own design describes a
/// <c>(playerId, worldId, chunkCoord)</c> key, but chunked mask delivery (§3)
/// isn't built yet anywhere in this codebase — <c>FogMaskService</c> still
/// bakes the whole world in one call. Keying this one row per
/// <c>(WorldId, OwnerId)</c> instead matches that reality; splitting it by
/// chunk is real follow-up work for whenever §3 actually lands, not
/// something to half-build ahead of it here.
/// </remarks>
public class PlayerExploredEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid WorldId { get; set; }

    public WorldEntity? World { get; set; }

    /// <summary>Same anonymous-play player id every other ownership check in this codebase uses (see <c>OwnershipGate</c>).</summary>
    public required string OwnerId { get; set; }

    /// <summary>
    /// <see cref="Bjarnoy.Domain.World.PersistedExploredBitset"/>-encoded bits
    /// over <c>FogMaskLayout.WorldBounds(world.Radius)</c> — append-only, see
    /// <c>PersistedExploredBitset.Merge</c>.
    /// </summary>
    public byte[] Bits { get; set; } = [];

    public DateTimeOffset UpdatedAt { get; set; }
}
