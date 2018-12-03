using System.Collections.Generic;
using CoreClassLibrary.Models.Map.Tiles;

namespace CoreClassLibrary.Models.Map.Biomes
{
    public class Biom
    {
        public enum BiomAttributesSizeDescriptionList
        {
            Small = 4,
            Medium = 6,
            Large = 8,
            Huge = 10,
        };
        public struct SizeContainer
        {
            public BiomAttributesSizeDescriptionList description {get; set;}
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
            public SizeContainer size;
        }

        public Attributes attributes;
    }
}