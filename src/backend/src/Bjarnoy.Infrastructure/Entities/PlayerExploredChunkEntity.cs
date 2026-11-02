namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// One 64 x 64-texel chunk of a player's persisted explored history in one
/// world (fog v2 §1e/§3) — the "you've been here, can't see it now" memory a
/// pure function of *current* settlements/armies has no way to keep. See
/// <c>Bjarnoy.Domain.World.PersistedExploredBitset</c> for the bit-packing
/// and <c>FogChunkLayout</c> for the chunk grid; this entity only stores the
/// result.
/// </summary>
/// <remarks>
/// Sparse and compressed by construction: an untouched chunk has no row at
/// all, a chunk whose every hex is explored is <see cref="IsFull"/> with
/// <see cref="Bits"/> null, and only a partially explored chunk carries its
/// fixed 512-byte bitset. Storage therefore scales with the ground a player
/// has actually explored, not with the world's radius. The key is
/// <c>(WorldId, OwnerId, ChunkU, ChunkV)</c>, so a lookup for any chunk
/// rectangle is a range scan on the primary key.
/// </remarks>
public class PlayerExploredChunkEntity
{
    public Guid WorldId { get; set; }

    public WorldEntity? World { get; set; }

    /// <summary>Same anonymous-play player id every other ownership check in this codebase uses (see <c>OwnershipGate</c>).</summary>
    public required string OwnerId { get; set; }

    /// <summary>Chunk column, <c>floor(texelU / 64)</c> — see <c>FogChunkLayout</c>.</summary>
    public int ChunkU { get; set; }

    /// <summary>Chunk row, <c>floor(texelV / 64)</c> — see <c>FogChunkLayout</c>.</summary>
    public int ChunkV { get; set; }

    /// <summary>
    /// 512 bytes, one bit per texel in <c>FogChunkLayout.LocalIndex</c> order;
    /// <see langword="null"/> when <see cref="IsFull"/> (nothing left to
    /// record). Append-only, see <c>PersistedExploredBitset.Merge</c>.
    /// </summary>
    public byte[]? Bits { get; set; }

    /// <summary>Every hex texel of the chunk is explored; <see cref="Bits"/> is then null.</summary>
    public bool IsFull { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
