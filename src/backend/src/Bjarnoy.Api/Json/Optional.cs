using System.Text.Json;
using System.Text.Json.Serialization;

namespace Bjarnoy.Api.Json;

/// <summary>
/// Distinguishes "this field was not sent" from "this field was sent, possibly
/// as null" in a PATCH request body. A plain <c>T?</c> cannot do this for a
/// field whose domain type is itself nullable — e.g.
/// <c>UpdateWorldSettingsRequest.StartsAt</c>, where omitting the field must
/// leave the world's start date untouched, but sending it as <c>null</c> must
/// clear it. Defaults to "not sent" (<see cref="HasValue"/> false), which is
/// exactly what a JSON body that omits the property leaves an
/// <see cref="Optional{T}"/> struct property as — no converter needs to run
/// for the omitted case, only for the present-with-a-value-or-null case.
/// </summary>
public readonly struct Optional<T> : IEquatable<Optional<T>>
{
    public bool HasValue { get; }

    public T? Value { get; }

    private Optional(bool hasValue, T? value)
    {
        HasValue = hasValue;
        Value = value;
    }

    public static Optional<T> Of(T? value) => new(true, value);

    // Lets [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    // omit the property entirely for the unset (default) case when a request
    // DTO carrying an Optional<T> is itself serialized (e.g. by a test
    // client) — otherwise the converter below would write every unset field
    // as an explicit "null", indistinguishable on the wire from "clear this
    // field".
    public bool Equals(Optional<T> other) =>
        HasValue == other.HasValue && EqualityComparer<T?>.Default.Equals(Value, other.Value);

    public override bool Equals(object? obj) => obj is Optional<T> other && Equals(other);

    public override int GetHashCode() => HashCode.Combine(HasValue, Value);
}

public sealed class OptionalJsonConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert) =>
        typeToConvert.IsGenericType && typeToConvert.GetGenericTypeDefinition() == typeof(Optional<>);

    public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options)
    {
        var innerType = typeToConvert.GetGenericArguments()[0];
        var converterType = typeof(OptionalJsonConverter<>).MakeGenericType(innerType);
        return (JsonConverter)Activator.CreateInstance(converterType)!;
    }
}

file sealed class OptionalJsonConverter<T> : JsonConverter<Optional<T>>
{
    public override Optional<T> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        Optional<T>.Of(JsonSerializer.Deserialize<T>(ref reader, options));

    public override void Write(Utf8JsonWriter writer, Optional<T> value, JsonSerializerOptions options) =>
        JsonSerializer.Serialize(writer, value.Value, options);
}
