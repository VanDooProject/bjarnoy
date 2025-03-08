using System.ComponentModel;
using System.Reflection;
using BG.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.OpenApi;
using Microsoft.OpenApi.Models;
using static System.Runtime.InteropServices.JavaScript.JSType;
using BG.Core.ValueObjects;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi.Any;
using Microsoft.OpenApi.MicrosoftExtensions;
using Scalar.AspNetCore;

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

    //options.MapType<EntityId>(() => new OpenApiSchema { Type = "string", Format = "string" });
    // TODO add transformer for EntityId
    options.AddSchemaTransformer(async delegate(OpenApiSchema schema, OpenApiSchemaTransformerContext context,
        CancellationToken ct)
    {
        //if (context.DocumentName == nameof(EntityId))
        //{
        //    schema.Type = "string";
        //    schema.Format = "uuid";
        //}

        if (context?.JsonPropertyInfo?.PropertyType.IsEnum == true)
        {
            // like NSwag - https://github.com/RicoSuter/NJsonSchema/wiki/Enums
            var enumNames = Enum.GetNames(context.JsonPropertyInfo.PropertyType);
            // get Enum value and name into dictionary
            var enumValues = Enum.GetValues(context.JsonPropertyInfo.PropertyType);


            // TODO get enum via reflection; get description attribute, name and value
            var en = enumValues.Cast<object>().Select(
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


            schema.Annotations.Add("x-enumNames", enumNames);
            Console.WriteLine($"prop: {context?.JsonPropertyInfo?.Name}: enumNames:{string.Join(",", enumNames)}");
            //schema.AdditionalProperties = new OpenApiSchema()
            //{
            //    
            //}
            schema.Extensions.Add("x-ms-enum", new OpenApiEnumValuesDescriptionExtension
            {
                EnumName = context.JsonPropertyInfo.PropertyType.Name,
                ValuesDescriptions = en.Select(e => new EnumDescription
                {
                    Value = e.Value.ToString(),
                    Description = e.Description,
                    Name = e.Name
                }).ToList()
            });

            var openApiEnum = new List<IOpenApiAny>();
            openApiEnum.AddRange(enumNames.Select(name => new OpenApiString(name)));
            schema.Enum = openApiEnum;
            return;
        }

        if (schema.Type != "object" && schema.Type != "string" && schema.Type != "array" && schema.Type != "boolean" &&
           schema.Type != null &&
           schema.Format != "int32"
           )
        {
            Console.WriteLine($"prop: {context?.JsonPropertyInfo?.Name}: schema.Type:{schema.Type}");
            return;
        }


        //return Task.CompletedTask;
    });
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

namespace BG.API
{
    public partial class Program { }
}
