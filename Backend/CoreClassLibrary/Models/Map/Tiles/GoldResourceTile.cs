using System.Numerics;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class GoldResourceTile : ResourceTile
    {
        public GoldResourceTile() : base()
        {
        }

        public GoldResourceTile(Vector3 position) : base(position)
        {
            this.Resource.Type = TileAttributesResourceTypeList.Gold;
            this.Resource.DegradationRate = 0.2f;
        }
    }
}