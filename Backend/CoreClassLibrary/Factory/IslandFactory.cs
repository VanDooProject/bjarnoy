using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Biomes;
using CoreClassLibrary.Models.Map.Tiles;
using System;
using System.Linq;
using System.Numerics;
using CoreClassLibrary.Controller;

namespace CoreClassLibrary.Factory
{
    public class IslandFactory
    {
        private BiomFactory biom_factory = new BiomFactory();
        public Island GetRndIsland()
        {
            Vector3 startPosition = new Vector3(0, 0, 1);

            Island island = new Island(startPosition);

            island.name = GenerateRandomName();

            int start_value = 0;

            for(int loop_count = 1; loop_count < 5; loop_count++)
            {
                island.bioms.Add(biom_factory.GetRndBiomAndTiles(start_value));
                start_value = start_value + (int)island.bioms[loop_count - 1].attributes.size.value;
            }
            
            return island;
        }

        public Island GetRndIslandNew(int size, int z)
        {
            Vector3 startPosition = new Vector3(0, 0, z);
            Island island = new Island(startPosition);

            Random rnd = new Random();
            island.name = GenerateRandomName();
            if(size < 10)
            {
                size = 10;
            }
            island.size = rnd.Next(size - 5, size + 5);

            CreateAndAddRndStartBioms(island);
            ExpandBiomsAndCreateTiles(island);

            return island;
        }

        private void CreateAndAddRndStartBioms(Island island)
        {
            Random rnd = new Random();
            int nof_bioms_in_island = rnd.Next((int)((island.size / 4) + 1), (int)((island.size / 3) + 1));
            do
            {
                int x = rnd.Next(0, island.size);
                int y = rnd.Next(0, island.size);
                Vector3 position = new Vector3((float)x, (float)y, island.StartPosition.Z);

                var tile_already_exits = false;
                foreach (Biom b in island.bioms)
                {
                    foreach (Tile t in b.tiles)
                    {
                        if(Vector3.DistanceSquared(t.Position, position) <= SettingsController.Instance.GetSettings().V1.Vector3EqualsAllowedDistanceDisturbance)
                        {
                            tile_already_exits = true;
                            break;
                        }
                    }
                }
                if(tile_already_exits == false)
                {
                    island.bioms.Add(biom_factory.GetRndBiomAtStartPosition(position));
                    nof_bioms_in_island--;
                }
            } while (nof_bioms_in_island > 0);
        }

        private void ExpandBiomsAndCreateTiles(Island island)
        {
            int biomRadius = 1;
            do
            {
                foreach(Biom b in island.bioms)
                {
                    for(int yLoopCount = ((int) b.tiles.First().Position.Y - biomRadius); yLoopCount <= (int) b.tiles.First().Position.Y + biomRadius; yLoopCount++)
                    {
                        if((yLoopCount >= island.StartPosition.Y) && (yLoopCount < island.StartPosition.Y + island.size))
                        {
                            for (int xLoopCount = ((int)b.tiles.First().Position.X - biomRadius); xLoopCount <= (int)b.tiles.First().Position.X + biomRadius; xLoopCount++)
                            {
                                if((xLoopCount >= island.StartPosition.X) && (xLoopCount < island.StartPosition.X + island.size))
                                {
                                    var tile_already_exits = false;
                                    Vector3 newTilePosition = new Vector3(xLoopCount, yLoopCount, island.StartPosition.Z);

                                    foreach (Tile t in island.Tiles)
                                    {
                                        if (Vector3.DistanceSquared(t.Position, newTilePosition) <= SettingsController.Instance.GetSettings().V1.Vector3EqualsAllowedDistanceDisturbance)
                                        {
                                            tile_already_exits = true;
                                            break;
                                        }
                                    }

                                    if (tile_already_exits == false)
                                    {
                                        b.AddRndBiomTileAtPosition(newTilePosition);
                                    }
                                }
                            }
                        }
                    }
                    
                }
                biomRadius++;
            } while (island.Tiles.Count < (island.size * island.size));
        }

        private string GenerateRandomName()
        {
            string RandomName = "Refugium";

            return RandomName;
        }
    }

    internal class Vecotr3
    {
    }
}