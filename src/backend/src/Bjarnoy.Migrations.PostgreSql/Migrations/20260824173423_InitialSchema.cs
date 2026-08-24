using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
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
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Seed = table.Column<int>(type: "integer", nullable: false),
                    Radius = table.Column<int>(type: "integer", nullable: false),
                    IslandCellSize = table.Column<int>(type: "integer", nullable: false),
                    IslandChance = table.Column<double>(type: "double precision", nullable: false),
                    IslandMinRadius = table.Column<double>(type: "double precision", nullable: false),
                    IslandMaxRadius = table.Column<double>(type: "double precision", nullable: false),
                    BeachThreshold = table.Column<double>(type: "double precision", nullable: false),
                    MountainThreshold = table.Column<double>(type: "double precision", nullable: false),
                    MountainRockiness = table.Column<double>(type: "double precision", nullable: false),
                    ForestRockiness = table.Column<double>(type: "double precision", nullable: false),
                    MinimumIslandTiles = table.Column<int>(type: "integer", nullable: false),
                    MaxPlayers = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_worlds", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "islands",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorldId = table.Column<Guid>(type: "uuid", nullable: false),
                    Index = table.Column<int>(type: "integer", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CentreQ = table.Column<int>(type: "integer", nullable: false),
                    CentreR = table.Column<int>(type: "integer", nullable: false),
                    TileCount = table.Column<int>(type: "integer", nullable: false),
                    StartPositions = table.Column<string>(type: "text", nullable: false)
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
