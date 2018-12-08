using System;
using System.Collections.Generic;
using System.Numerics;
using System.Security.Cryptography;
using CoreClassLibrary.Models.Map.Biomes;
using static CoreClassLibrary.Factory.TileFactory;
using static CoreClassLibrary.Models.Map.Biomes.Biom;

namespace CoreClassLibrary.Factory
{
    public class BiomFactory
    {
        public enum BiomAttributesTypeList
        {
            Sparse = 1,
            Mountain = 2,
            Forest = 3,
            Grassland = 4,
        };
        
        private TileFactory tile_factory = new TileFactory();

        public Biom GetRndBiomAtStartPosition(Vector3 position)
        {
            Biom biom = GetRndBiomType();
            biom.AddRndBiomTileAtPosition(position);

            return biom;
        }

        public void AddRndBiomTileAtPosition(Biom biom, Vector3 position)
        {
            biom.AddRndBiomTileAtPosition(position);
        }

        private Biom GetRndBiomType()
        {
            Random rnd = new Random();
            var temp_type_enum_list = Enum.GetValues(typeof(BiomAttributesTypeList));

            BiomAttributesTypeList temp_rnd_biom_type = (BiomAttributesTypeList)temp_type_enum_list.GetValue(rnd.Next(temp_type_enum_list.Length));

            switch (temp_rnd_biom_type)
            {
                case BiomAttributesTypeList.Sparse:
                    return new SparseBiom();

                case BiomAttributesTypeList.Mountain:
                    return new MountainBiom();

                case BiomAttributesTypeList.Forest:
                    return new ForestBiom();

                case BiomAttributesTypeList.Grassland:
                    return new GrasslandBiom();
                default:
                    return new GrasslandBiom();
            }
        }
    }
}