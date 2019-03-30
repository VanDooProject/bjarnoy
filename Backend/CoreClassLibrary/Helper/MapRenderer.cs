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

        public void GenerateBitmapFromIslands(List<Island> islands, string Filename)
        {
            List<Tile> tiles = new List<Tile>();

            foreach (Island island in islands)
            {
                tiles.AddRange(island.Tiles);
            }

            GenerateBitmapFromTiles(tiles, Filename);
        }
        public void GenerateBitmapFromIsland(Island island, string Filename)
        {
            List<Tile> tiles = island.Tiles;

            GenerateBitmapFromTiles(tiles, Filename);
        }

        public void GenerateBitmapFromTiles(List<Tile> tiles, string Filename)
        {
            double factor = 12;

            float maxX = tiles.Max(x => x.Position.X);
            float maxY = tiles.Max(x => x.Position.Y);
            float minX = tiles.Min(x => x.Position.X);
            float minY = tiles.Min(x => x.Position.Y);

            float offsetX = (minX < 0) ? Math.Abs(minX) + 1 : 0;
            float offsetY = (minY < 0) ? Math.Abs(minY) + 1 : 0;

            MagickColor BackgroundColor = new MagickColor("#ff00ff"); // pink
            BackgroundColor = MagickColor.FromRgb(2, 87, 224); // dark blue

            MagickImage image = new MagickImage(BackgroundColor,
                (int) Math.Ceiling((maxY + offsetY) * factor),
                (int) Math.Ceiling((maxX + offsetX) * factor)
            );

            foreach (Tile tile in tiles)
            {
                MagickColor color = TileToColor(tile);

                if (color != null)
                {
                    new Drawables()
                        .StrokeColor(color)
                        .FillColor(color)
                        .Rectangle(
                            (tile.Position.Y + offsetY) * factor - (minY + offsetY) * factor,
                            (tile.Position.X + offsetX) * factor - (minX + offsetX) * factor,
                            (tile.Position.Y + offsetY) * factor - (minY + offsetY) * factor + (factor - 1),
                            (tile.Position.X + offsetX) * factor - (minX + offsetX) * factor + (factor - 1)
                        )
                        .Draw(image);
                }
            }

            image.Write(Filename);
        }

        private static MagickColor TileToColor(Tile tile)
        {
            MagickColor color = null;

            if (tile is RawTile rawTile)
            {
                color = new MagickColor(0, 0, 0, (ushort) (rawTile.Elevation / 255 * 65535), 255 / 255 * 65535);
                //color = MagickColor.FromRgb(0,255,0);
            }
            else if (tile is WaterTile)
            {
                color = MagickColor.FromRgb(66, 134, 244);
            }
            else if (tile is CoastalWaterTile)
            {
                color = MagickColor.FromRgb(66, 188, 244);
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
            else if (tile is SandTile)
            {
                color = MagickColor.FromRgb(244, 229, 66);
            }

            return color;
        }
    }
}
