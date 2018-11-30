using System.Collections.Generic;

namespace CoreClassLibrary.Models.Map
{
    public class Biom
    {
        public List<Tile> tiles = new List<Tile>();
        public struct Attributes
        {
            public string type {get; set;}
            public string size {get; set;}
        }

        public Attributes attributes;
    }
}