using System;
using System.Collections.Generic;
using System.Numerics;
using System.Reflection;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Factory;
using static CoreClassLibrary.Factory.TileFactory;
using System.Linq;

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
            public double value {get; set;}
        }

        public struct TileProbability
        {
            public double resource {get; set;}
            public double forest {get; set;}
            public double mountain {get; set;}
        }

        public List<Tile> tiles = new List<Tile>();

        public struct Attributes
        {
            public Dictionary<Type, double> probability;
            public string description { get; set; }
            public SizeContainer size;
            public string type
            {
                get { return this.GetType().ToString().Split('.').Last(); }
            }
        }

        public Attributes attributes;

        private TileFactory tile_factory = new TileFactory();

        public Biom()
        {
            this.attributes.probability = new Dictionary<Type, double>();
            this.GetRndBiomSize();
        }

        public void GetRndBiomSize()
        {
            Random rnd = new Random();
            var temp_size_enum_list = Enum.GetValues(typeof(BiomAttributesSizeDescriptionList));
            this.attributes.size.description = (BiomAttributesSizeDescriptionList)temp_size_enum_list.GetValue(rnd.Next(temp_size_enum_list.Length));

            this.attributes.size.value = rnd.Next(((int)(this.attributes.size.description) - 1), (int)this.attributes.size.description);
        }

        public void AddRndBiomTileAtPosition(Vector3 position)
        {
            tiles.Add(GetRndBiomTileAtPosition(position));
        }

        private Tile GetRndBiomTileAtPosition(Vector3 position)
        {
            Random rnd = new Random();
            double rnd_value = rnd.NextDouble();

            double cumulative_probability = 0.0;
            foreach (KeyValuePair<Type, double> probability in this.attributes.probability)
            {
                cumulative_probability = cumulative_probability + probability.Value;
                if (rnd_value < cumulative_probability)
                {
                    return (Tile)Activator.CreateInstance(probability.Key, position);
                }
            }
            return new GrasTile(position);
        }
    }
}