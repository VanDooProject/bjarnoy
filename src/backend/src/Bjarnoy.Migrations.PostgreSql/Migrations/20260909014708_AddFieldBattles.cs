using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddFieldBattles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "RetreatImmune",
                table: "armies",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "field_battle_claims",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClaimedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_field_battle_claims", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "field_battle_reports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    HexQ = table.Column<int>(type: "integer", nullable: false),
                    HexR = table.Column<int>(type: "integer", nullable: false),
                    SideAArmyId = table.Column<Guid>(type: "uuid", nullable: false),
                    SideASettlementId = table.Column<Guid>(type: "uuid", nullable: false),
                    SideBArmyId = table.Column<Guid>(type: "uuid", nullable: false),
                    SideBSettlementId = table.Column<Guid>(type: "uuid", nullable: false),
                    Winner = table.Column<int>(type: "integer", nullable: false),
                    SideAPower = table.Column<double>(type: "double precision", nullable: false),
                    SideBPower = table.Column<double>(type: "double precision", nullable: false),
                    SideAWasDefending = table.Column<bool>(type: "boolean", nullable: false),
                    SideBWasDefending = table.Column<bool>(type: "boolean", nullable: false),
                    Seed = table.Column<int>(type: "integer", nullable: false),
                    LootWood = table.Column<double>(type: "double precision", nullable: false),
                    LootStone = table.Column<double>(type: "double precision", nullable: false),
                    LootFood = table.Column<double>(type: "double precision", nullable: false),
                    LootIron = table.Column<double>(type: "double precision", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_field_battle_reports", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "field_battle_report_lines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FieldBattleReportId = table.Column<Guid>(type: "uuid", nullable: false),
                    Side = table.Column<int>(type: "integer", nullable: false),
                    IsLoss = table.Column<bool>(type: "boolean", nullable: false),
                    UnitType = table.Column<int>(type: "integer", nullable: false),
                    Count = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_field_battle_report_lines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_field_battle_report_lines_field_battle_reports_FieldBattleR~",
                        column: x => x.FieldBattleReportId,
                        principalTable: "field_battle_reports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_armies_AtHome_IsSupporting",
                table: "armies",
                columns: new[] { "AtHome", "IsSupporting" });

            migrationBuilder.CreateIndex(
                name: "IX_field_battle_report_lines_FieldBattleReportId",
                table: "field_battle_report_lines",
                column: "FieldBattleReportId");

            migrationBuilder.CreateIndex(
                name: "IX_field_battle_reports_SideASettlementId",
                table: "field_battle_reports",
                column: "SideASettlementId");

            migrationBuilder.CreateIndex(
                name: "IX_field_battle_reports_SideBSettlementId",
                table: "field_battle_reports",
                column: "SideBSettlementId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "field_battle_claims");

            migrationBuilder.DropTable(
                name: "field_battle_report_lines");

            migrationBuilder.DropTable(
                name: "field_battle_reports");

            migrationBuilder.DropIndex(
                name: "IX_armies_AtHome_IsSupporting",
                table: "armies");

            migrationBuilder.DropColumn(
                name: "RetreatImmune",
                table: "armies");
        }
    }
}
