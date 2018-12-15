using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using System;
using System.Numerics;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class TriQuarterEdgeTile : EdgeTile
    {

        public TriQuarterEdgeTile() : base()
        {

        }

        public TriQuarterEdgeTile(Vector3 position) : base(position)
        {

        }

        public TriQuarterEdgeTile(Vector3 position, eOrientation orientation) : base(position, orientation)
        {

        }
    }
}