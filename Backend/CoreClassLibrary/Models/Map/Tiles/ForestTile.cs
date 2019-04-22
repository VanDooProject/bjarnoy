using System;
using System.Numerics;
using CoreClassLibrary.Models.Map.Coordinates;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class ForestTile : ResourceTile
    {
        public ForestTile() : base()
        {
        }

        public ForestTile(HexCoordinates3D position) : base(position)
        {
            Random rnd = new Random();

            this.Resource.DegradationRate = 0.5f;
            this.Resource.ResourceVolume = 10000 * rnd.Next(1, 3);
        }

        public override void GetRndResource()
        {
        }
    }
}