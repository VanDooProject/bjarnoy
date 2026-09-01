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

    public DbSet<RuneInstanceEntity> Runes => Set<RuneInstanceEntity>();

    public DbSet<ArmyEntity> Armies => Set<ArmyEntity>();

    public DbSet<ArmyUnitStackEntity> ArmyUnitStacks => Set<ArmyUnitStackEntity>();

    public DbSet<BattleReportEntity> BattleReports => Set<BattleReportEntity>();

    public DbSet<BattleReportAttackerLineEntity> BattleReportAttackerLines => Set<BattleReportAttackerLineEntity>();

    public DbSet<BattleReportDefenderLineEntity> BattleReportDefenderLines => Set<BattleReportDefenderLineEntity>();

    public DbSet<UserEntity> Users => Set<UserEntity>();

    public DbSet<RefreshTokenEntity> RefreshTokens => Set<RefreshTokenEntity>();

    public DbSet<GuildEntity> Guilds => Set<GuildEntity>();

    public DbSet<GuildMembershipEntity> GuildMemberships => Set<GuildMembershipEntity>();

    public DbSet<GuildBoardTopicEntity> GuildBoardTopics => Set<GuildBoardTopicEntity>();

    public DbSet<GuildBoardPostEntity> GuildBoardPosts => Set<GuildBoardPostEntity>();

    public DbSet<GuildPeaceTreatyEntity> GuildPeaceTreaties => Set<GuildPeaceTreatyEntity>();

    public DbSet<TradeOfferEntity> TradeOffers => Set<TradeOfferEntity>();

    public DbSet<ShipmentEntity> Shipments => Set<ShipmentEntity>();

    public DbSet<TradeReportEntity> TradeReports => Set<TradeReportEntity>();

    public DbSet<MessageEntity> Messages => Set<MessageEntity>();

    public DbSet<MessageRecipientEntity> MessageRecipients => Set<MessageRecipientEntity>();

    public DbSet<ReportEntity> Reports => Set<ReportEntity>();

    public DbSet<LeaderboardSnapshotEntity> LeaderboardSnapshots => Set<LeaderboardSnapshotEntity>();

    public DbSet<LeaderboardEntryEntity> LeaderboardEntries => Set<LeaderboardEntryEntity>();

    public DbSet<LeaderboardWatermarkEntity> LeaderboardWatermarks => Set<LeaderboardWatermarkEntity>();

    public DbSet<WeeklyStatEntity> WeeklyStats => Set<WeeklyStatEntity>();

    public DbSet<UserActivityEntity> UserActivities => Set<UserActivityEntity>();

    public DbSet<UserActivitySessionEntity> UserActivitySessions => Set<UserActivitySessionEntity>();

    public DbSet<PlayerExploredEntity> PlayerExplored => Set<PlayerExploredEntity>();

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

            settlement.HasMany(s => s.Runes)
                .WithOne(r => r.Settlement!)
                .HasForeignKey(r => r.SettlementId)
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

        modelBuilder.Entity<RuneInstanceEntity>(rune =>
        {
            rune.ToTable("runes");
            rune.HasKey(r => r.Id);
            rune.Property(r => r.Id).ValueGeneratedNever();
            rune.Property(r => r.Type).HasConversion<int>();
            rune.Property(r => r.Rarity).HasConversion<int>();

            rune.HasIndex(r => r.SettlementId);
        });

        modelBuilder.Entity<ArmyEntity>(army =>
        {
            army.ToTable("armies");
            army.HasKey(a => a.Id);
            army.Property(a => a.Id).ValueGeneratedNever();

            army.Property(a => a.Path)
                .HasConversion(new HexListConverter())
                .Metadata.SetValueComparer(HexListConverter.Comparer);

            army.Property(a => a.ReturnPath)
                .HasConversion(new HexListConverter())
                .Metadata.SetValueComparer(HexListConverter.Comparer);

            army.Property(a => a.CumulativeHours)
                .HasConversion(new DoubleListConverter())
                .Metadata.SetValueComparer(DoubleListConverter.Comparer);

            army.Property(a => a.ReturnCumulativeHours)
                .HasConversion(new DoubleListConverter())
                .Metadata.SetValueComparer(DoubleListConverter.Comparer);

            // Restrict rather than cascade: nothing should delete a
            // settlement out from under an army still travelling. In
            // practice settlements are never deleted today, but the intent
            // matches UserEntity/SettlementEntity's ownership FK below.
            army.HasOne(a => a.Settlement)
                .WithMany()
                .HasForeignKey(a => a.SettlementId)
                .OnDelete(DeleteBehavior.Restrict);

            army.HasIndex(a => a.SettlementId);

            // Same Restrict posture as the SettlementId FK above — an attack
            // or support target/host settlement is never expected to vanish
            // out from under a still-relevant army row.
            army.HasOne(a => a.TargetSettlement)
                .WithMany()
                .HasForeignKey(a => a.TargetSettlementId)
                .OnDelete(DeleteBehavior.Restrict);

            // Guest-army lookups (issue #40 phase 4) filter on exactly this
            // pair — "who is currently supporting settlement X" — see
            // ArmyService/SettlementService's guest-loading helpers.
            army.HasIndex(a => new { a.TargetSettlementId, a.IsSupporting });

            army.HasMany(a => a.Stacks)
                .WithOne(s => s.Army!)
                .HasForeignKey(s => s.ArmyId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ArmyUnitStackEntity>(stack =>
        {
            stack.ToTable("army_unit_stacks");
            stack.HasKey(s => s.Id);
            stack.Property(s => s.Id).ValueGeneratedNever();
            stack.Property(s => s.UnitType).HasConversion<int>();
        });

        modelBuilder.Entity<BattleReportEntity>(report =>
        {
            report.ToTable("battle_reports");
            report.HasKey(r => r.Id);
            report.Property(r => r.Id).ValueGeneratedNever();
            report.Property(r => r.Winner).HasConversion<int>();

            // Both endpoints of a battle (attacker's and defender's inbox) read
            // by settlement id — see BattleReportService.GetForSettlementAsync.
            report.HasIndex(r => r.AttackerSettlementId);
            report.HasIndex(r => r.DefenderSettlementId);

            report.HasMany(r => r.AttackerLines)
                .WithOne(l => l.BattleReport!)
                .HasForeignKey(l => l.BattleReportId)
                .OnDelete(DeleteBehavior.Cascade);

            report.HasMany(r => r.DefenderLines)
                .WithOne(l => l.BattleReport!)
                .HasForeignKey(l => l.BattleReportId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<BattleReportAttackerLineEntity>(line =>
        {
            line.ToTable("battle_report_attacker_lines");
            line.HasKey(l => l.Id);
            line.Property(l => l.Id).ValueGeneratedNever();
            line.Property(l => l.UnitType).HasConversion<int>();
        });

        modelBuilder.Entity<BattleReportDefenderLineEntity>(line =>
        {
            line.ToTable("battle_report_defender_lines");
            line.HasKey(l => l.Id);
            line.Property(l => l.Id).ValueGeneratedNever();
            line.Property(l => l.UnitType).HasConversion<int>();
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

            // No FK: there is no guild table yet — see UserEntity.GuildId.
            user.HasIndex(u => u.GuildId);

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

        modelBuilder.Entity<GuildEntity>(guild =>
        {
            guild.ToTable("guilds");
            guild.HasKey(g => g.Id);
            guild.Property(g => g.Id).ValueGeneratedNever();
            guild.Property(g => g.Name).HasMaxLength(50).IsRequired();
            guild.Property(g => g.Tag).HasMaxLength(5).IsRequired();
            guild.Property(g => g.Description).HasMaxLength(500);
            guild.Property(g => g.FeeTier).HasConversion<int>();

            // Names and tags are unique within a world, not globally — each
            // world is its own playthrough (MECHANICS.md: a sea/world holds
            // its own islands and players).
            guild.HasIndex(g => new { g.WorldId, g.Name }).IsUnique();
            guild.HasIndex(g => new { g.WorldId, g.Tag }).IsUnique();

            // No inverse collection on WorldEntity yet — nothing needs
            // "world.Guilds" today, so this stays a one-way reference.
            guild.HasOne(g => g.World)
                .WithMany()
                .HasForeignKey(g => g.WorldId)
                .OnDelete(DeleteBehavior.Cascade);

            guild.HasMany(g => g.Memberships)
                .WithOne(m => m.Guild!)
                .HasForeignKey(m => m.GuildId)
                .OnDelete(DeleteBehavior.Cascade);

            guild.HasMany(g => g.Topics)
                .WithOne(t => t.Guild!)
                .HasForeignKey(t => t.GuildId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<GuildMembershipEntity>(membership =>
        {
            membership.ToTable("guild_memberships");
            membership.HasKey(m => m.Id);
            membership.Property(m => m.Id).ValueGeneratedNever();
            membership.Property(m => m.Role).HasConversion<int>();

            // One active guild per account at a time, game-wide — the
            // "no multi-guild membership" rule from the design doc, enforced
            // at the database rather than only checked in the service.
            membership.HasIndex(m => m.UserId).IsUnique();
            membership.HasIndex(m => m.GuildId);

            // Restrict, not cascade: a user account going away should not
            // silently empty a guild's roster (same reasoning as
            // SettlementEntity.Owner).
            membership.HasOne(m => m.User)
                .WithMany()
                .HasForeignKey(m => m.UserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<GuildBoardTopicEntity>(topic =>
        {
            topic.ToTable("guild_board_topics");
            topic.HasKey(t => t.Id);
            topic.Property(t => t.Id).ValueGeneratedNever();
            topic.Property(t => t.Title).HasMaxLength(120).IsRequired();
            topic.Property(t => t.Kind).HasConversion<int>();

            topic.HasIndex(t => t.GuildId);

            topic.HasMany(t => t.Posts)
                .WithOne(p => p.Topic!)
                .HasForeignKey(p => p.TopicId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<GuildBoardPostEntity>(post =>
        {
            post.ToTable("guild_board_posts");
            post.HasKey(p => p.Id);
            post.Property(p => p.Id).ValueGeneratedNever();
            post.Property(p => p.Body).HasMaxLength(4000).IsRequired();

            post.HasIndex(p => p.TopicId);
        });

        modelBuilder.Entity<GuildPeaceTreatyEntity>(treaty =>
        {
            treaty.ToTable("guild_peace_treaties");
            treaty.HasKey(t => t.Id);
            treaty.Property(t => t.Id).ValueGeneratedNever();
            treaty.Property(t => t.Status).HasConversion<int>();

            treaty.HasIndex(t => new { t.ProposerGuildId, t.TargetGuildId });
            treaty.HasIndex(t => t.TargetGuildId);

            // Restrict on both sides: a guild is never hard-deleted (disbanding
            // is the soft DisbandedAt above), so this only guards against ever
            // adding a hard delete later without also deciding what happens to
            // its treaty history.
            treaty.HasOne(t => t.ProposerGuild)
                .WithMany()
                .HasForeignKey(t => t.ProposerGuildId)
                .OnDelete(DeleteBehavior.Restrict);

            treaty.HasOne(t => t.TargetGuild)
                .WithMany()
                .HasForeignKey(t => t.TargetGuildId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Trade offers and shipments are not a nested aggregate under
        // SettlementEntity the way Buildings/Queue are — a trade always
        // spans two settlements, so each is its own table, queried directly
        // off this context rather than synced through Settlement.ApplyDomain.
        // No navigation properties onto SettlementEntity: `.WithMany()`
        // below creates the foreign key without requiring a back-collection
        // on the settlement side, so SettlementEntity stays untouched.
        modelBuilder.Entity<TradeOfferEntity>(offer =>
        {
            offer.ToTable("trade_offers");
            offer.HasKey(o => o.Id);
            offer.Property(o => o.Id).ValueGeneratedNever();
            offer.Property(o => o.OfferedResource).HasConversion<int>();
            offer.Property(o => o.RequestedResource).HasConversion<int>();
            offer.Property(o => o.State).HasConversion<int>();

            offer.HasOne<SettlementEntity>().WithMany()
                .HasForeignKey(o => o.PosterSettlementId)
                .OnDelete(DeleteBehavior.Restrict);

            // The trade board's query: open, unexpired offers in a world,
            // excluding the caller's own.
            offer.HasIndex(o => new { o.WorldId, o.State, o.ExpiresAt });
            offer.HasIndex(o => o.PosterSettlementId);
        });

        modelBuilder.Entity<ShipmentEntity>(shipment =>
        {
            shipment.ToTable("shipments");
            shipment.HasKey(s => s.Id);
            shipment.Property(s => s.Id).ValueGeneratedNever();
            shipment.Property(s => s.CargoResource).HasConversion<int>();

            shipment.HasOne<TradeOfferEntity>().WithMany()
                .HasForeignKey(s => s.OfferId)
                .OnDelete(DeleteBehavior.Cascade);

            shipment.HasOne<SettlementEntity>().WithMany()
                .HasForeignKey(s => s.FromSettlementId)
                .OnDelete(DeleteBehavior.Restrict);

            shipment.HasOne<SettlementEntity>().WithMany()
                .HasForeignKey(s => s.ToSettlementId)
                .OnDelete(DeleteBehavior.Restrict);

            shipment.HasIndex(s => s.OfferId);
            shipment.HasIndex(s => new { s.ToSettlementId, s.DeliveredAt, s.ArrivesAt });
            shipment.HasIndex(s => s.FromSettlementId);
        });

        modelBuilder.Entity<TradeReportEntity>(report =>
        {
            report.ToTable("trade_reports");
            report.HasKey(r => r.Id);
            report.Property(r => r.Id).ValueGeneratedNever();
            report.Property(r => r.OfferedResource).HasConversion<int>();
            report.Property(r => r.RequestedResource).HasConversion<int>();

            report.HasOne<TradeOfferEntity>().WithMany()
                .HasForeignKey(r => r.OfferId)
                .OnDelete(DeleteBehavior.Cascade);

            report.HasIndex(r => r.OfferId).IsUnique();
            report.HasIndex(r => r.PosterSettlementId);
            report.HasIndex(r => r.AcceptorSettlementId);
        });

        modelBuilder.Entity<MessageEntity>(message =>
        {
            message.ToTable("messages");
            message.HasKey(m => m.Id);
            message.Property(m => m.Id).ValueGeneratedNever();
            message.Property(m => m.Body).HasMaxLength(2000).IsRequired();

            message.HasOne(m => m.Sender)
                .WithMany()
                .HasForeignKey(m => m.SenderUserId)
                .OnDelete(DeleteBehavior.Restrict);

            message.HasIndex(m => m.SenderUserId);

            message.HasMany(m => m.Recipients)
                .WithOne(r => r.Message!)
                .HasForeignKey(r => r.MessageId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<MessageRecipientEntity>(recipient =>
        {
            recipient.ToTable("message_recipients");
            recipient.HasKey(r => r.Id);
            recipient.Property(r => r.Id).ValueGeneratedNever();

            recipient.HasOne(r => r.Recipient)
                .WithMany()
                .HasForeignKey(r => r.RecipientUserId)
                .OnDelete(DeleteBehavior.Restrict);

            // One delivery per recipient per message.
            recipient.HasIndex(r => new { r.MessageId, r.RecipientUserId }).IsUnique();

            // Inbox paging: a recipient's messages, newest first.
            recipient.HasIndex(r => new { r.RecipientUserId, r.MessageId });

            // Unread counts: ReadAt is null.
            recipient.HasIndex(r => new { r.RecipientUserId, r.ReadAt });
        });

        // A generic moderation report — issue #41 (chat) unified with issue
        // #42's profile reports (previously a separate ProfileReportEntity/
        // profile_reports table) onto one queue via SourceType/SourceId.
        modelBuilder.Entity<ReportEntity>(report =>
        {
            report.ToTable("reports");
            report.HasKey(r => r.Id);
            report.Property(r => r.Id).ValueGeneratedNever();
            report.Property(r => r.SourceType).HasConversion<int>();
            report.Property(r => r.Status).HasConversion<int>();
            report.Property(r => r.ContextSnapshot).HasMaxLength(2200).IsRequired();
            report.Property(r => r.Reason).HasMaxLength(500).IsRequired();
            report.Property(r => r.Note).HasMaxLength(2000);
            report.Property(r => r.ResolutionNote).HasMaxLength(500);

            report.HasOne(r => r.Reporter)
                .WithMany()
                .HasForeignKey(r => r.ReporterUserId)
                .OnDelete(DeleteBehavior.Restrict);

            // A user account going away must not silently delete the
            // moderation record either way round — same reasoning as
            // settlements' Restrict above. (Users are never deleted today.)
            report.HasOne(r => r.ReportedUser)
                .WithMany()
                .HasForeignKey(r => r.ReportedUserId)
                .OnDelete(DeleteBehavior.Restrict);

            report.HasOne(r => r.ResolvedBy)
                .WithMany()
                .HasForeignKey(r => r.ResolvedByUserId)
                .OnDelete(DeleteBehavior.Restrict);

            // The admin queue lists by status; the duplicate-pending guard
            // (only one Pending report per reporter+source at a time — see
            // ReportService.CreateAsync) looks up (reporter, source) pairs.
            report.HasIndex(r => new { r.Status, r.Id });
            report.HasIndex(r => new { r.ReporterUserId, r.SourceType, r.SourceId });
        });

        modelBuilder.Entity<LeaderboardSnapshotEntity>(snapshot =>
        {
            snapshot.ToTable("leaderboard_snapshots");
            snapshot.HasKey(s => s.Id);
            snapshot.Property(s => s.Id).ValueGeneratedNever();
            snapshot.Property(s => s.Scope).HasConversion<int>();
            snapshot.Property(s => s.Category).HasConversion<int>();

            snapshot.HasOne(s => s.World)
                .WithMany()
                .HasForeignKey(s => s.WorldId)
                .OnDelete(DeleteBehavior.Cascade);

            // A window is closed exactly once. This should be a unique index
            // filtered to IsFinal = true (only one final snapshot per board per
            // period; any number of superseded non-final ones), but there is no
            // existing precedent in this model for a provider-parity-safe
            // filtered index across both SQLite and PostgreSQL, so this is a
            // plain unique index for now: LeaderboardService enforces "at most
            // one non-final snapshot per board" itself by deleting the previous
            // one before/after inserting the replacement.
            snapshot.HasIndex(s => new { s.WorldId, s.Scope, s.Category, s.PeriodStart, s.IsFinal }).IsUnique();

            // Finds the latest current snapshot for a board.
            snapshot.HasIndex(s => new { s.WorldId, s.Scope, s.Category, s.ComputedAt });

            snapshot.HasMany(s => s.Entries)
                .WithOne(e => e.Snapshot!)
                .HasForeignKey(e => e.SnapshotId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<LeaderboardEntryEntity>(entry =>
        {
            entry.ToTable("leaderboard_entries");
            entry.HasKey(e => e.Id);
            entry.Property(e => e.Id).ValueGeneratedNever();
            entry.Property(e => e.SubjectName).HasMaxLength(100).IsRequired();

            // The keyset pagination key: ORDER BY Rank, WHERE Rank > @afterRank.
            entry.HasIndex(e => new { e.SnapshotId, e.Rank }).IsUnique();

            // The "my rank" lookup.
            entry.HasIndex(e => new { e.SnapshotId, e.SubjectId });
        });

        modelBuilder.Entity<LeaderboardWatermarkEntity>(watermark =>
        {
            watermark.ToTable("leaderboard_watermarks");
            watermark.HasKey(w => w.Id);
            watermark.Property(w => w.Id).ValueGeneratedNever();

            watermark.HasOne(w => w.World)
                .WithMany()
                .HasForeignKey(w => w.WorldId)
                .OnDelete(DeleteBehavior.Cascade);

            watermark.HasIndex(w => w.WorldId).IsUnique();
        });

        modelBuilder.Entity<WeeklyStatEntity>(stat =>
        {
            stat.ToTable("weekly_stats");
            stat.HasKey(s => s.Id);
            stat.Property(s => s.Id).ValueGeneratedNever();

            stat.HasOne(s => s.World)
                .WithMany()
                .HasForeignKey(s => s.WorldId)
                .OnDelete(DeleteBehavior.Cascade);

            // Same reasoning as SettlementEntity.Owner: a locked/banned user's
            // history should not vanish with them.
            stat.HasOne(s => s.User)
                .WithMany()
                .HasForeignKey(s => s.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            // Recomputation is an upsert keyed on this triple.
            stat.HasIndex(s => new { s.WorldId, s.UserId, s.PeriodStart }).IsUnique();
        });

        modelBuilder.Entity<UserActivityEntity>(activity =>
        {
            activity.ToTable("user_activity");

            // UserId is the primary key, not a separately-generated one: this
            // is a one-row-per-user upsert target, not an append log. Same
            // ValueGeneratedNever reasoning as every other key in this model —
            // it is always assigned by application code (the user's own id),
            // never the database.
            activity.HasKey(a => a.UserId);
            activity.Property(a => a.UserId).ValueGeneratedNever();

            // Cascade: an activity summary has no meaning once its user is
            // gone, unlike SettlementEntity.Owner or WeeklyStatEntity.User,
            // which deliberately outlive the account.
            activity.HasOne(a => a.User)
                .WithOne()
                .HasForeignKey<UserActivityEntity>(a => a.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<UserActivitySessionEntity>(session =>
        {
            session.ToTable("user_activity_sessions");
            session.HasKey(s => s.Id);
            session.Property(s => s.Id).ValueGeneratedNever();

            session.HasOne(s => s.User)
                .WithMany()
                .HasForeignKey(s => s.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // UserActivityService.TrackAsync's hot lookup: "this user's most
            // recent session, by LastSeenAtUtc desc" — the composite index
            // covers it directly.
            session.HasIndex(s => new { s.UserId, s.LastSeenAtUtc });

            // Retention (a later PR) sweeps by age.
            session.HasIndex(s => s.StartedAtUtc);
        });

        modelBuilder.Entity<PlayerExploredEntity>(explored =>
        {
            explored.ToTable("player_explored");
            explored.HasKey(e => e.Id);
            explored.Property(e => e.Id).ValueGeneratedNever();
            explored.Property(e => e.OwnerId).IsRequired();

            // One row per player per world — FogMaskService reads/writes it
            // by this exact pair every call, and it's what "the same player
            // asking again" means for this table.
            explored.HasIndex(e => new { e.WorldId, e.OwnerId }).IsUnique();

            explored.HasOne(e => e.World)
                .WithMany()
                .HasForeignKey(e => e.WorldId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
