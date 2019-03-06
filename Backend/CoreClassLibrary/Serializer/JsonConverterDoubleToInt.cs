using System;
using System.Collections.Generic;
using System.Text;
using Newtonsoft.Json;

namespace CoreClassLibrary.Serializer
{
    // ideas taken from: https://stackoverflow.com/a/39526179/2298744

    /// <summary>
    /// use like:
    /// [JsonConverter(typeof(JsonConverterDoubleToInt))]
    /// </summary>
    public sealed class JsonConverterDoubleToInt : JsonConverter
    {
        public override bool CanRead => false;
        public override bool CanWrite => true;
        public override bool CanConvert(Type type) => type == typeof(double);

        public override void WriteJson(
            JsonWriter writer, object value, JsonSerializer serializer)
        {
            double number = (double)value;
            writer.WriteValue((int)number);
        }

        public override object ReadJson(
            JsonReader reader, Type type, object existingValue, JsonSerializer serializer)
        {
            throw new NotSupportedException();
        }
    }
}
