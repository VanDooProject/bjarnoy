using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using CoreClassLibrary.Models.Map;

namespace CoreClassLibrary.Factory
{
    public class BiomFactory
    {
        private string[] BiomAttributesTypeList = new string[]
        {
            "Sparse",
            "Mountain",
            "Forest",
            "Grassland"
        };
        private string[] BiomAttributesSizeDescriptionList = new string[]
        {
            "Small",
            "Medium",
            "Large",
            "Huge"
        };

        private enum BiomSize
        {
            Min = 2,
            Small = 4,
            Medium = 6,
            Large = 8,
            Huge = 10,
        }
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
            biom.attributes.type.description = BiomAttributesTypeList[rnd.Next(BiomAttributesTypeList.Length)];
            biom.attributes.size.description = BiomAttributesSizeDescriptionList[rnd.Next(BiomAttributesSizeDescriptionList.Length)];

            switch (biom.attributes.size.description)
            {
                case "Small":
                    biom.attributes.size.value = rnd.Next((int)BiomSize.Min, (int)BiomSize.Small);
                    break;
                case "Medium":
                    biom.attributes.size.value = rnd.Next(((int)BiomSize.Small + 1), (int)BiomSize.Medium);
                    break;
                case "Large":
                    biom.attributes.size.value = rnd.Next(((int)BiomSize.Medium + 1), (int)BiomSize.Large);
                    break;
                case "Huge":
                    biom.attributes.size.value = rnd.Next(((int)BiomSize.Large + 1), (int)BiomSize.Huge);
                    break;
                default:
                    biom.attributes.size.value = rnd.Next(((int)BiomSize.Small + 1), (int)BiomSize.Medium);
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
                    biom.attributes.size.value = rnd.Next(((int)BiomSize.Small + 1), (int)BiomSize.Medium);
                    break;
            }
        }

        private void GetBiomTiles(Biom biom)
        {
            int nof_tiles = (int)(biom.attributes.size.value * biom.attributes.size.value);
            int resource_count = (int)(nof_tiles * biom.attributes.type.resource_probability);
            int forest_count = (int)(nof_tiles * biom.attributes.type.forest_probability);
            int mountain_count = (int)(nof_tiles * biom.attributes.type.mountain_probability);
            List<String> TileTypeList = new List<string>();
            for(int loop_count = 0; loop_count < nof_tiles; loop_count++)
            {
                if(resource_count > 0)
                {
                    TileTypeList.Add("Resource");
                    resource_count--;
                }
                else if(forest_count > 0)
                {
                    TileTypeList.Add("Forest");
                    forest_count--; 
                }
                else if(mountain_count > 0)
                {
                    TileTypeList.Add("Mountain");
                    mountain_count--;
                }
                else
                {
                     TileTypeList.Add("Gras");
                }
            }
            Shuffle(TileTypeList);

            var count = 0;
            for(int vertical_loop_count = 0; vertical_loop_count < biom.attributes.size.value; vertical_loop_count++)
            {
                for(int horizontal_loop_count = 0; horizontal_loop_count < biom.attributes.size.value; horizontal_loop_count++)
                {
                    biom.tiles.Add(new Tile(horizontal_loop_count, vertical_loop_count, 1, TileTypeList[count]));
                    count++;
                }
            }
        }
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