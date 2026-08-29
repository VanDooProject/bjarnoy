using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddCombat : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "LootFood",
                table: "armies",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "LootIron",
                table: "armies",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "LootStone",
                table: "armies",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "LootWood",
                table: "armies",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<Guid>(
                name: "TargetSettlementId",
                table: "armies",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "battle_reports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AttackerArmyId = table.Column<Guid>(type: "uuid", nullable: false),
                    AttackerSettlementId = table.Column<Guid>(type: "uuid", nullable: false),
                    DefenderSettlementId = table.Column<Guid>(type: "uuid", nullable: false),
                    Winner = table.Column<int>(type: "integer", nullable: false),
                    AttackPower = table.Column<double>(type: "double precision", nullable: false),
                    DefensePower = table.Column<double>(type: "double precision", nullable: false),
                    Seed = table.Column<int>(type: "integer", nullable: false),
                    LootWood = table.Column<double>(type: "double precision", nullable: false),
                    LootStone = table.Column<double>(type: "double precision", nullable: false),
                    LootFood = table.Column<double>(type: "double precision", nullable: false),
                    LootIron = table.Column<double>(type: "double precision", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_battle_reports", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "battle_report_attacker_lines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BattleReportId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitType = table.Column<int>(type: "integer", nullable: false),
                    Sent = table.Column<int>(type: "integer", nullable: false),
                    Lost = table.Column<int>(type: "integer", nullable: false),
                    Survived = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_battle_report_attacker_lines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_battle_report_attacker_lines_battle_reports_BattleReportId",
                        column: x => x.BattleReportId,
                        principalTable: "battle_reports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "battle_report_defender_lines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BattleReportId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitType = table.Column<int>(type: "integer", nullable: false),
                    Lost = table.Column<int>(type: "integer", nullable: false),
                    Survived = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_battle_report_defender_lines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_battle_report_defender_lines_battle_reports_BattleReportId",
                        column: x => x.BattleReportId,
                        principalTable: "battle_reports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_battle_report_attacker_lines_BattleReportId",
                table: "battle_report_attacker_lines",
                column: "BattleReportId");

            migrationBuilder.CreateIndex(
                name: "IX_battle_report_defender_lines_BattleReportId",
                table: "battle_report_defender_lines",
                column: "BattleReportId");

            migrationBuilder.CreateIndex(
                name: "IX_battle_reports_AttackerSettlementId",
                table: "battle_reports",
                column: "AttackerSettlementId");

            migrationBuilder.CreateIndex(
                name: "IX_battle_reports_DefenderSettlementId",
                table: "battle_reports",
                column: "DefenderSettlementId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "battle_report_attacker_lines");

            migrationBuilder.DropTable(
                name: "battle_report_defender_lines");

            migrationBuilder.DropTable(
                name: "battle_reports");

            migrationBuilder.DropColumn(
                name: "LootFood",
                table: "armies");

            migrationBuilder.DropColumn(
                name: "LootIron",
                table: "armies");

            migrationBuilder.DropColumn(
                name: "LootStone",
                table: "armies");

            migrationBuilder.DropColumn(
                name: "LootWood",
                table: "armies");

            migrationBuilder.DropColumn(
                name: "TargetSettlementId",
                table: "armies");
        }
    }
}
