using System;
using System.Linq;
using System.Numerics;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class Tile
    {
        public Vector3 Position;

        public Tile()
        {
        }

        public Tile(Vector3 position)
        {
            this.Position = position;
        }

        public string type
        {
            get { return this.GetType().ToString().Split('.').Last(); }
        }
    }    
}