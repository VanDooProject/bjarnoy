using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using CoreClassLibrary.Models.Buildings;
using CoreClassLibrary.Models.Map.Tiles;

namespace CoreClassLibrary.Models.TechQueues
{
    public class BuildingQueue : Queue
    {
        public Tile Tile;
        public Building Building;

        public override string ToString()
        {
            return $"{this.GetType().ToString().Split('.').Last()}: building {this.Building} on tile {this.Tile}";
        }
    }
}
