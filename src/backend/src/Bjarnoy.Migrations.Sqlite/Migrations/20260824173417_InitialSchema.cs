using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class InitialSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "worlds",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Seed = table.Column<int>(type: "INTEGER", nullable: false),
                    Radius = table.Column<int>(type: "INTEGER", nullable: false),
                    IslandCellSize = table.Column<int>(type: "INTEGER", nullable: false),
                    IslandChance = table.Column<double>(type: "REAL", nullable: false),
                    IslandMinRadius = table.Column<double>(type: "REAL", nullable: false),
                    IslandMaxRadius = table.Column<double>(type: "REAL", nullable: false),
                    BeachThreshold = table.Column<double>(type: "REAL", nullable: false),
                    MountainThreshold = table.Column<double>(type: "REAL", nullable: false),
                    MountainRockiness = table.Column<double>(type: "REAL", nullable: false),
                    ForestRockiness = table.Column<double>(type: "REAL", nullable: false),
                    MinimumIslandTiles = table.Column<int>(type: "INTEGER", nullable: false),
                    MaxPlayers = table.Column<int>(type: "INTEGER", nullable: false),
                    Status = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_worlds", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "islands",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    WorldId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Index = table.Column<int>(type: "INTEGER", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    CentreQ = table.Column<int>(type: "INTEGER", nullable: false),
                    CentreR = table.Column<int>(type: "INTEGER", nullable: false),
                    TileCount = table.Column<int>(type: "INTEGER", nullable: false),
                    StartPositions = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_islands", x => x.Id);
                    table.ForeignKey(
                        name: "FK_islands_worlds_WorldId",
                        column: x => x.WorldId,
                        principalTable: "worlds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_islands_WorldId_Index",
                table: "islands",
                columns: new[] { "WorldId", "Index" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_worlds_Name",
                table: "worlds",
                column: "Name",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "islands");

            migrationBuilder.DropTable(
                name: "worlds");
        }
    }
}
