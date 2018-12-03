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

       /* private enum BiomSize
        {
            Min = 2,
            Small = 4,
            Medium = 6,
            Large = 8,
            Huge = 10,
        }*/
        
        private TileFactory tile_factory = new TileFactory();
        public Biom GetRndBiom()
        {
            Biom biom = new Biom();

            GetRndAttributes(biom);
            GetBiomTiles(biom);
            return biom;
        }

        private void GetRndAttributes(Biom biom)
        {
            Random rnd = new Random();
            var temp_type_enum_list = Enum.GetValues(typeof(BiomAttributesTypeList));
            var temp_size_enum_list = Enum.GetValues(typeof(BiomAttributesSizeDescriptionList));

            biom.attributes.type.description = temp_type_enum_list.GetValue(rnd.Next(temp_type_enum_list.Length)).ToString();
            biom.attributes.size.description = (BiomAttributesSizeDescriptionList)temp_size_enum_list.GetValue(rnd.Next(temp_size_enum_list.Length));

            switch (biom.attributes.size.description)
            {
                case BiomAttributesSizeDescriptionList.Small:
                    biom.attributes.size.value = rnd.Next(((int)(BiomAttributesSizeDescriptionList.Small) - 2), (int)BiomAttributesSizeDescriptionList.Small);
                    break;
                case BiomAttributesSizeDescriptionList.Medium:
                    biom.attributes.size.value = rnd.Next(((int)BiomAttributesSizeDescriptionList.Small + 1), (int)BiomAttributesSizeDescriptionList.Medium);
                    break;
                case BiomAttributesSizeDescriptionList.Large:
                    biom.attributes.size.value = rnd.Next(((int)BiomAttributesSizeDescriptionList.Medium + 1), (int)BiomAttributesSizeDescriptionList.Large);
                    break;
                case BiomAttributesSizeDescriptionList.Huge:
                    biom.attributes.size.value = rnd.Next(((int)BiomAttributesSizeDescriptionList.Large + 1), (int)BiomAttributesSizeDescriptionList.Huge);
                    break;
                default:
                    biom.attributes.size.value = rnd.Next(((int)BiomAttributesSizeDescriptionList.Small + 1), (int)BiomAttributesSizeDescriptionList.Medium);
                    break;
            }

            switch (biom.attributes.type.description)
            {
                case "Sparse":
                    biom.attributes.type.forest_probability = 0.05f;
                    biom.attributes.type.mountain_probability = 0.0f;
                    biom.attributes.type.resource_probability = 0.05f;
                    break;
                case "Mountain":
                    biom.attributes.type.forest_probability = 0.1f;
                    biom.attributes.type.mountain_probability = 0.6f;
                    biom.attributes.type.resource_probability = 0.1f;
                    break;
                case "Forest":
                    biom.attributes.type.forest_probability = 0.6f;
                    biom.attributes.type.mountain_probability = 0.1f;
                    biom.attributes.type.resource_probability = 0.1f;
                    break;
                case "Grassland":
                    biom.attributes.type.forest_probability = 0.1f;
                    biom.attributes.type.mountain_probability = 0.1f;
                    biom.attributes.type.resource_probability = 0.1f;
                    break;
                default:
                    //biom.attributes.size.value = rnd.Next(((int)BiomSize.Small + 1), (int)BiomSize.Medium);
                    break;
            }
        }

        private void GetBiomTiles(Biom biom)
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
                    biom.tiles.Add(tile_factory.GetNewSpecificTile(horizontal_loop_count, vertical_loop_count, 1, TileTypeList[count]));
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