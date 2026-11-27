using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Bjarnoy.Infrastructure.Tests.Persistence;

/// <summary>
/// Which PostgreSQL unique violations <see cref="ConcurrentWriteExecutor"/> treats as a lost settlement write
/// (retried) and which stay domain outcomes (surfaced).
/// </summary>
public sealed class ConcurrentWriteExecutorRetryTests
{
    private static PostgresException UniqueViolation(string constraint) =>
        new("duplicate key", "ERROR", "ERROR", PostgresErrorCodes.UniqueViolation, constraintName: constraint);

    public static TheoryData<string> SettlementChildIndexes() =>
        new(ConcurrentWriteExecutor.SettlementChildUniqueIndexes);

    [Theory]
    [MemberData(nameof(SettlementChildIndexes))]
    public void A_unique_violation_on_a_settlements_own_child_rows_is_a_lost_race(string constraint)
    {
        Assert.True(ConcurrentWriteExecutor.IsRetryable(UniqueViolation(constraint)));
        Assert.True(ConcurrentWriteExecutor.IsRetryable(new DbUpdateException("wrapped", UniqueViolation(constraint))));
    }

    [Fact]
    public void Other_unique_violations_stay_domain_outcomes()
    {
        Assert.False(ConcurrentWriteExecutor.IsRetryable(UniqueViolation("IX_guilds_WorldId_Name")));
        Assert.False(ConcurrentWriteExecutor.IsRetryable(
            new PostgresException("fk", "ERROR", "ERROR", PostgresErrorCodes.ForeignKeyViolation,
                constraintName: "IX_unit_stacks_SettlementId_SpotQ_SpotR_UnitType")));
    }

    [Fact]
    public void The_listed_indexes_exist_as_unique_indexes_in_the_model()
    {
        using var db = new GameDbContext(
            new DbContextOptionsBuilder<GameDbContext>().UseNpgsql("Host=unused").Options);

        var unique = db.Model.GetEntityTypes()
            .SelectMany(e => e.GetIndexes())
            .Where(i => i.IsUnique)
            .Select(i => i.GetDatabaseName())
            .ToHashSet(StringComparer.Ordinal);

        foreach (var name in ConcurrentWriteExecutor.SettlementChildUniqueIndexes)
        {
            Assert.Contains(name, unique);
        }
    }
}
