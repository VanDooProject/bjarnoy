using System.Numerics;
using CoreClassLibrary.Models.Map.Coordinates;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class MountainTile : Tile
    {
        public MountainTile() : base()
        {
        }

        public MountainTile(HexCoordinates3D position) : base(position)
        {
        }
    }
}