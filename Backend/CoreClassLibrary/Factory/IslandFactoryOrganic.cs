using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Helper;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Tiles;
using ImageMagick;
using log4net;
using SimplexNoise;


namespace ApiServer.Controllers
{
    public class IslandFactoryOrganic : IIslandFactory
    {
        private readonly ILog logger = LogManager.GetLogger(typeof(IslandFactoryOrganic));

        private readonly Random randomGenerator;

        private readonly Array OrientationValues = Enum.GetValues(typeof(Tile.eOrientation));

        public IslandFactoryOrganic(int seed)
        {
            Noise.Seed = seed;
            randomGenerator = new Random(seed);
        }

        public Island GetRndIsland(int sizeOfIsland, int z)
        {

            Vector3 startPosition = new Vector3(0, 0, z);
            Island island = new Island(startPosition);
            island.size = sizeOfIsland;

            island.name = GenerateRandomName();

            for (int y = 0; y < sizeOfIsland; y++)
            {
                for (int x = 0; x < sizeOfIsland; x++)
                {
                    island.Tiles.Add(this.GetRawTile(x, y, z, sizeOfIsland));
                }
            }

            var MapRenderer = new MapRenderer();
            MapRenderer.GenerateBitmapFromIsland(island, "map_01.png");
            MapRenderer.GenerateBitmapFromIsland(ConvertIslandFromRawTiles(island), "map_02.png");

            this.MakeWaterSurrounding(island);
            MapRenderer.GenerateBitmapFromIsland(island, "map_03.png");
            MapRenderer.GenerateBitmapFromIsland(ConvertIslandFromRawTiles(island), "map_04.png");

            island = ConvertIslandFromRawTiles(island);
            var SubIslands = this.ScanIslands(island);
            Island BiggestIsland = SubIslands.OrderByDescending(i => i.Tiles.Count).First();
            MapRenderer.GenerateBitmapFromIsland(BiggestIsland, "map_05.png");

            // TODO: handle error when no island was found


            this.addShallowWater(BiggestIsland, z, sizeOfIsland);
            MapRenderer.GenerateBitmapFromIsland(BiggestIsland, "map_06.png");

            return BiggestIsland;
        }

        private void addShallowWater(Island island, int z, int sizeOfIsland)
        {
            for (int y = 0; y < sizeOfIsland; y++)
            {
                for (int x = 0; x < sizeOfIsland; x++)
                {
                    Vector3 pos = new Vector3(x, y, z);
                    List<Tile> neighbors = island.getNeighbors(pos);

                    if (neighbors.Count(t => !(t is CoastalWaterTile)) > 0 && island.getTile(pos) == null)
                    {
                        island.Tiles.Add(new CoastalWaterTile(pos));
                    }
                }
            }
        }

        private List<Island> ScanIslands(Island MainIsland)
        {
            List<Tile> ScannedTiles = new List<Tile>();
            List<Island> SubIslands = new List<Island>();

            foreach (Tile tile in MainIsland.Tiles)
            {
                if (! (tile is WaterTile))
                {
                    if (!ScannedTiles.Contains(tile))
                    {
                        Island subIsland = this.ScanIsland(MainIsland, tile);
                        SubIslands.Add( subIsland );

                        ScannedTiles.AddRange(subIsland.Tiles);

                        logger.DebugFormat("Found SubIsland with size {0}", subIsland.Tiles.Count);
                    }
                }
            }

            return SubIslands;
        }

        private Island ScanIsland(Island MainIsland, Tile startTile)
        {
            // TODO: fix "deepcopy"
            Island tmpIsland = new Island(MainIsland.StartPosition);
            tmpIsland.name = MainIsland.name;
            tmpIsland.size = MainIsland.size;

            tmpIsland.Tiles.Add(startTile);
            scanFromTile(MainIsland, startTile, tmpIsland);

            return tmpIsland;
        }

        private static void scanFromTile(Island MainIsland, Tile startTile, Island tmpIsland)
        {
            foreach (Tile tile in MainIsland.getNeighbors(startTile))
            {
                if (tile is WaterTile || tmpIsland.Tiles.Contains(tile))
                {
                    // ignore this tile - because its water or already scanned
                    continue;
                }

                tmpIsland.Tiles.Add(tile);
                scanFromTile(MainIsland, tile, tmpIsland);
            }
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

        private Tile GetRawTile(int x, int y, int z, int sizeOfIsland)
        {
            float ElevationFactor = (100 / sizeOfIsland) * 0.02f;
            float HumidityFactor  = (100 / sizeOfIsland) * 0.0025f;

            float Elevation = Noise.CalcPixel2D(x, y, 0.08f); // for size 100 -  0.01f - works well  for 25 - 0.08f
            float Humidity = Noise.CalcPixel2D(x, y,  0.1f);  // for size 100 - 0.025f - works well  for 25 - 0.1f

            Vector3 position = new Vector3(x, y, z);

            return new RawTile(position)
            {
                Elevation = (double)Elevation,
                Humidity = (double)Humidity
            };
        }

        private Tile ConvertRawTileToSpecific(RawTile rawTile)
        {
            if (rawTile.Elevation < 105)
            {
                return new WaterTile(rawTile.Position);
            }
            else if (rawTile.Elevation < 130)
            {
                return new SandTile(rawTile.Position);
            }
            else if (rawTile.Elevation < 190)
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
            else if (rawTile.Elevation < 230)
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
            tmpIsland.size = island.size;

            foreach (Tile tile in island.Tiles)
            {
                if (tile is RawTile rawTile)
                {
                    Tile convertedTile = this.ConvertRawTileToSpecific(rawTile);

                    // TODO - refactor to somewhere else (maybe the convert method)
                    convertedTile.Orientation = getRandomOrientation();

                    tmpIsland.Tiles.Add(convertedTile);
                }
            }

            return tmpIsland;
        }

        private Tile.eOrientation getRandomOrientation()
        {
            return (Tile.eOrientation)OrientationValues.GetValue(randomGenerator.Next(OrientationValues.Length));
        }

        private string GenerateRandomName()
        {
            string RandomName = "Refugium";

            return RandomName;
        }
    }
}