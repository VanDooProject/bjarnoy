using Bjarnoy.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Persistence;

/// <summary>
/// The game database. One model, two providers: PostgreSQL for hosted
/// multi-world play and SQLite for a single-container deployment or local dev,
/// as the root README requires.
/// </summary>
/// <remarks>
/// Provider-specific migrations live in <c>Bjarnoy.Migrations.PostgreSql</c> and
/// <c>Bjarnoy.Migrations.Sqlite</c>, selected in
/// <see cref="DatabaseServiceCollectionExtensions"/>. Nothing here may use a
/// provider-only construct, or the other provider's migrations stop building.
/// </remarks>
public class GameDbContext(DbContextOptions<GameDbContext> options) : DbContext(options)
{
    public DbSet<WorldEntity> Worlds => Set<WorldEntity>();

    public DbSet<IslandEntity> Islands => Set<IslandEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<WorldEntity>(world =>
        {
            world.ToTable("worlds");
            world.HasKey(w => w.Id);
            world.Property(w => w.Name).HasMaxLength(100).IsRequired();
            world.HasIndex(w => w.Name).IsUnique();
            world.Property(w => w.Status).HasConversion<int>();
            world.HasMany(w => w.Islands)
                .WithOne(i => i.World!)
                .HasForeignKey(i => i.WorldId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<IslandEntity>(island =>
        {
            island.ToTable("islands");
            island.HasKey(i => i.Id);
            island.Property(i => i.Name).HasMaxLength(100).IsRequired();
            island.HasIndex(i => new { i.WorldId, i.Index }).IsUnique();

            island.Property(i => i.StartPositions)
                .HasConversion(new HexListConverter())
                .Metadata.SetValueComparer(HexListConverter.Comparer);
        });
    }
}
