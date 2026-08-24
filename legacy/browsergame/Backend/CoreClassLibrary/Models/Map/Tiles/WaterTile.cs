using System.Numerics;
using CoreClassLibrary.Models.Map.Coordinates;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class WaterTile : Tile
    {
        public WaterTile() : base()
        {
        }

        public WaterTile(HexCoordinates3D position) : base(position)
        {
        }
    }
}