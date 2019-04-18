using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using System;
using System.Numerics;
using CoreClassLibrary.Models.Map.Coordinates;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class HalfEdgeTile : EdgeTile
    {

        public HalfEdgeTile() : base()
        {

        }

        public HalfEdgeTile(HexCoordinates3D position) : base(position)
        {

        }

        public HalfEdgeTile(HexCoordinates3D position, eOrientation orientation) : base(position, orientation)
        {

        }
    }
}