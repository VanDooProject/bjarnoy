using System.Collections.Generic;

namespace CoreClassLibrary.Models.Map
{
    public class Biom
    {
        public List<Tile> tiles = new List<Tile>();
        public struct Attributes
        {
            public string type {get; set;}
            public string size_description {get; set;}
            public int size {get; set;}
        }

        public Attributes attributes;
    }
}