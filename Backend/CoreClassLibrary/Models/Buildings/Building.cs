using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using CoreClassLibrary.Models.Map.Tiles;
using MongoDB.Bson.Serialization.Attributes;
using Newtonsoft.Json;

namespace CoreClassLibrary.Models.Buildings
{
    public abstract class Building
    {
        /// <summary>
        /// Level of building
        /// </summary>
        public int Level;

        /// <summary>
        /// duration of build time needed to reach this level
        /// can be null to have lower amounts of data to be transmitted in communication
        /// TODO: use own model for this which wraps TimeSpan
        /// </summary>
        [BsonIgnoreIfNull]
        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public TimeSpan? BuildDuration = null;

        /// <summary>
        /// return type of building (used mainly for frontend)
        /// </summary>
        public string type
        {
            get { return this.GetType().ToString().Split('.').Last(); }
        }

        /// <summary>
        /// resources needed to build this level\n
        /// empty/null if this building was built already
        /// </summary>
        [BsonIgnoreIfNull]
        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public Resources ResourcesNeeded;

        /// <summary>
        /// requirements which must be fulfilled to build this\n
        /// null if building is already built
        /// </summary>
        [BsonIgnoreIfNull]
        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public List<IRequirement> requirements;

        /// <summary>
        /// tiles where this building is allowed\n
        /// null if building is already built
        /// </summary>
        [BsonIgnoreIfNull]
        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public List<Tile> allowedTiles;

        // call this before converting to json not used in techtree stuff or before saveing to DB
        public Building CleanTechData()
        {
            Building b = (Building) this.MemberwiseClone();

            b.ResourcesNeeded = null;
            b.requirements = null;
            b.allowedTiles = null;

            return b;
        }
    }
}
