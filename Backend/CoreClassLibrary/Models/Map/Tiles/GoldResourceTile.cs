namespace CoreClassLibrary.Models.Map.Tiles
{
    public class GoldResourceTile : ResourceTile
    {
        public GoldResourceTile(int x, int y, int z) : base(x, y, z)
        {
            this.resource.type = TileAttributesResourceTypeList.Gold;
            this.resource.degradation_rate = 0.2f;
        }
    }
}