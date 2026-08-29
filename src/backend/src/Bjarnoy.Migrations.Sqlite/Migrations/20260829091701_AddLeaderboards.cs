using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class AddLeaderboards : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "leaderboard_snapshots",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    WorldId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Scope = table.Column<int>(type: "INTEGER", nullable: false),
                    Category = table.Column<int>(type: "INTEGER", nullable: false),
                    PeriodStart = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    PeriodEnd = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    IsFinal = table.Column<bool>(type: "INTEGER", nullable: false),
                    ComputedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_leaderboard_snapshots", x => x.Id);
                    table.ForeignKey(
                        name: "FK_leaderboard_snapshots_worlds_WorldId",
                        column: x => x.WorldId,
                        principalTable: "worlds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "leaderboard_watermarks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    WorldId = table.Column<Guid>(type: "TEXT", nullable: false),
                    LastClosedPeriodStart = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    LastSnapshotAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    LastBattleReportId = table.Column<Guid>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_leaderboard_watermarks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_leaderboard_watermarks_worlds_WorldId",
                        column: x => x.WorldId,
                        principalTable: "worlds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "leaderboard_entries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SnapshotId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Rank = table.Column<int>(type: "INTEGER", nullable: false),
                    SubjectId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SubjectName = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Value = table.Column<double>(type: "REAL", nullable: false),
                    PreviousRank = table.Column<int>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_leaderboard_entries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_leaderboard_entries_leaderboard_snapshots_SnapshotId",
                        column: x => x.SnapshotId,
                        principalTable: "leaderboard_snapshots",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_leaderboard_entries_SnapshotId_Rank",
                table: "leaderboard_entries",
                columns: new[] { "SnapshotId", "Rank" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_leaderboard_entries_SnapshotId_SubjectId",
                table: "leaderboard_entries",
                columns: new[] { "SnapshotId", "SubjectId" });

            migrationBuilder.CreateIndex(
                name: "IX_leaderboard_snapshots_WorldId_Scope_Category_ComputedAt",
                table: "leaderboard_snapshots",
                columns: new[] { "WorldId", "Scope", "Category", "ComputedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_leaderboard_snapshots_WorldId_Scope_Category_PeriodStart_IsFinal",
                table: "leaderboard_snapshots",
                columns: new[] { "WorldId", "Scope", "Category", "PeriodStart", "IsFinal" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_leaderboard_watermarks_WorldId",
                table: "leaderboard_watermarks",
                column: "WorldId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "leaderboard_entries");

            migrationBuilder.DropTable(
                name: "leaderboard_watermarks");

            migrationBuilder.DropTable(
                name: "leaderboard_snapshots");
        }
    }
}
