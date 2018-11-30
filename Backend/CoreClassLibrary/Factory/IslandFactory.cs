using CoreClassLibrary.Models.Map;

namespace CoreClassLibrary.Factory
{
    public class IslandFactory
    {
        private string[] IslandAttributes = new string[]
        {
            "fanncy",
            "huge"
        };

        public Island GetIsland()
        {
            Island island = new Island();

            // TODO: dann genereieren wir mal random insel namen
            // https://stackoverflow.com/questions/2019417/how-to-access-random-item-in-list


            return island;
        }

        private string GenerateRandomName()
        {
            string RandomName = "";

            // https://stackoverflow.com/questions/2019417/how-to-access-random-item-in-list
            
            return RandomName;
        }
    }
}