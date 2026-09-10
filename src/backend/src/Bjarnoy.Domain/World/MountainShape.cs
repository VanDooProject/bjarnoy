namespace Bjarnoy.Domain.World;

/// <summary>
/// Which mountain art the tile pack ships, mirroring VanDooProject/3D_assets'
/// <c>hextileNNN_mountaintile_&lt;shape&gt;</c> family (PR #36 there). The
/// numeric values double as <see cref="TerrainSampler.VariantAt"/>'s index
/// space for <see cref="Terrain.Mountain"/>, so don't reorder them without
/// checking that comment.
/// </summary>
public enum MountainShape
{
    /// <summary>The original single mountain render (<c>hextile004</c>).</summary>
    Cone = 0,

    /// <summary>Flat-topped mountain (<c>hextile043</c>).</summary>
    Table = 1,

    /// <summary>Two-peak mountain (<c>hextile044</c>).</summary>
    Saddleback = 2,

    /// <summary>Horseshoe mountain (<c>hextile045</c>).</summary>
    Corrie = 3,
}

public static class MountainShapeExtensions
{
    /// <summary>
    /// Only Saddleback and Corrie shipped a spring cut (<c>hextile046</c>/
    /// <c>hextile047</c>) — Cone and Table have no <c>_spring</c> art at all.
    /// </summary>
    public static bool IsSpringCapable(this MountainShape shape) =>
        shape is MountainShape.Saddleback or MountainShape.Corrie;
}
