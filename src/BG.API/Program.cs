
using BG.Infrastructure.Data;
using BG.Core.Interfaces.Repositories;
using BG.Infrastructure.Repositories.PostgreSQL;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();

// Configure Database and Repositories
builder.Services.AddHttpContextAccessor();
builder.Services.AddPostgreSql(builder.Configuration); 
builder.Services.AddScoped<IUnitOfWork, PostgreSqlUnitOfWork>();

// Register repositories
builder.Services.AddScoped<IUserRepository, PostgreSqlUserRepository>();
builder.Services.AddScoped<IWorldRepository, PostgreSqlWorldRepository>();
builder.Services.AddScoped<IPlayerRepository, PostgreSqlPlayerRepository>();

builder.Services.AddScoped<IWorldRepository, PostgreSqlWorldRepository>();
builder.Services.AddScoped<IPlayerRepository, PostgreSqlPlayerRepository>();
builder.Services.AddScoped<IRefreshTokenRepository, PostgreSqlRefreshTokenRepository>();

// Configure JWT authentication
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme);
builder.Services.AddAuthorization();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();

// Add health check endpoint
app.MapHealthChecks("/health");


// Add controller endpoints
app.MapControllers();

app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}


namespace BG.API
{
    public partial class Program { }
}
