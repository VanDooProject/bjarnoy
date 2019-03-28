using System;
using System.Linq;
using System.Numerics;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Models.Buildings;
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
        public string IdOfIsland => IslandId?.Id?.ToString();

        // https://jira.mongodb.org/browse/CSHARP-1759
        [BsonSerializer(typeof(Vector3Serializer))]
        public Vector3 Position;

        public enum eOrientation
        {
            NorthEast,
            East,
            SouthEast,
            SouthWest,
            West,
            NorthWest,
        }

        [JsonConverter(typeof(StringEnumConverter))]
        public eOrientation Orientation;

        /// <summary>
        /// building on this tile
        /// </summary>
        [BsonIgnoreIfNull]
        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public Building Building;

        public string type
        {
            get { return this.GetType().ToString().Split('.').Last(); }
        }

        public Tile()
        {
        }

        public Tile(Vector3 position)
        {
            this.Position = position;
        }


        public bool CheckIfSameTile(Vector3 pos)
        {
            return (Vector3.DistanceSquared(this.Position, pos) <= SettingsController.Instance.GetSettings().V1.Vector3EqualsAllowedDistanceDisturbance);
        }



        public override string ToString()
        {
            return $"{this.GetType().ToString().Split('.').Last()}: {this.Position.ToString().Replace('.', '|')}";
        }
    }
}