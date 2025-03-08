using Microsoft.OpenApi;
using Microsoft.OpenApi.Any;
using Microsoft.OpenApi.MicrosoftExtensions;
using Microsoft.OpenApi.Writers;

class MyOpenApiAnyEnumDescription : EnumDescription, IOpenApiAny
{
    public AnyType AnyType => AnyType.Object;

    public void Write(IOpenApiWriter writer, OpenApiSpecVersion specVersion)
    {
        writer.WriteStartObject();
        writer.WriteProperty("value", Value);
        writer.WriteProperty("description", Description);
        writer.WriteProperty("name", Name);
        writer.WriteEndObject();
    }
}