using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using System;
using System.Numerics;
using CoreClassLibrary.Models.Map.Coordinates;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class TriQuarterEdgeTile : EdgeTile
    {

        public TriQuarterEdgeTile() : base()
        {

        }

        public TriQuarterEdgeTile(HexCoordinates3D position) : base(position)
        {

        }

        public TriQuarterEdgeTile(HexCoordinates3D position, eOrientation orientation) : base(position, orientation)
        {

        }
    }
}