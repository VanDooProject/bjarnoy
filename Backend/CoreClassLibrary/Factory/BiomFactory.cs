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
        private string[] BiomAttributesSizeList = new string[]
        {
            "Small",
            "Medium",
            "Large",
            "Huge"
        };

        public Biom GetBiom()
        {
            Biom biom = new Biom();

            GetRndAttributes(biom);

            return biom;
        }

        private void GetRndAttributes(Biom biom)
        {
            Random rnd = new Random();
            biom.attributes.type = BiomAttributesTypeList[rnd.Next(BiomAttributesTypeList.Length)];
            biom.attributes.size = BiomAttributesSizeList[rnd.Next(BiomAttributesSizeList.Length)];
        }
    }
}