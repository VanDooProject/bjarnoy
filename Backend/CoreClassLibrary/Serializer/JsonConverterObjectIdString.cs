using System;
using System.Collections.Generic;
using System.Text;
using MongoDB.Bson;
using Newtonsoft.Json;

namespace CoreClassLibrary.Serializer
{

    /// <summary>
    /// https://stackoverflow.com/questions/16651776/json-net-cast-error-when-serializing-mongo-objectid
    /// -> detail:  https://stackoverflow.com/a/37966098/2298744
    /// </summary>
    public class JsonConverterObjectIdString : JsonConverter
    {
        public override bool CanConvert(Type objectType)
        {
            return objectType == typeof(ObjectId);
        }

        public override object ReadJson(JsonReader reader, Type objectType, object existingValue, JsonSerializer serializer)
        {
            if (reader.TokenType != JsonToken.String)
                throw new Exception($"Unexpected token parsing ObjectId. Expected String, got {reader.TokenType}.");

            var value = (string)reader.Value;
            return string.IsNullOrEmpty(value) ? ObjectId.Empty : new ObjectId(value);
        }

        public override void WriteJson(JsonWriter writer, object value, JsonSerializer serializer)
        {
            if (value is ObjectId)
            {
                var objectId = (ObjectId)value;
                writer.WriteValue(objectId != ObjectId.Empty ? objectId.ToString() : string.Empty);
            }
            else
            {
                throw new Exception("Expected ObjectId value.");
            }
        }
    }
}
