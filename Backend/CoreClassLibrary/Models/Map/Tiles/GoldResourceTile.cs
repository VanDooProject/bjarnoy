using System.Numerics;
using CoreClassLibrary.Models.Map.Coordinates;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class GoldResourceTile : ResourceTile
    {
        public GoldResourceTile() : base()
        {
        }

        public GoldResourceTile(HexCoordinates3D position) : base(position)
        {
            this.Resource.Type = TileAttributesResourceTypeList.Gold;
            this.Resource.DegradationRate = 0.2f;
        }
    }
}