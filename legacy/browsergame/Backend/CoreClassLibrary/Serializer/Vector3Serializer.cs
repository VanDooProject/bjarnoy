using System;
using System.Collections.Generic;
using System.Numerics;
using System.Reflection;
using System.Text;
using MongoDB.Bson;
using MongoDB.Bson.IO;
using MongoDB.Bson.Serialization;

namespace CoreClassLibrary.Serializer
{
    public class Vector3Serializer : IBsonSerializer
    {
        // https://stackoverflow.com/questions/26788855/how-do-you-serialize-value-types-with-mongodb-c-sharp-serializer
        public object Deserialize(BsonDeserializationContext context, BsonDeserializationArgs args)
        {
            Type nominalType = args.NominalType;
            Type actualType = args.NominalType;
            var bsonReader = context.Reader;
            //var nameDecoder = context.Reader.ReadName();

            var obj = Activator.CreateInstance(actualType);

            bsonReader.ReadStartDocument();

            while (bsonReader.ReadBsonType() != BsonType.EndOfDocument)
            {
                //var name = bsonReader.ReadName(nameDecoder);
                var name = bsonReader.ReadName();

                var field = actualType.GetField(name);
                if (field != null)
                {
                    var value = BsonSerializer.Deserialize(bsonReader, field.FieldType);
                    field.SetValue(obj, value);
                }

                var prop = actualType.GetProperty(name);
                if (prop != null)
                {
                    var value = BsonSerializer.Deserialize(bsonReader, prop.PropertyType);
                    prop.SetValue(obj, value, null);
                }
            }

            bsonReader.ReadEndDocument();

            return obj;
        }

        public void Serialize(BsonSerializationContext context, BsonSerializationArgs args, object value)
        {
            var nominalType = args.NominalType;
            var fields = nominalType.GetFields(BindingFlags.Instance | BindingFlags.Public);
            var propsAll = nominalType.GetProperties(BindingFlags.Instance | BindingFlags.Public);

            var props = new List<PropertyInfo>();
            foreach (var prop in propsAll)
            {
                if (prop.CanWrite)
                {
                    props.Add(prop);
                }
            }

            var bsonWriter = context.Writer;

            bsonWriter.WriteStartDocument();

            foreach (var field in fields)
            {
                bsonWriter.WriteName(field.Name);
                BsonSerializer.Serialize(bsonWriter, field.FieldType, field.GetValue(value));
            }
            foreach (var prop in props)
            {
                bsonWriter.WriteName(prop.Name);
                BsonSerializer.Serialize(bsonWriter, prop.PropertyType, prop.GetValue(value, null));
            }

            bsonWriter.WriteEndDocument();
        }

        public Type ValueType
        {
            get { return typeof(Vector3); }
        }
    }
}
