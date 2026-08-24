using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Models.Buildings;
using MongoDB.Bson.Serialization.Attributes;
using Newtonsoft.Json;

namespace CoreClassLibrary.Models.Technologies
{
    public abstract class Technology
    {
        /// <summary>
        /// resources needed to build this level\n
        /// empty/null if this building was built already
        /// </summary>
        [BsonIgnoreIfNull]
        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public Resources.Resources ResourcesNeeded;

        /// <summary>
        /// duration of build time needed to reach this level
        /// can be null to have lower amounts of data to be transmitted in communication
        /// TODO: use own model for this which wraps TimeSpan
        /// </summary>
        [BsonIgnoreIfNull]
        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public TimeSpan? ResearchDuration = null;


        /// <summary>
        /// requirements which must be fulfilled to build this\n
        /// null if building is already built
        /// </summary>
        [BsonIgnoreIfNull]
        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public List<IRequirement> requirements;
    }
}
