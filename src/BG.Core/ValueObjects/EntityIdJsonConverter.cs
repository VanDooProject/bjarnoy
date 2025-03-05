using System.Text.Json;
using System.Text.Json.Serialization;

namespace BG.Core.ValueObjects;

public class EntityIdJsonConverter : JsonConverter<EntityId>
{
    public override EntityId Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            var value = reader.GetString();
            return EntityId.Parse(value!);
        }

        throw new JsonException($"Cannot convert token type {reader.TokenType} to EntityId");
    }

    public override void Write(Utf8JsonWriter writer, EntityId value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(value.ToString());
    }
}