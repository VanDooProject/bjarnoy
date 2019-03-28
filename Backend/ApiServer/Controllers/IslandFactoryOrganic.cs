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
            MapRenderer.GenerateBitmapFromIsland(island, "map.png");

            return island;
        }

        private Tile GetRawTile(int x, int y, int z)
        {
            float Elevation = Noise.CalcPixel2D(x, y, 0.01f);
            float Humidity = Noise.CalcPixel2D(x, y, 0.025f);
            Vector3 position = new Vector3(x, y, z);

            if (Elevation < 100)
            {
                return new WaterTile(position);
            }
            else if (Elevation < 115)
            {
                return new GrassTile(position);
            }
            else if (Elevation < 180)
            {
                if (Humidity > 128)
                {
                    return new GrassTile(position);
                }
                else
                {
                    return new ForestTile(position);
                }
            }
            else if (Elevation < 220)
            {
                if (Humidity > 180)
                {
                    return new GrassTile(position);
                }
                else
                {
                    return new ForestTile(position);
                }
            }
            else if (Elevation < 255)
            {
                return new MountainTile(position);
            }
            else
            {
                return new RawTile(position)
                {
                    Elevation = (double)Elevation
                };
            }

        }

        private string GenerateRandomName()
        {
            string RandomName = "Refugium";

            return RandomName;
        }
    }
}