using System;
using System.Collections.Generic;
using System.Reflection;
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
            public double value {get; set;}
        }

        public struct TileProbability
        {
            public double resource {get; set;}
            public double forest {get; set;}
            public double mountain {get; set;}
        }

        public struct BiomTypeContainer
        {
            public string description {get; set;}
            public TileProbability probability;
        }

        public List<Tile> tiles = new List<Tile>();
        public struct Attributes
        {
            public BiomTypeContainer type;
            public SizeContainer size;
        }

        public Attributes attributes;

        public Biom()
        {
            this.GetRndBiomSize();
        }

        public void GetRndBiomSize()
        {
            Random rnd = new Random();
            var temp_size_enum_list = Enum.GetValues(typeof(BiomAttributesSizeDescriptionList));
            this.attributes.size.description = (BiomAttributesSizeDescriptionList)temp_size_enum_list.GetValue(rnd.Next(temp_size_enum_list.Length));

            switch (this.attributes.size.description)
            {
                case BiomAttributesSizeDescriptionList.Small:
                    this.attributes.size.value = rnd.Next(((int)(BiomAttributesSizeDescriptionList.Small) - 2), (int)BiomAttributesSizeDescriptionList.Small);
                    break;
                case BiomAttributesSizeDescriptionList.Medium:
                    this.attributes.size.value = rnd.Next(((int)BiomAttributesSizeDescriptionList.Small + 1), (int)BiomAttributesSizeDescriptionList.Medium);
                    break;
                case BiomAttributesSizeDescriptionList.Large:
                    this.attributes.size.value = rnd.Next(((int)BiomAttributesSizeDescriptionList.Medium + 1), (int)BiomAttributesSizeDescriptionList.Large);
                    break;
                case BiomAttributesSizeDescriptionList.Huge:
                    this.attributes.size.value = rnd.Next(((int)BiomAttributesSizeDescriptionList.Large + 1), (int)BiomAttributesSizeDescriptionList.Huge);
                    break;
                default:
                    this.attributes.size.value = rnd.Next(((int)BiomAttributesSizeDescriptionList.Small + 1), (int)BiomAttributesSizeDescriptionList.Medium);
                    break;
            }
        }

        public void AddRndBiomTileAtPosition(int x, int y, int z)
        {
            Random rnd = new Random();
            double rnd_value = rnd.NextDouble();

            double cumulative_probability = 0.0;
            //FieldInfo[] probabilities = this.attributes.type.probability.GetType().GetFields(BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
            PropertyInfo[] probabilities = this.attributes.type.probability.GetType().GetProperties(BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
            foreach (PropertyInfo pi in probabilities)
            {
                cumulative_probability = cumulative_probability + (double)pi.GetValue(this.attributes.type.probability);
                if(rnd_value < cumulative_probability)
                {
                    string name = pi.Name;

                    break;
                }
            }
        }
    }
}