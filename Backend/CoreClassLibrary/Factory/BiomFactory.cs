using System;
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
            biom.attributes.type = BiomAttributesTypeList[rnd.Next(BiomAttributesTypeList.Length)];
            biom.attributes.size_description = BiomAttributesSizeDescriptionList[rnd.Next(BiomAttributesSizeDescriptionList.Length)];

            switch (biom.attributes.size_description)
            {
                case "Small":
                    biom.attributes.size = rnd.Next(2, 4);
                    break;
                case "Medium":
                    biom.attributes.size = rnd.Next(5, 7);
                    break;
                case "Large":
                    biom.attributes.size = rnd.Next(8, 10);
                    break;
                case "Huge":
                    biom.attributes.size = rnd.Next(11, 12);
                    break;
                default:
                    biom.attributes.size = rnd.Next(5, 7);
                    break;
            }
        }

        private void GetBiomTiles(Biom biom)
        {
            for(int vertical_loop_count = 0; vertical_loop_count < biom.attributes.size; vertical_loop_count++)
            {
                for(int horizontal_loop_count = 0; horizontal_loop_count < biom.attributes.size; horizontal_loop_count++)
                {
                    biom.tiles.Add(new Tile(horizontal_loop_count, vertical_loop_count, 1));
                }
            }
        }
    }
}