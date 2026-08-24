using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Models.Buildings;
using CoreClassLibrary.Models.Map.Tiles;
using MongoDB.Bson.Serialization.Attributes;
using Newtonsoft.Json;

namespace CoreClassLibrary.Models.Technologies
{
    public sealed class BuildTechnology : Technology
    {

        /// <summary>
        /// tiles where this building is allowed\n
        /// null if building is already built
        /// </summary>
        [BsonIgnoreIfNull]
        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public List<Tile> AllowedTiles;


        public Building Building { get; set; }
    }
}
