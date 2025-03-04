namespace BG.Infrastructure.Data;

/// <summary>
/// Configuration settings for PostgreSQL database connections.
/// </summary>
public class PostgreSqlSettings
{
    /// <summary>
    /// The connection parameters section
    /// </summary>
    public string Host { get; set; } = "localhost";
    public int Port { get; set; } = 5432;
    public string Database { get; set; } = "browsergame";
    public string Username { get; set; } = "postgres";
    public string Password { get; set; } = "postgres";

    /// <summary>
    /// Connection pool settings
    /// </summary>
    public bool EnablePooling { get; set; } = true;
    public int MinPoolSize { get; set; } = 1;
    public int MaxPoolSize { get; set; } = 100;
    public int ConnectionIdleLifetime { get; set; } = 300;  // seconds
    public int ConnectionPruningInterval { get; set; } = 10; // seconds
    public int CommandTimeout { get; set; } = 30;           // seconds
    public bool IncludeErrorDetail { get; set; } = false;

    public string GetConnectionString()
    {
        return $"Host={Host};Port={Port};Database={Database};Username={Username};Password={Password}";
    }
}