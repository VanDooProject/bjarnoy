using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Models.Buildings;
using CoreClassLibrary.Models.Map.Tiles;

namespace CoreClassLibrary.Models.TechQueues
{
    public class BuildingQueue : Queue
    {
        public Tile Tile;
        public Building Building;
    }
}
