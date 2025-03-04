namespace BG.Infrastructure.Data;

/// <summary>
/// Configuration settings for PostgreSQL database connections.
/// Includes connection pooling settings and various timeouts.
/// </summary>
public class PostgreSqlSettings
{
    public string ConnectionString { get; set; } = string.Empty;
    
    // Pool settings
    public bool EnablePooling { get; set; } = true;
    public int MinPoolSize { get; set; } = 1;
    public int MaxPoolSize { get; set; } = 100;
    
    // Timeouts
    public int ConnectionIdleLifetime { get; set; } = 300;  // seconds
    public int ConnectionPruningInterval { get; set; } = 10; // seconds
    public int CommandTimeout { get; set; } = 30;           // seconds
    
    // Development settings
    public bool IncludeErrorDetail { get; set; } = false;
}