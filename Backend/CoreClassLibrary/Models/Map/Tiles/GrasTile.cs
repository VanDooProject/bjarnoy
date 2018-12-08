namespace CoreClassLibrary.Models.Map.Tiles
{
    public class GrasTile : Tile
    {
        public GrasTile() : base()
        {
        }

        public GrasTile(int x, int y, int z) : base(x, y, z)
        {
            this.type = "Gras";
        }
    }
}