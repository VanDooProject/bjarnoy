using System.Numerics;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class PumpkinResourceTile : ResourceTile
    {
        public PumpkinResourceTile() : base()
        {

        }

        public PumpkinResourceTile(Vector3 position) : base(position)
        {
            this.Resource.Type = TileAttributesResourceTypeList.Stone;
            this.Resource.DegradationRate = 0.4f;
        }
    }
}