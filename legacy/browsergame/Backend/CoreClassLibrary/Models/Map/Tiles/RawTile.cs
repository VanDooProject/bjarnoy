using System;
using System.Numerics;
using CoreClassLibrary.Models.Map.Coordinates;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class RawTile : Tile
    {
        /// <summary>
        /// will be used to determine which biom or if water
        /// </summary>
        public double Elevation = Double.NaN;

        /// <summary>
        /// Humidity level of tile
        /// </summary>
        public double Humidity = Double.NaN;

        public RawTile() : base()
        {
        }

        public RawTile(HexCoordinates3D position) : base(position)
        {
        }
    }
}