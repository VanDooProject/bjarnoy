using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Models.Map.Tiles;

namespace CoreClassLibrary.Models.Buildings
{
    public abstract class Building
    {
        /// <summary>
        /// Level of building
        /// </summary>
        public int Level;

        /// <summary>
        /// resources needed to build this level\n
        /// empty/null if this building was built already
        /// </summary>
        public Resources ResourcesNeeded;

        /// <summary>
        /// requirements which must be fulfilled to build this\n
        /// null if building is already built
        /// </summary>
        public List<IRequirement> requirements;

        /// <summary>
        /// tiles where this building is allowed\n
        /// null if building is already built
        /// </summary>
        public List<Tile> allowedTiles;
    }
}
