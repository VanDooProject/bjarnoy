using System.Collections.Generic;

namespace CoreClassLibrary.Models.Map
{
    public class Biom
    {
        public struct ValueNameContainer
        {
            public string description {get; set;}
            public float value {get; set;}
        }
        public struct BiomTypeContainer
        {
            public string description {get; set;}
            public float resource_probability {get; set;}
            public float forest_probability {get; set;}
            public float mountain_probability {get; set;}
        }

        public List<Tile> tiles = new List<Tile>();
        public struct Attributes
        {
            public BiomTypeContainer type;
            public ValueNameContainer size;
        }

        public Attributes attributes;
    }
}