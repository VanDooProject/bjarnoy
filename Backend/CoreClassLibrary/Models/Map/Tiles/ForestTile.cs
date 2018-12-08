using System;
using System.Numerics;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class ForestTile : ResourceTile
    {
        public ForestTile() : base()
        {
        }

        public ForestTile(Vector3 position) : base(position)
        {
            Random rnd = new Random();

            this.Resource.DegradationRate = 0.5f;
            this.Resource.ResourceVolume = 10000 * rnd.Next(1, 3);

            //this.type = "Resource";
        }

        public override void GetRndResource()
        {

        }
    }
}