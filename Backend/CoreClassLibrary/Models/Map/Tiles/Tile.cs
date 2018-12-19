using System;
using System.Linq;
using System.Numerics;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Models.Generic;
using CoreClassLibrary.Serializer;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class Tile : MongoEntity
    {
        [JsonIgnore]
        public MongoDBRef IslandId { get; set; }

        [BsonIgnore]
        public string IdOfIsland => IslandId.Id.ToString();

        // https://jira.mongodb.org/browse/CSHARP-1759
        [BsonSerializer(typeof(Vector3Serializer))]
        public Vector3 Position;

        public enum eOrientation
        {
            North,
            East,
            South,
            West
        }

        [JsonConverter(typeof(StringEnumConverter))]
        public eOrientation Orientation;

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


        public bool CheckIfSameTile(Vector3 pos)
        {
            return (Vector3.DistanceSquared(this.Position, pos) <= SettingsController.Instance.GetSettings().V1.Vector3EqualsAllowedDistanceDisturbance);
        }
    }
}