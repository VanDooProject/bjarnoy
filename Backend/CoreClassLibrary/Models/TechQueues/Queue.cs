using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.Generic;
using MongoDB.Bson.Serialization.Attributes;

namespace CoreClassLibrary.Models.TechQueues
{
    public abstract class Queue : MongoEntity
    {
        /// <summary>
        /// User who created this Queue
        /// </summary>
        public UserModel Owner;

        [BsonIgnoreIfNull]
        public UserModel Target; // for trades, attacks,.... TODO: maybe refactor to other child class(es) ... e.g TargetableQueues

        public DateTime StartTime = DateTime.MinValue;
        public DateTime EndTime = DateTime.MaxValue;

        // this is redundant data for json
        [BsonIgnore]
        public TimeSpan Duration => StartTime - EndTime;
    }
}
