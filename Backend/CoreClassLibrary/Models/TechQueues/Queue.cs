using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.Generic;
using CoreClassLibrary.Models.Player;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using Newtonsoft.Json;

namespace CoreClassLibrary.Models.TechQueues
{
    public abstract class Queue : MongoEntity
    {
        /// <summary>
        /// User who created this Queue
        /// </summary>
        public MinimalPlayer Owner;

        [BsonIgnoreIfNull]
        public UserModel Target; // for trades, attacks,.... TODO: maybe refactor to other child class(es) ... e.g TargetableQueues

        public DateTime StartTime = DateTime.MinValue;
        public DateTime EndTime = DateTime.MaxValue;

        // this is redundant data for json
        [BsonIgnore]
        public TimeSpan Duration => StartTime - EndTime;

        /// <summary>
        /// tells us state of queue entry
        /// </summary>
        [JsonIgnore]
        [BsonRepresentation(BsonType.String)] // for better debugging
        public eQueueProcessingState Processing = eQueueProcessingState.unprocessed;

        /// <summary>
        /// 
        /// </summary>
        public enum eQueueProcessingState
        {
            /// <summary>
            /// new entry in db
            /// </summary>
            unprocessed = 0,
            /// <summary>
            /// was taken from db
            /// </summary>
            processing,
            /// <summary>
            /// is processed -> only for logging in DB
            /// </summary>
            processed
        }
    }
}
