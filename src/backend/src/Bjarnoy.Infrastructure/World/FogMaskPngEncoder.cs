using Bjarnoy.Domain.World;
using SkiaSharp;

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
        using var bitmap = new SKBitmap(
            buffer.Bounds.Width, buffer.Bounds.Height, SKColorType.Rgba8888, SKAlphaType.Unpremul);

        for (var row = 0; row < buffer.Bounds.Height; row++)
        {
            var v = buffer.Bounds.MinV + row;
            for (var col = 0; col < buffer.Bounds.Width; col++)
            {
                var u = buffer.Bounds.MinU + col;
                var cell = buffer[new MaskTexel(u, v)];
                bitmap.SetPixel(col, row, new SKColor(cell.Unknown, cell.OutOfSight, cell.NoiseSeed, byte.MaxValue));
            }
        }

        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Png, quality: 100);
        return data.ToArray();
    }
}
