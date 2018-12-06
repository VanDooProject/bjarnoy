using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Biomes;
using CoreClassLibrary.Models.Map.Tiles;
using System;

namespace CoreClassLibrary.Factory
{
    public class IslandFactory
    {
        private BiomFactory biom_factory = new BiomFactory();
        public Island GetRndIsland()
        {
            Island island = new Island();

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
            Island island = new Island();

            Random rnd = new Random();
            island.name = GenerateRandomName();
            if(size < 10)
            {
                size = 10;
            }
            island.size = rnd.Next(size - 5, size + 5);

            int nof_bioms_in_island = rnd.Next(1, (int)(island.size / 3));
            do
            {
                int x = rnd.Next(0, island.size);
                int y = rnd.Next(0, island.size);

                var tile_already_exits = false;
                //biom_factory.GetRndBiomAtStartCoords(x, y, 1);
                foreach (Biom b in island.bioms)
                {
                    foreach(Tile t in b.tiles)
                    {
                        if(t.x == x && t.y == y && t.z == z)
                        {
                            tile_already_exits = true;
                            break;
                        }
                    }
                }
                if(tile_already_exits == false)
                {
                    island.bioms.Add(biom_factory.GetRndBiomAtStartCoords(x, y, z));
                    nof_bioms_in_island--;
                }
            } while (nof_bioms_in_island > 0);
                
            return island;
        }

        private string GenerateRandomName()
        {
            string RandomName = "Refugium";

            return RandomName;
        }
    }
}