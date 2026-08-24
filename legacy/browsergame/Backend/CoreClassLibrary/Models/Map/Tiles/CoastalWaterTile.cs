using System.Numerics;
using CoreClassLibrary.Models.Map.Coordinates;

namespace CoreClassLibrary.Models.Map.Tiles
{
    // TODO - check if this should be a waterTile
    public class CoastalWaterTile : Tile
    {
        public CoastalWaterTile() : base()
        {
        }

        public CoastalWaterTile(HexCoordinates3D position) : base(position)
        {
        }
    }
}