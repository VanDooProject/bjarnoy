using System.Linq;
namespace CoreClassLibrary.Models.Map.Tiles
{
    public class Tile
    {
        public int x;
        public int y;
        public int z;

        public string type
        {
            get { return this.GetType().ToString().Split('.').Last(); }
        }

        public Tile(int x, int y, int z)
        {
            this.x = x;
            this.y = y;
            this.z = z;
        }
    }    
}