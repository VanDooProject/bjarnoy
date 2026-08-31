using Bjarnoy.Domain.World;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;

namespace Bjarnoy.Infrastructure.World;

/// <summary>
/// Encodes a <see cref="FogMaskBuffer"/> as an RGBA8 PNG, per
/// <c>docs/design/map-fog-v2.md</c> §2.2's channel layout: R = <see
/// cref="FogMaskCell.Unknown"/>, G = <see cref="FogMaskCell.OutOfSight"/>,
/// B = <see cref="FogMaskCell.NoiseSeed"/>, A = reserved (opaque). Kept
/// separate from <see cref="FogMaskGenerator"/> so the domain project can
/// stay free of package references — see <c>Bjarnoy.Domain.csproj</c>.
/// </summary>
public static class FogMaskPngEncoder
{
    public static byte[] Encode(FogMaskBuffer buffer)
    {
        using var image = new Image<Rgba32>(buffer.Bounds.Width, buffer.Bounds.Height);

        image.ProcessPixelRows(accessor =>
        {
            for (var row = 0; row < accessor.Height; row++)
            {
                var pixelRow = accessor.GetRowSpan(row);
                var v = buffer.Bounds.MinV + row;
                for (var col = 0; col < pixelRow.Length; col++)
                {
                    var u = buffer.Bounds.MinU + col;
                    var cell = buffer[new MaskTexel(u, v)];
                    pixelRow[col] = new Rgba32(cell.Unknown, cell.OutOfSight, cell.NoiseSeed, byte.MaxValue);
                }
            }
        });

        using var stream = new MemoryStream();
        image.Save(stream, new PngEncoder { ColorType = PngColorType.RgbWithAlpha });
        return stream.ToArray();
    }
}
