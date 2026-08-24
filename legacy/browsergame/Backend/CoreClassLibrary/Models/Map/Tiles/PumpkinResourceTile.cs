using System.Numerics;
using CoreClassLibrary.Models.Map.Coordinates;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class PumpkinResourceTile : ResourceTile
    {
        public PumpkinResourceTile() : base()
        {
        }

        public PumpkinResourceTile(HexCoordinates3D position) : base(position)
        {
            this.Resource.Type = TileAttributesResourceTypeList.Pumpkin;
            this.Resource.DegradationRate = 0.4f;
        }
    }
}