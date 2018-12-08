using System.Collections.Generic;
using CoreClassLibrary.Models.Map.Biomes;
using CoreClassLibrary.Models.Map.Tiles;

namespace CoreClassLibrary.Models.Map
{
    public class Island
    {
        public string name { get; set; }
        public int size;
        public List<Biom> bioms = new List<Biom>();
        public int startX { get; set; }
        public int startY { get; set; }

        //public List<Tile> tiles = new List<Tile>();
    }
}