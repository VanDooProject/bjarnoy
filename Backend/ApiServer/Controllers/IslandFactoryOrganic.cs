using System;
using System.Linq;
using System.Numerics;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Helper;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Tiles;
using ImageMagick;
using SimplexNoise;


namespace ApiServer.Controllers
{
    public class IslandFactoryOrganic : IIslandFactory
    {
        public Island GetRndIsland(int size, int z)
        {
            int seed = 3;
            Noise.Seed = seed;

            Vector3 startPosition = new Vector3(0, 0, z);
            Island island = new Island(startPosition);

            island.name = GenerateRandomName();

            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    island.Tiles.Add(this.GetRawTile(x, y, z));
                }
            }

            var MapRenderer = new MapRenderer();
            MapRenderer.GenerateBitmapFromIsland(island, "map_01.png");
            MapRenderer.GenerateBitmapFromIsland(ConvertIslandFromRawTiles(island), "map_02.png");

            this.MakeWaterSurrounding(island);
            MapRenderer.GenerateBitmapFromIsland(island, "map_03.png");
            MapRenderer.GenerateBitmapFromIsland(ConvertIslandFromRawTiles(island), "map_04.png");

            return island;
        }

        private void MakeWaterSurrounding(Island island)
        {
            float maxX = island.Tiles.Max(x => x.Position.X);
            float maxY = island.Tiles.Max(x => x.Position.Y);
            float minX = island.Tiles.Min(x => x.Position.X);
            float minY = island.Tiles.Min(x => x.Position.Y);

            float size = maxX - minX;

            const double borderFactor = 0.12;
            const double borderFactorInverse = 1 / borderFactor;


            foreach (Tile tile in island.Tiles)
            {
                // calculate distance to edge
                double distanceFactorMaxX = Math.Abs(tile.Position.X - maxX) / size;
                double distanceFactorMaxY = Math.Abs(tile.Position.Y - maxY) / size;
                double distanceFactorMinX = Math.Abs(tile.Position.X - minX) / size;
                double distanceFactorMinY = Math.Abs(tile.Position.Y - minY) / size;

                if (tile is RawTile rawTile)
                {
                    if (distanceFactorMaxX < borderFactor) { rawTile.Elevation = rawTile.Elevation * distanceFactorMaxX * borderFactorInverse; } // rawTile.Elevation * distanceFactorMaxX
                    if (distanceFactorMaxY < borderFactor) { rawTile.Elevation = rawTile.Elevation * distanceFactorMaxY * borderFactorInverse; } // rawTile.Elevation * distanceFactorMaxY
                    if (distanceFactorMinX < borderFactor) { rawTile.Elevation = rawTile.Elevation * distanceFactorMinX * borderFactorInverse; } // rawTile.Elevation * distanceFactorMinX
                    if (distanceFactorMinY < borderFactor) { rawTile.Elevation = rawTile.Elevation * distanceFactorMinY * borderFactorInverse; } // rawTile.Elevation * distanceFactorMinY
                }
            }
        }

        private Tile GetRawTile(int x, int y, int z)
        {
            float Elevation = Noise.CalcPixel2D(x, y, 0.08f); // for size 100 -  0.01f - works well
            float Humidity = Noise.CalcPixel2D(x, y, 0.1f); // for size 100 - 0.025f - works well
            Vector3 position = new Vector3(x, y, z);

            return new RawTile(position)
            {
                Elevation = (double)Elevation,
                Humidity = (double)Humidity
            };
        }

        private Tile ConvertRawTileToSpecific(RawTile rawTile)
        {
            if (rawTile.Elevation < 100)
            {
                return new WaterTile(rawTile.Position);
            }
            else if (rawTile.Elevation < 115)
            {
                return new GrassTile(rawTile.Position);
            }
            else if (rawTile.Elevation < 180)
            {
                if (rawTile.Humidity > 128)
                {
                    return new GrassTile(rawTile.Position);
                }
                else
                {
                    return new ForestTile(rawTile.Position);
                }
            }
            else if (rawTile.Elevation < 220)
            {
                if (rawTile.Humidity > 180)
                {
                    return new GrassTile(rawTile.Position);
                }
                else
                {
                    return new ForestTile(rawTile.Position);
                }
            }
            else// if (rawTile.Elevation <= 255)
            {
                return new MountainTile(rawTile.Position);
            }
            // else
            // {
            //     throw new NotImplementedException();
            // }

        }

        private Island ConvertIslandFromRawTiles(Island island)
        {
            // TODO: fix "deepcopy"
            Island tmpIsland = new Island(island.StartPosition);
            tmpIsland.name = island.name;

            foreach (Tile tile in island.Tiles)
            {
                if (tile is RawTile rawTile)
                    tmpIsland.Tiles.Add(this.ConvertRawTileToSpecific(rawTile));
            }

            return tmpIsland;
        }

        private string GenerateRandomName()
        {
            string RandomName = "Refugium";

            return RandomName;
        }
    }
}