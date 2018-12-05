using System;
using System.Collections.Generic;
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
        public Biom GetRndBiom(int start_size)
        {
            Biom biom = GetRndBiomType();
            GetBiomTiles(biom, start_size);
            return biom;
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

        private void GetBiomTiles(Biom biom, int start_size)
        {
            int nof_tiles = (int)(biom.attributes.size.value * biom.attributes.size.value);
            int resource_count = (int)(nof_tiles * biom.attributes.type.resource_probability);
            int forest_count = (int)(nof_tiles * biom.attributes.type.forest_probability);
            int mountain_count = (int)(nof_tiles * biom.attributes.type.mountain_probability);
            List<TileAttributesGeneralTypeList> TileTypeList = new List<TileAttributesGeneralTypeList>();
            for(int loop_count = 0; loop_count < nof_tiles; loop_count++)
            {
                if(resource_count > 0)
                {
                    TileTypeList.Add(TileAttributesGeneralTypeList.Resource);
                    resource_count--;
                }
                else if(forest_count > 0)
                {
                    TileTypeList.Add(TileAttributesGeneralTypeList.Forest);
                    forest_count--; 
                }
                else if(mountain_count > 0)
                {
                    TileTypeList.Add(TileAttributesGeneralTypeList.Mountain);
                    mountain_count--;
                }
                else
                {
                    TileTypeList.Add(TileAttributesGeneralTypeList.Gras);
                }
            }
            Shuffle(TileTypeList);

            var count = 0;
            for(int vertical_loop_count = 0; vertical_loop_count < biom.attributes.size.value; vertical_loop_count++)
            {
                for(int horizontal_loop_count = 0; horizontal_loop_count < biom.attributes.size.value; horizontal_loop_count++)
                {
                    biom.tiles.Add(tile_factory.GetNewSpecificTile((horizontal_loop_count + start_size), vertical_loop_count, 1, TileTypeList[count]));
                    count++;
                }
            }
        }
        //https://stackoverflow.com/questions/273313/randomize-a-listt
        private void Shuffle<T>(IList<T> list)
        {
            RNGCryptoServiceProvider provider = new RNGCryptoServiceProvider();
            int n = list.Count;
            while (n > 1)
            {
                byte[] box = new byte[1];
                do provider.GetBytes(box);
                while (!(box[0] < n * (Byte.MaxValue / n)));
                int k = (box[0] % n);
                n--;
                T value = list[k];
                list[k] = list[n];
                list[n] = value;
            }
        }
    }
}