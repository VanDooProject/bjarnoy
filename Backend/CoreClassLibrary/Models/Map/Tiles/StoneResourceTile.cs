using System.Numerics;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class StoneResourceTile : ResourceTile
    {
        public StoneResourceTile() : base()
        {
        }

        public StoneResourceTile(Vector3 position) : base(position)
        {
            this.Resource.Type = TileAttributesResourceTypeList.Stone;
            this.Resource.DegradationRate = 0.6f;
        }
    }
}