using System;
using System.Linq;
using System.Numerics;
using CoreClassLibrary.Serializer;
using MongoDB.Bson.Serialization.Attributes;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class Tile
    {

        // https://jira.mongodb.org/browse/CSHARP-1759
        [BsonSerializer(typeof(Vector3Serializer))]
        public Vector3 Position;

        public Tile()
        {
        }

        public Tile(Vector3 position)
        {
            this.Position = position;
        }

        public string type
        {
            get { return this.GetType().ToString().Split('.').Last(); }
        }
    }
}