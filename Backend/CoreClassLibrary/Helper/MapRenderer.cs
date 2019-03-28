using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Tiles;
using ImageMagick;

namespace CoreClassLibrary.Helper
{
    public class MapRenderer
    {

        public void GenerateBitmapFromIsland(Island island, string Filename)
        {
            double factor = 12;

            float maxX = island.Tiles.Max(x => x.Position.X);
            float maxY = island.Tiles.Max(x => x.Position.Y);

            MagickImage image = new MagickImage(new MagickColor("#ff00ff"),
                (int)(maxY * factor),
                (int)(maxX * factor)
            );

            foreach (Tile tile in island.Tiles)
            {
                MagickColor color = null;

                if (tile is RawTile rawTile)
                {

                    color = new MagickColor(0, 0, 0, (ushort)(rawTile.Elevation / 255 * 65535), 255 / 255 * 65535);
                    //color = MagickColor.FromRgb(0,255,0);
                }
                else if (tile is WaterTile)
                {
                    color = MagickColor.FromRgb(66, 134, 244);
                }
                else if (tile is GrassTile)
                {
                    color = MagickColor.FromRgb(101, 219, 32);
                }
                else if (tile is ForestTile)
                {
                    color = MagickColor.FromRgb(31, 132, 36);
                }
                else if (tile is MountainTile)
                {
                    color = MagickColor.FromRgb(94, 96, 93);
                }

                if (color != null)
                {
                    new Drawables()
                        .StrokeColor(color)
                        .FillColor(color)
                        .Rectangle(
                            tile.Position.X * factor,
                            tile.Position.Y * factor,
                            tile.Position.X * factor + (factor - 1),
                            tile.Position.Y * factor + (factor - 1)
                        )
                        .Draw(image);
                }
            }

            image.Write(Filename);
        }
    }
}
