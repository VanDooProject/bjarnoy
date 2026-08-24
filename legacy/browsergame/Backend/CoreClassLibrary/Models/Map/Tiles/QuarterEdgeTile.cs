using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using System;
using System.Numerics;
using CoreClassLibrary.Models.Map.Coordinates;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class QuarterEdgeTile : EdgeTile
    {

        public QuarterEdgeTile() : base()
        {

        }

        public QuarterEdgeTile(HexCoordinates3D position) : base(position)
        {

        }


        public QuarterEdgeTile(HexCoordinates3D position, eOrientation orientation) : base(position, orientation)
        {

        }
    }
}