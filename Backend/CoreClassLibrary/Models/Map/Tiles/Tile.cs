namespace CoreClassLibrary.Models.Map.Tiles
{
    public class Tile
    {
        public int x;
        public int y;
        public int z;

        public string type {get; set;}

        public Tile(int x, int y, int z)
        {
            this.x = x;
            this.y = y;
            this.z = z;
        }

        public Tile(int x, int y, int z, string type)
        {
            this.x = x;
            this.y = y;
            this.z = z;

            this.type = type;
        }
    }    
}