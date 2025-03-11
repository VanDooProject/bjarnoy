using System.ComponentModel;
using System.Reflection;
using BG.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Text.Json.Serialization.Metadata;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.OpenApi;
using Microsoft.OpenApi.Models;
using BG.Core.ValueObjects;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi.Any;
using Microsoft.OpenApi.MicrosoftExtensions;
using Scalar.AspNetCore;
using System.Xml.Linq;

var builder = WebApplication.CreateBuilder(args);

// Add configuration files
builder.Configuration
    .SetBasePath(builder.Environment.ContentRootPath)
    .AddJsonFile("appsettings.json", optional: false)
    .AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true)
    .AddEnvironmentVariables();

// Add logging configuration
builder.Logging.AddConfiguration(builder.Configuration.GetSection("Logging"));

// Add services to the container.
builder.Services.AddControllers();

builder.Services.AddOpenApi("v1", options =>
{
    options.OpenApiVersion = OpenApiSpecVersion.OpenApi3_0;
    options.ShouldInclude = (type) =>
    {
        // include if version is v1
        var vers = type.GetApiVersion();
        return vers.MajorVersion == 1;
    };

    // cache for enum types
    // Task TransformAsync(OpenApiSchema schema, OpenApiSchemaTransformerContext context, CancellationToken cancellationToken);
    /*
    options.AddSchemaTransformer(delegate(
        OpenApiSchema schema, OpenApiSchemaTransformerContext context, CancellationToken ct)
    {
        if (context?.JsonPropertyInfo?.PropertyType.IsEnum == true)
        {
            // like NSwag - https://github.com/RicoSuter/NJsonSchema/wiki/Enums
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
                        Value = (int) value,
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
    });
    */
    options.AddSchemaTransformer<EnumSchemaTransformer>();
});
builder.Services.AddHealthChecks();

// Add API Versioning
builder.Services.AddApiVersioning(options =>
{
    options.DefaultApiVersion = new ApiVersion(1, 0);
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ReportApiVersions = true;
});
builder.Services.AddVersionedApiExplorer(setup =>
{
    setup.SubstituteApiVersionInUrl = true;
});

builder.Services.AddHttpContextAccessor();

// Add infrastructure
builder.Services.AddInfrastructure(builder.Configuration);

// Configure JWT authentication
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(builder.Configuration["Jwt:SecretKey"] ?? throw new InvalidOperationException("JWT SecretKey is not configured")))
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment() || app.Environment.EnvironmentName == "gitlab")
{
    app.UseDeveloperExceptionPage();

    app.MapOpenApi();
    app.MapScalarApiReference(); // https://learn.microsoft.com/en-us/aspnet/core/fundamentals/openapi/using-openapi-documents?view=aspnetcore-9.0 TODO later lint with `spectral`
}

app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();

// Add health check endpoint
app.MapHealthChecks("/health");

// Add controller endpoints
app.MapControllers();

app.Run();

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

namespace BG.API
{
    public partial class Program { }
}
