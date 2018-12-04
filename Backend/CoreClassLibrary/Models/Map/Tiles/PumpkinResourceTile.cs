namespace CoreClassLibrary.Models.Map.Tiles
{
    public class PumpkinResourceTile : ResourceTile
    {
        public PumpkinResourceTile(int x, int y, int z) : base(x, y, z)
        {
            this.resource.type = TileAttributesResourceTypeList.Stone;
            this.resource.degradation_rate = 0.4f;
        }
    }
}