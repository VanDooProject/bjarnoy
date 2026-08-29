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

    public DbSet<SettlementEntity> Settlements => Set<SettlementEntity>();

    public DbSet<PlacedBuildingEntity> PlacedBuildings => Set<PlacedBuildingEntity>();

    public DbSet<BuildOrderEntity> BuildOrders => Set<BuildOrderEntity>();

    public DbSet<UnitStackEntity> UnitStacks => Set<UnitStackEntity>();

    public DbSet<TrainingOrderEntity> TrainingOrders => Set<TrainingOrderEntity>();

    public DbSet<UserEntity> Users => Set<UserEntity>();

    public DbSet<RefreshTokenEntity> RefreshTokens => Set<RefreshTokenEntity>();

    public DbSet<ProfileReportEntity> ProfileReports => Set<ProfileReportEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        base.OnModelCreating(modelBuilder);

        // Every key is a UUIDv7 this application mints, so each is declared
        // ValueGeneratedNever. Two reasons, both load-bearing:
        //
        //  - EF's default for a Guid key is ValueGeneratedOnAdd, and it then
        //    reads "key already set" as "row already exists" when it discovers
        //    an entity through a navigation property. A newly queued build
        //    order would be marked Modified instead of Added, and SaveChanges
        //    would UPDATE a row that was never inserted — which surfaces as
        //    DbUpdateConcurrencyException, not as anything resembling the
        //    actual mistake.
        //  - It guarantees the stored key is our time-ordered v7 rather than a
        //    provider-generated v4, which is what lets "ORDER BY id" mean
        //    "in creation order" (see WorldService.GetWorldsAsync).

        modelBuilder.Entity<WorldEntity>(world =>
        {
            world.ToTable("worlds");
            world.HasKey(w => w.Id);
            world.Property(w => w.Id).ValueGeneratedNever();
            world.Property(w => w.Name).HasMaxLength(100).IsRequired();
            world.HasIndex(w => w.Name).IsUnique();
            world.Property(w => w.Status).HasConversion<int>();
            world.Property(w => w.RunState).HasConversion<int>();
            // The C# property initializer only applies to rows created through
            // EF; existing rows picked up by this migration need the same
            // default at the SQL level too.
            world.Property(w => w.SpeedFactor).HasDefaultValue(1.0);
            world.HasMany(w => w.Islands)
                .WithOne(i => i.World!)
                .HasForeignKey(i => i.WorldId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<IslandEntity>(island =>
        {
            island.ToTable("islands");
            island.HasKey(i => i.Id);
            island.Property(i => i.Id).ValueGeneratedNever();
            island.Property(i => i.Name).HasMaxLength(100).IsRequired();
            island.HasIndex(i => new { i.WorldId, i.Index }).IsUnique();

            island.Property(i => i.StartPositions)
                .HasConversion(new HexListConverter())
                .Metadata.SetValueComparer(HexListConverter.Comparer);

            island.Property(i => i.RiverTiles)
                .HasConversion(new RiverTileListConverter())
                .Metadata.SetValueComparer(RiverTileListConverter.Comparer);
        });

        modelBuilder.Entity<SettlementEntity>(settlement =>
        {
            settlement.ToTable("settlements");
            settlement.HasKey(s => s.Id);
            settlement.Property(s => s.Id).ValueGeneratedNever();
            settlement.Property(s => s.Name).HasMaxLength(100).IsRequired();
            settlement.Property(s => s.OwnerName).HasMaxLength(100).IsRequired();
            settlement.Property(s => s.OwnerId).HasMaxLength(200).IsRequired();

            // One settlement per hex per world: two players cannot found on the
            // same plot, and the database is what makes that a race-proof rule
            // rather than a check-then-act.
            settlement.HasIndex(s => new { s.WorldId, s.CentreQ, s.CentreR }).IsUnique();

            // One settlement per player per world, for the same reason — this is
            // the "no second village (yet)" rule from MECHANICS.md, enforced at
            // the database rather than only checked in the service.
            settlement.HasIndex(s => new { s.WorldId, s.OwnerId }).IsUnique();

            settlement.HasOne(s => s.World)
                .WithMany(w => w.Settlements)
                .HasForeignKey(s => s.WorldId)
                .OnDelete(DeleteBehavior.Cascade);

            settlement.HasOne(s => s.Island)
                .WithMany()
                .HasForeignKey(s => s.IslandId)
                .OnDelete(DeleteBehavior.Cascade);

            // Real, relational ownership (UserEntity.Settlements is the other
            // side) — required, and separate from the legacy OwnerId/OwnerName
            // strings above, which stay as the anonymous/unclaimed path.
            // Anonymous/unclaimed settlements are owned by the reserved
            // SystemUserIds.Abandoned user rather than left ownerless — see
            // SettlementService.FoundAsync and the AddUsers migration's
            // backfill. Restrict rather than cascade: a user account going
            // away should not take their settlements with it.
            settlement.HasOne(s => s.Owner)
                .WithMany(u => u.Settlements)
                .HasForeignKey(s => s.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            settlement.HasIndex(s => s.UserId);

            settlement.HasMany(s => s.Buildings)
                .WithOne(b => b.Settlement!)
                .HasForeignKey(b => b.SettlementId)
                .OnDelete(DeleteBehavior.Cascade);

            settlement.HasMany(s => s.Queue)
                .WithOne(o => o.Settlement!)
                .HasForeignKey(o => o.SettlementId)
                .OnDelete(DeleteBehavior.Cascade);

            settlement.HasMany(s => s.Garrison)
                .WithOne(g => g.Settlement!)
                .HasForeignKey(g => g.SettlementId)
                .OnDelete(DeleteBehavior.Cascade);

            settlement.HasMany(s => s.TrainingQueue)
                .WithOne(o => o.Settlement!)
                .HasForeignKey(o => o.SettlementId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PlacedBuildingEntity>(building =>
        {
            building.ToTable("placed_buildings");
            building.HasKey(b => b.Id);
            building.Property(b => b.Id).ValueGeneratedNever();
            building.Property(b => b.Type).HasConversion<int>();

            // A hex holds one building.
            building.HasIndex(b => new { b.SettlementId, b.Q, b.R }).IsUnique();
        });

        modelBuilder.Entity<BuildOrderEntity>(order =>
        {
            order.ToTable("build_orders");
            order.HasKey(o => o.Id);
            order.Property(o => o.Id).ValueGeneratedNever();
            order.Property(o => o.Type).HasConversion<int>();

            // One order per hex at a time.
            order.HasIndex(o => new { o.SettlementId, o.Q, o.R }).IsUnique();
        });

        modelBuilder.Entity<UnitStackEntity>(stack =>
        {
            stack.ToTable("unit_stacks");
            stack.HasKey(s => s.Id);
            stack.Property(s => s.Id).ValueGeneratedNever();
            stack.Property(s => s.UnitType).HasConversion<int>();

            // One stack row per unit type per settlement.
            stack.HasIndex(s => new { s.SettlementId, s.UnitType }).IsUnique();
        });

        modelBuilder.Entity<TrainingOrderEntity>(order =>
        {
            order.ToTable("training_orders");
            order.HasKey(o => o.Id);
            order.Property(o => o.Id).ValueGeneratedNever();
            order.Property(o => o.UnitType).HasConversion<int>();
        });

        modelBuilder.Entity<UserEntity>(user =>
        {
            user.ToTable("users");
            user.HasKey(u => u.Id);
            user.Property(u => u.Id).ValueGeneratedNever();
            user.Property(u => u.UserName).HasMaxLength(50).IsRequired();
            user.Property(u => u.NormalizedUserName).HasMaxLength(50).IsRequired();
            user.Property(u => u.PasswordHash).IsRequired();
            user.Property(u => u.Role).HasConversion<int>();
            user.Property(u => u.Status).HasConversion<int>();
            user.Property(u => u.DisplayName).HasMaxLength(100);
            user.Property(u => u.Bio).HasMaxLength(2000);
            user.Property(u => u.StatusReason).HasMaxLength(500);

            // Case-insensitive uniqueness, enforced on the normalized column —
            // see UserEntity.NormalizedUserName.
            user.HasIndex(u => u.NormalizedUserName).IsUnique();

            user.HasMany(u => u.RefreshTokens)
                .WithOne(t => t.User!)
                .HasForeignKey(t => t.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // Reserved system accounts, seeded here (rather than at app
            // startup) so they exist deterministically as soon as the
            // AddUsers migration applies — the same migration's backfill of
            // pre-existing settlements onto SystemUserIds.Abandoned depends
            // on that row already existing. PasswordHash is a value the
            // hasher never produces and AuthService.LoginAsync additionally
            // refuses any IsSystem user outright, so these can never log in
            // by either mechanism. CreatedAt is a fixed literal (HasData
            // requires compile-time constants, not TimeProvider).
            var systemSeededAt = DateTimeOffset.UnixEpoch;
            user.HasData(
                new UserEntity
                {
                    Id = SystemUserIds.Abandoned,
                    UserName = "Abandoned",
                    NormalizedUserName = "abandoned",
                    PasswordHash = "SYSTEM-ACCOUNT-NO-LOGIN",
                    Role = UserRole.Player,
                    Status = UserStatus.Active,
                    IsSystem = true,
                    CreatedAt = systemSeededAt,
                },
                new UserEntity
                {
                    Id = SystemUserIds.Barbarians,
                    UserName = "Barbarians",
                    NormalizedUserName = "barbarians",
                    PasswordHash = "SYSTEM-ACCOUNT-NO-LOGIN",
                    Role = UserRole.Player,
                    Status = UserStatus.Active,
                    IsSystem = true,
                    CreatedAt = systemSeededAt,
                },
                new UserEntity
                {
                    Id = SystemUserIds.Endboss,
                    UserName = "Endboss",
                    NormalizedUserName = "endboss",
                    PasswordHash = "SYSTEM-ACCOUNT-NO-LOGIN",
                    Role = UserRole.Player,
                    Status = UserStatus.Active,
                    IsSystem = true,
                    CreatedAt = systemSeededAt,
                });
        });

        modelBuilder.Entity<RefreshTokenEntity>(token =>
        {
            token.ToTable("refresh_tokens");
            token.HasKey(t => t.Id);
            token.Property(t => t.Id).ValueGeneratedNever();
            token.Property(t => t.TokenHash).HasMaxLength(64).IsRequired();

            // Looked up by hash on every refresh/logout call.
            token.HasIndex(t => t.TokenHash).IsUnique();
        });

        modelBuilder.Entity<ProfileReportEntity>(report =>
        {
            report.ToTable("profile_reports");
            report.HasKey(r => r.Id);
            report.Property(r => r.Id).ValueGeneratedNever();
            report.Property(r => r.Reason).HasMaxLength(200).IsRequired();
            report.Property(r => r.Note).HasMaxLength(2000);
            report.Property(r => r.Status).HasConversion<int>();

            // A user account going away must not silently delete the
            // moderation record either way round — same reasoning as
            // settlements' Restrict above. (Users are never deleted today.)
            report.HasOne(r => r.Reporter)
                .WithMany()
                .HasForeignKey(r => r.ReporterUserId)
                .OnDelete(DeleteBehavior.Restrict);

            report.HasOne(r => r.ReportedUser)
                .WithMany()
                .HasForeignKey(r => r.ReportedUserId)
                .OnDelete(DeleteBehavior.Restrict);

            // The admin queue lists by status; the duplicate-pending guard
            // looks up (reporter, reported) pairs.
            report.HasIndex(r => r.Status);
            report.HasIndex(r => new { r.ReporterUserId, r.ReportedUserId });
        });
    }
}
