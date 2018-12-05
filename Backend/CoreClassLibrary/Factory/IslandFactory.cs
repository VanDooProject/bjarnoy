using CoreClassLibrary.Models.Map;

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
                island.bioms.Add(biom_factory.GetRndBiom(start_value));
                start_value = start_value + (int)island.bioms[loop_count - 1].attributes.size.value;
            }
            
            return island;
        }

        private string GenerateRandomName()
        {
            string RandomName = "Refugium";

            return RandomName;
        }
    }
}