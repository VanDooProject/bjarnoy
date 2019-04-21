using System.Numerics;

namespace CoreClassLibrary.Models.Map.Tiles
{
    // TODO - check if this should be a waterTile
    public class CoastalWaterTile : Tile
    {
        public CoastalWaterTile() : base()
        {
        }

        public CoastalWaterTile(Vector3 position) : base(position)
        {
        }
    }
}