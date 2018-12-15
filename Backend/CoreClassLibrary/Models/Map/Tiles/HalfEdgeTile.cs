using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using System;
using System.Numerics;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class HalfEdgeTile : EdgeTile
    {

        public HalfEdgeTile() : base()
        {

        }

        public HalfEdgeTile(Vector3 position) : base(position)
        {

        }
    }
}