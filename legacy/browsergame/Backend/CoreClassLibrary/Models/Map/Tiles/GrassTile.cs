using System.Numerics;
using CoreClassLibrary.Models.Map.Coordinates;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class GrassTile : Tile
    {
        public GrassTile() : base()
        {
        }

        public GrassTile(HexCoordinates3D position) : base(position)
        {
        }
    }
}