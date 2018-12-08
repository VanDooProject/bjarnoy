using System;
using System.Collections.Generic;
using System.Numerics;
using System.Reflection;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Factory;
using static CoreClassLibrary.Factory.TileFactory;

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

        private TileFactory tile_factory = new TileFactory();

        public Biom()
        {
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
            PropertyInfo[] probabilities = this.attributes.type.probability.GetType().GetProperties(BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
            foreach (PropertyInfo pi in probabilities)
            {
                cumulative_probability = cumulative_probability + (double)pi.GetValue(this.attributes.type.probability);
                if(rnd_value < cumulative_probability)
                {
                    string name = pi.Name;
                    TileAttributesGeneralTypeList tile_type;
                    if(Enum.TryParse(pi.Name, out tile_type))
                    {
                        switch (tile_type)
                        {
                            case TileAttributesGeneralTypeList.gras:
                                return new GrasTile(position);

                            case TileAttributesGeneralTypeList.mountain:
                                return new MountainTile(position);

                            case TileAttributesGeneralTypeList.forest:
                                return new ForestTile(position);

                            case TileAttributesGeneralTypeList.resource:
                                ResourceTile resource_tile = new ResourceTile(position);
                                resource_tile.GetRndResource();
                                return resource_tile;

                            default:
                                return new GrasTile(position);
                        }
                    }
                    else
                    {
                        while (true);
                    }
                }
            }

            //If we reach this point, then the cumulative probability is less than 100%
            return new GrasTile(position);
        }
    }
}