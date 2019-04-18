using System.Numerics;
using CoreClassLibrary.Models.Map.Coordinates;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class StoneResourceTile : ResourceTile
    {
        public StoneResourceTile() : base()
        {
        }

        public StoneResourceTile(HexCoordinates3D position) : base(position)
        {
            this.Resource.Type = TileAttributesResourceTypeList.Stone;
            this.Resource.DegradationRate = 0.6f;
        }
    }
}