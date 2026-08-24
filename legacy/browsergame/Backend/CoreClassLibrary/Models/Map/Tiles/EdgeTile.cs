using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using System;
using System.Numerics;
using CoreClassLibrary.Models.Map.Coordinates;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class EdgeTile : Tile
    {

        public EdgeTile() : base()
        {

        }

        public EdgeTile(HexCoordinates3D position) : base(position)
        {

        }

        public EdgeTile(HexCoordinates3D position, eOrientation orientation) : base(position)
        {
            this.Orientation = orientation;
        }
    }
}