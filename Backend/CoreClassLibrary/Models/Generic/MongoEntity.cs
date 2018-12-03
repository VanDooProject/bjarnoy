using System;
using System.Collections.Generic;
using System.Text;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace CoreClassLibrary.Models.Generic
{
    // entity base
    public class MongoEntity
    {
        [BsonId]
        //[BsonRepresentation(BsonType.ObjectId)]
        //[BsonRepresentation(System.Guid)]
        public string _id { get; set; } = ObjectId.GenerateNewId().ToString();

        //System.Guid.NewGuid().ToString();
    }
}
