using BG.Core.ValueObjects;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi.Models;

public class EntityIdStringSchemaTransformer : Microsoft.AspNetCore.OpenApi.IOpenApiSchemaTransformer
{
    public Task TransformAsync(OpenApiSchema schema, OpenApiSchemaTransformerContext context, CancellationToken cancellationToken)
    {
        if (context?.JsonPropertyInfo?.PropertyType == typeof(EntityId))
        {
            schema.Type = "string";

            return Task.CompletedTask;
        }

        return Task.CompletedTask;
    }
}