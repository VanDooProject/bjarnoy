using System;
using System.Collections.Generic;
using System.Text;
using MongoDB.Bson.Serialization.Attributes;

namespace CoreClassLibrary.Models.TechQueues
{
    public abstract class Queue
    {
        public DateTime StartTime = DateTime.MinValue;
        public DateTime EndTime = DateTime.MaxValue;

        // this is redundant data for json
        [BsonIgnore]
        public TimeSpan Duration => StartTime - EndTime;
    }
}
