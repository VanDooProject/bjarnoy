using System.Data;
using System.Security.Cryptography;
using System.Text;

namespace BG.Infrastructure.Data;

public class DatabaseMigrator
{
    private readonly IUnitOfWork _unitOfWork;
    private const string MigrationTableName = "_Migrations";
    private const string CreateMigrationTableSql = @"
        CREATE TABLE IF NOT EXISTS ""_Migrations"" (
            ""Id"" SERIAL PRIMARY KEY,
            ""Name"" VARCHAR(255) NOT NULL,
            ""ExecutedAt"" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ""Checksum"" VARCHAR(64) NOT NULL,
            ""Duration"" INT NOT NULL
        );";
    
    public DatabaseMigrator(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    private async Task EnsureMigrationTableExists()
    {
        using var cmd = _unitOfWork.Connection.CreateCommand();
        cmd.CommandText = CreateMigrationTableSql;
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<IEnumerable<string>> GetAppliedMigrations()
    {
        await EnsureMigrationTableExists();

        using var cmd = _unitOfWork.Connection.CreateCommand();
        cmd.CommandText = $@"SELECT ""Name"" FROM ""{MigrationTableName}"" ORDER BY ""Id"";";
        
        var migrations = new List<string>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            migrations.Add(reader.GetString(0));
        }
        return migrations;
    }

    public async Task ExecuteMigrations(string migrationsPath)
    {
        var appliedMigrations = await GetAppliedMigrations();
        var migrationFiles = Directory.GetFiles(migrationsPath, "*.sql").OrderBy(f => Path.GetFileName(f));

        foreach (var file in migrationFiles)
        {
            var name = Path.GetFileName(file);
            if (!appliedMigrations.Contains(name))
            {
                var script = await File.ReadAllTextAsync(file);
                await ExecuteMigrationInTransaction(script, name);
            }
        }
    }

    private async Task ExecuteMigrationInTransaction(string migrationScript, string name)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        _unitOfWork.BeginTransaction();

        try
        {
            // Double-check migration wasn't applied (in case of parallel execution)
            using (var cmd = _unitOfWork.Connection.CreateCommand())
            {
                cmd.CommandText = $@"SELECT COUNT(*) FROM ""{MigrationTableName}"" WHERE ""Name"" = @name;";
                cmd.Parameters.Add(new NpgsqlParameter("@name", name));
                var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
                if (count > 0)
                {
                    _unitOfWork.Rollback();
                    return;
                }
            }

            // Execute migration
            using (var cmd = _unitOfWork.Connection.CreateCommand())
            {
                cmd.CommandText = migrationScript;
                await cmd.ExecuteNonQueryAsync();
            }

            // Record migration
            using (var cmd = _unitOfWork.Connection.CreateCommand())
            {
                cmd.CommandText = $@"
                    INSERT INTO ""{MigrationTableName}"" (""Name"", ""Checksum"", ""Duration"")
                    VALUES (@name, @checksum, @duration);";
                
                cmd.Parameters.Add(new NpgsqlParameter("@name", name));
                cmd.Parameters.Add(new NpgsqlParameter("@checksum", CalculateChecksum(migrationScript)));
                cmd.Parameters.Add(new NpgsqlParameter("@duration", (int)sw.ElapsedMilliseconds));
                
                await cmd.ExecuteNonQueryAsync();
            }

            _unitOfWork.Commit();
        }
        catch
        {
            _unitOfWork.Rollback();
            throw;
        }
        finally
        {
            sw.Stop();
        }
    }

    private string CalculateChecksum(string content)
    {
        using var sha256 = SHA256.Create();
        var bytes = Encoding.UTF8.GetBytes(content);
        var hash = sha256.ComputeHash(bytes);
        return Convert.ToHexString(hash);
    }
}