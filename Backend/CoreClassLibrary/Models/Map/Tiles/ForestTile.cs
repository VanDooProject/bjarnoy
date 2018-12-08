using System;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class ForestTile : ResourceTile
    {
        public ForestTile() : base()
        {
        }

        public ForestTile(int x, int y, int z) : base(x, y, z)
        {
            Random rnd = new Random();

            this.resource.degradation_rate = 0.5f;
            this.resource.resource_volume = 10000 * rnd.Next(1, 3);

            //this.type = "Resource";
        }

        public override void GetRndRessource()
        {

        }
    }
}