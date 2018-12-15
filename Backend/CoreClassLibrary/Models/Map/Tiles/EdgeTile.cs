using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using System;
using System.Numerics;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class EdgeTile : Tile
    {

        public EdgeTile() : base()
        {

        }

        public EdgeTile(Vector3 position) : base(position)
        {

        }
    }
}