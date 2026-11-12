using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class AddArmyReports : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "army_reports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    WorldId = table.Column<Guid>(type: "TEXT", nullable: false),
                    OwnerId = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Kind = table.Column<int>(type: "INTEGER", nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    ArmyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Q = table.Column<int>(type: "INTEGER", nullable: false),
                    R = table.Column<int>(type: "INTEGER", nullable: false),
                    Mission = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_army_reports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_army_reports_worlds_WorldId",
                        column: x => x.WorldId,
                        principalTable: "worlds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "army_report_unit_lines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ArmyReportId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UnitType = table.Column<int>(type: "INTEGER", nullable: false),
                    Count = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_army_report_unit_lines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_army_report_unit_lines_army_reports_ArmyReportId",
                        column: x => x.ArmyReportId,
                        principalTable: "army_reports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_army_report_unit_lines_ArmyReportId",
                table: "army_report_unit_lines",
                column: "ArmyReportId");

            migrationBuilder.CreateIndex(
                name: "IX_army_reports_WorldId_OwnerId",
                table: "army_reports",
                columns: new[] { "WorldId", "OwnerId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "army_report_unit_lines");

            migrationBuilder.DropTable(
                name: "army_reports");
        }
    }
}
