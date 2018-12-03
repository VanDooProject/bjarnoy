using System.Collections.Generic;
using CoreClassLibrary.Models.Map.Biomes;

namespace CoreClassLibrary.Models.Map
{
    public class Island
    {
        public List<Biom> bioms = new List<Biom>();
        public string name {get; set;}
    }
}