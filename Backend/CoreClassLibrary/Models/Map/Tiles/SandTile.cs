using System.Numerics;
using CoreClassLibrary.Models.Map.Coordinates;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class SandTile : Tile
    {
        public SandTile() : base()
        {
        }

        public SandTile(HexCoordinates3D position) : base(position)
        {
        }
    }
}