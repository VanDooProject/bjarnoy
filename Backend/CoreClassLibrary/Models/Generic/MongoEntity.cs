using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Serializer;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using Newtonsoft.Json;

namespace CoreClassLibrary.Models.Generic
{
    // entity base
    public class MongoEntity
    {
        [BsonId]
        //[BsonRepresentation(BsonType.ObjectId)]
        //[BsonRepresentation(System.Guid)]
        [JsonConverter(typeof(JsonConverterObjectIdString))]
        public ObjectId _id { get; set; } //= new ObjectId();// = ObjectId.GenerateNewId().ToString();

        //System.Guid.NewGuid().ToString();
    }
}
