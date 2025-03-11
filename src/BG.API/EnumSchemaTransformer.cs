using System.ComponentModel;
using System.Reflection;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi.Any;
using Microsoft.OpenApi.Models;

public class EnumSchemaTransformer : Microsoft.AspNetCore.OpenApi.IOpenApiSchemaTransformer
{
    public Task TransformAsync(OpenApiSchema schema, OpenApiSchemaTransformerContext context, CancellationToken cancellationToken)
    {
        if (context?.JsonPropertyInfo?.PropertyType.IsEnum == true)
        {
            var enumNames = Enum.GetNames(context.JsonPropertyInfo.PropertyType);
            var enumValues = Enum.GetValues(context.JsonPropertyInfo.PropertyType);
            var enumDesc = enumValues.Cast<object>().Select(
                (value, index) =>
                {
                    // get description attribute via reflection
                    var attr = context.JsonPropertyInfo.PropertyType.GetField(value.ToString())?
                        .GetCustomAttribute<DescriptionAttribute>();

                    return new
                    {
                        Value = (int)value,
                        Name = enumNames[index],
                        Description = attr?.Description
                    };
                });

            var openApiValueArray = new OpenApiArray();
            var openApiNameArray = new OpenApiArray();
            var openApiDescArray = new OpenApiArray();
            foreach (var item in enumDesc)
            {
                openApiValueArray.Add(new OpenApiInteger(item.Value));
                openApiNameArray.Add(new OpenApiString(item.Name));
                openApiDescArray.Add(new OpenApiString(item.Description));
            }
            schema.Extensions.Add("x-enum-varnames", openApiNameArray); // https://openapi-ts.dev/advanced#enum-extensions
            schema.Extensions.Add("x-enum-descriptions", openApiDescArray); // https://openapi-ts.dev/advanced#enum-extensions
            schema.Extensions.Add("enum", openApiValueArray);

            return Task.CompletedTask;
        }

        return Task.CompletedTask;
    }
}