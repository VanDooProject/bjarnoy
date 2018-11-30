namespace CoreClassLibrary.Models.Map
{
    public class Tile
    {
        public int x;
        public int y;
        public int z;

        public string type;

        public Tile(int x, int y, int z, string type)
        {
            this.x = x;
            this.y = y;
            this.z = z;
            this.type = type;
        }
    }
}