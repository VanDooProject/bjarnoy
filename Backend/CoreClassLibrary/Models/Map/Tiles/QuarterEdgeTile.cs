using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using System;
using System.Numerics;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class QuarterEdgeTile : EdgeTile
    {

        public QuarterEdgeTile() : base()
        {

        }

        public QuarterEdgeTile(Vector3 position) : base(position)
        {

        }


        public QuarterEdgeTile(Vector3 position, eOrientation orientation) : base(position, orientation)
        {

        }
    }
}