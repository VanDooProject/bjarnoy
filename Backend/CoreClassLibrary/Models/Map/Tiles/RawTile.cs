using System;
using System.Numerics;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class RawTile : Tile
    {
        /// <summary>
        /// will be used to determine which biom or if water
        /// </summary>
        public double Elevation = Double.NaN;

        public RawTile() : base()
        {
        }

        public RawTile(Vector3 position) : base(position)
        {
        }
    }
}