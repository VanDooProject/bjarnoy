using System.Data;
using Npgsql;
using System.Security.Cryptography;
using System.Text;
using System.Reflection;
using Dapper;

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
        await _unitOfWork.Connection.ExecuteAsync(CreateMigrationTableSql);
    }

    public async Task<IEnumerable<string>> GetAppliedMigrations()
    {
        await EnsureMigrationTableExists();
        return await _unitOfWork.Connection.QueryAsync<string>(
            $@"SELECT ""Name"" FROM ""{MigrationTableName}"" ORDER BY ""Id"";");
    }

    public async Task ExecuteMigrations(params string[] migrationPaths)
    {
        var appliedMigrations = (await GetAppliedMigrations()).ToHashSet();
        var validPaths = new List<string>();
        var executingPath = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);

        // Collect valid migration paths
        foreach (var path in migrationPaths)
        {
            var fullPath = Path.IsPathRooted(path) 
                ? path 
                : Path.GetFullPath(Path.Combine(executingPath!, path));

            if (Directory.Exists(fullPath))
            {
                validPaths.Add(fullPath);
            }
        }

        if (!validPaths.Any())
        {
            throw new DirectoryNotFoundException(
                $"None of the specified migration paths exist. Tried: {string.Join(", ", migrationPaths)}");
        }

        // Collect and sort all migration files
        var migrationFiles = validPaths
            .SelectMany(path => Directory.GetFiles(path, "*.sql"))
            .OrderBy(f => Path.GetFileName(f))
            .ToList();

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
            var exists = await _unitOfWork.Connection.QuerySingleOrDefaultAsync<int>(
                $@"SELECT COUNT(*) FROM ""{MigrationTableName}"" WHERE ""Name"" = @name;",
                new { name },
                transaction: _unitOfWork.Transaction);

            if (exists > 0)
            {
                _unitOfWork.Rollback();
                return;
            }

            // Execute migration
            await _unitOfWork.Connection.ExecuteAsync(
                migrationScript,
                transaction: _unitOfWork.Transaction);

            // Record migration
            await _unitOfWork.Connection.ExecuteAsync(
                $@"INSERT INTO ""{MigrationTableName}"" (""Name"", ""Checksum"", ""Duration"")
                   VALUES (@name, @checksum, @duration);",
                new 
                { 
                    name,
                    checksum = CalculateChecksum(migrationScript),
                    duration = (int)sw.ElapsedMilliseconds
                },
                transaction: _unitOfWork.Transaction);

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