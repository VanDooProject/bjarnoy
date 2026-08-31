using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.World;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace Bjarnoy.Infrastructure.Tests.World;

public class FogMaskPngEncoderTests
{
    [Fact]
    public void Encodes_a_decodable_png_of_the_buffers_dimensions()
    {
        var bounds = FogMaskLayout.WorldBounds(3);
        var mask = FogMaskGenerator.Generate(bounds, [], new HashSet<HexCoord>());

        var png = FogMaskPngEncoder.Encode(mask);

        using var image = Image.Load<Rgba32>(png);
        Assert.Equal(bounds.Width, image.Width);
        Assert.Equal(bounds.Height, image.Height);
    }

    [Fact]
    public void Channels_match_the_mask_format_layout_from_the_design_doc()
    {
        // §2.2: R = unknown, G = outOfSight, B = noise seed, A = reserved (opaque).
        var source = new FogVisionSource(HexCoord.Origin, ExploredRadius: 3, VisibleRadius: 1);
        var bounds = FogMaskLayout.WorldBounds(6);
        var mask = FogMaskGenerator.Generate(bounds, [source], new HashSet<HexCoord>());

        var png = FogMaskPngEncoder.Encode(mask);

        using var image = Image.Load<Rgba32>(png);
        var originTexel = FogMaskLayout.ToTexel(HexCoord.Origin);
        var originCell = mask[originTexel];
        var pixel = image[originTexel.U - bounds.MinU, originTexel.V - bounds.MinV];

        Assert.Equal(originCell.Unknown, pixel.R);
        Assert.Equal(originCell.OutOfSight, pixel.G);
        Assert.Equal(originCell.NoiseSeed, pixel.B);
        Assert.Equal(byte.MaxValue, pixel.A);
    }

    [Fact]
    public void Encoding_is_deterministic_for_the_same_mask()
    {
        var bounds = FogMaskLayout.WorldBounds(4);
        var mask = FogMaskGenerator.Generate(bounds, [], new HashSet<HexCoord>());

        var first = FogMaskPngEncoder.Encode(mask);
        var second = FogMaskPngEncoder.Encode(mask);

        Assert.Equal(first, second);
    }
}
