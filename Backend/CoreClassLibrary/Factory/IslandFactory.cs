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
            for(int loop_count = 0; loop_count < 4; loop_count++)
            {
                island.bioms.Add(biom_factory.GetRndBiom());
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