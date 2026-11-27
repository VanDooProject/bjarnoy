using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class BackfillReportOwners : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Backfill: every report takes its owners (and world) from the settlements it already names. A report whose
            // settlement is already gone keeps the empty owner and no world: nobody could open it before either.
            migrationBuilder.Sql(@"UPDATE battle_reports SET
                ""WorldId"" = (SELECT s.""WorldId"" FROM settlements s WHERE s.""Id"" = battle_reports.""AttackerSettlementId""),
                ""AttackerOwnerId"" = (SELECT s.""OwnerId"" FROM settlements s WHERE s.""Id"" = battle_reports.""AttackerSettlementId"")
                WHERE EXISTS (SELECT 1 FROM settlements s WHERE s.""Id"" = battle_reports.""AttackerSettlementId"")");
            migrationBuilder.Sql(@"UPDATE battle_reports SET
                ""DefenderOwnerId"" = (SELECT s.""OwnerId"" FROM settlements s WHERE s.""Id"" = battle_reports.""DefenderSettlementId"")
                WHERE EXISTS (SELECT 1 FROM settlements s WHERE s.""Id"" = battle_reports.""DefenderSettlementId"")");
            migrationBuilder.Sql(@"UPDATE field_battle_reports SET
                ""WorldId"" = (SELECT s.""WorldId"" FROM settlements s WHERE s.""Id"" = field_battle_reports.""SideASettlementId""),
                ""SideAOwnerId"" = (SELECT s.""OwnerId"" FROM settlements s WHERE s.""Id"" = field_battle_reports.""SideASettlementId"")
                WHERE EXISTS (SELECT 1 FROM settlements s WHERE s.""Id"" = field_battle_reports.""SideASettlementId"")");
            migrationBuilder.Sql(@"UPDATE field_battle_reports SET
                ""SideBOwnerId"" = (SELECT s.""OwnerId"" FROM settlements s WHERE s.""Id"" = field_battle_reports.""SideBSettlementId"")
                WHERE EXISTS (SELECT 1 FROM settlements s WHERE s.""Id"" = field_battle_reports.""SideBSettlementId"")");
            migrationBuilder.Sql(@"UPDATE camp_reports SET
                ""OwnerId"" = (SELECT s.""OwnerId"" FROM settlements s WHERE s.""Id"" = camp_reports.""SettlementId"")
                WHERE EXISTS (SELECT 1 FROM settlements s WHERE s.""Id"" = camp_reports.""SettlementId"")");
            migrationBuilder.Sql(@"UPDATE trade_reports SET
                ""WorldId"" = (SELECT s.""WorldId"" FROM settlements s WHERE s.""Id"" = trade_reports.""PosterSettlementId""),
                ""PosterOwnerId"" = (SELECT s.""OwnerId"" FROM settlements s WHERE s.""Id"" = trade_reports.""PosterSettlementId"")
                WHERE EXISTS (SELECT 1 FROM settlements s WHERE s.""Id"" = trade_reports.""PosterSettlementId"")");
            migrationBuilder.Sql(@"UPDATE trade_reports SET
                ""AcceptorOwnerId"" = (SELECT s.""OwnerId"" FROM settlements s WHERE s.""Id"" = trade_reports.""AcceptorSettlementId"")
                WHERE EXISTS (SELECT 1 FROM settlements s WHERE s.""Id"" = trade_reports.""AcceptorSettlementId"")");

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
