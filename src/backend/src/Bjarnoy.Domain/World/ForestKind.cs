namespace Bjarnoy.Domain.World;

/// <summary>
/// Which wood a living (non-wasted) forest hex is — see <see cref="TerrainSampler.ForestKindAt"/>.
/// Mirrors the frontend's <c>ForestKind</c> (<c>'taiga' | 'birch' | 'mixed'</c>).
/// </summary>
public enum ForestKind
{
    Taiga = 0,
    Birch = 1,
    Mixed = 2,
}
