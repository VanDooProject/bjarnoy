using CoreClassLibrary.Models.Map;
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
                biom_factory.GetRndBiomAtStartCoords(0, 0, 1);
                //foreach
                //island.bioms.Add(biom_factory.GetRndBiomAtStartCoords(rnd.Next(0, island.size), rnd.Next(0, island.size), z));
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