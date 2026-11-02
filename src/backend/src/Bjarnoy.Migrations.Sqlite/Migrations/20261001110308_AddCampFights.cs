using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class AddCampFights : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "TargetCampQ",
                table: "armies",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TargetCampR",
                table: "armies",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "camp_reports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    WorldId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Kind = table.Column<int>(type: "INTEGER", nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    CampQ = table.Column<int>(type: "INTEGER", nullable: false),
                    CampR = table.Column<int>(type: "INTEGER", nullable: false),
                    Family = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    EffectiveLevel = table.Column<int>(type: "INTEGER", nullable: false),
                    SettlementId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ArmyId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Winner = table.Column<int>(type: "INTEGER", nullable: false),
                    ArmyPower = table.Column<double>(type: "REAL", nullable: false),
                    CampPower = table.Column<double>(type: "REAL", nullable: false),
                    Seed = table.Column<int>(type: "INTEGER", nullable: false),
                    LootWood = table.Column<double>(type: "REAL", nullable: false),
                    LootStone = table.Column<double>(type: "REAL", nullable: false),
                    LootFood = table.Column<double>(type: "REAL", nullable: false),
                    LootIron = table.Column<double>(type: "REAL", nullable: false),
                    CampCleared = table.Column<bool>(type: "INTEGER", nullable: false),
                    TowerQ = table.Column<int>(type: "INTEGER", nullable: true),
                    TowerR = table.Column<int>(type: "INTEGER", nullable: true),
                    TowerBurned = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_camp_reports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_camp_reports_settlements_SettlementId",
                        column: x => x.SettlementId,
                        principalTable: "settlements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_camp_reports_worlds_WorldId",
                        column: x => x.WorldId,
                        principalTable: "worlds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "camp_states",
                columns: table => new
                {
                    WorldId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Q = table.Column<int>(type: "INTEGER", nullable: false),
                    R = table.Column<int>(type: "INTEGER", nullable: false),
                    Young = table.Column<int>(type: "INTEGER", nullable: false),
                    Adult = table.Column<int>(type: "INTEGER", nullable: false),
                    Alpha = table.Column<int>(type: "INTEGER", nullable: false),
                    SnapshotAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    ClearedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    CalmUntil = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    Clears = table.Column<int>(type: "INTEGER", nullable: false),
                    LeftoverWood = table.Column<double>(type: "REAL", nullable: false),
                    LeftoverStone = table.Column<double>(type: "REAL", nullable: false),
                    LeftoverFood = table.Column<double>(type: "REAL", nullable: false),
                    LeftoverIron = table.Column<double>(type: "REAL", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_camp_states", x => new { x.WorldId, x.Q, x.R });
                    table.ForeignKey(
                        name: "FK_camp_states_worlds_WorldId",
                        column: x => x.WorldId,
                        principalTable: "worlds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "camp_report_beast_lines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CampReportId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Tier = table.Column<int>(type: "INTEGER", nullable: false),
                    Before = table.Column<int>(type: "INTEGER", nullable: false),
                    Lost = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_camp_report_beast_lines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_camp_report_beast_lines_camp_reports_CampReportId",
                        column: x => x.CampReportId,
                        principalTable: "camp_reports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "camp_report_unit_lines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CampReportId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UnitType = table.Column<int>(type: "INTEGER", nullable: false),
                    Sent = table.Column<int>(type: "INTEGER", nullable: false),
                    Lost = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_camp_report_unit_lines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_camp_report_unit_lines_camp_reports_CampReportId",
                        column: x => x.CampReportId,
                        principalTable: "camp_reports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_camp_report_beast_lines_CampReportId",
                table: "camp_report_beast_lines",
                column: "CampReportId");

            migrationBuilder.CreateIndex(
                name: "IX_camp_report_unit_lines_CampReportId",
                table: "camp_report_unit_lines",
                column: "CampReportId");

            migrationBuilder.CreateIndex(
                name: "IX_camp_reports_SettlementId",
                table: "camp_reports",
                column: "SettlementId");

            migrationBuilder.CreateIndex(
                name: "IX_camp_reports_WorldId",
                table: "camp_reports",
                column: "WorldId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "camp_report_beast_lines");

            migrationBuilder.DropTable(
                name: "camp_report_unit_lines");

            migrationBuilder.DropTable(
                name: "camp_states");

            migrationBuilder.DropTable(
                name: "camp_reports");

            migrationBuilder.DropColumn(
                name: "TargetCampQ",
                table: "armies");

            migrationBuilder.DropColumn(
                name: "TargetCampR",
                table: "armies");
        }
    }
}
