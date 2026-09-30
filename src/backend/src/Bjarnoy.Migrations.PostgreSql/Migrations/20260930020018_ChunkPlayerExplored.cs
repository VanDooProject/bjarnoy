using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class ChunkPlayerExplored : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Deliberately drops the whole-world explored bitsets instead of
            // converting them: the old rows were one blob per (world, player)
            // over the world's whole texel rectangle, and old worlds' fog
            // history is not worth a data migration (owner's call). A player
            // keeps everything their settlements, towers and armies currently
            // cover — those rings are re-merged into chunks on the next fog
            // request — and only loses ground scouted by things that no
            // longer exist.
            migrationBuilder.DropTable(
                name: "player_explored");

            migrationBuilder.CreateTable(
                name: "player_explored_chunks",
                columns: table => new
                {
                    WorldId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ChunkU = table.Column<int>(type: "integer", nullable: false),
                    ChunkV = table.Column<int>(type: "integer", nullable: false),
                    Bits = table.Column<byte[]>(type: "bytea", nullable: true),
                    IsFull = table.Column<bool>(type: "boolean", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_player_explored_chunks", x => new { x.WorldId, x.OwnerId, x.ChunkU, x.ChunkV });
                    table.ForeignKey(
                        name: "FK_player_explored_chunks_worlds_WorldId",
                        column: x => x.WorldId,
                        principalTable: "worlds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "player_explored_chunks");

            migrationBuilder.CreateTable(
                name: "player_explored",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorldId = table.Column<Guid>(type: "uuid", nullable: false),
                    Bits = table.Column<byte[]>(type: "bytea", nullable: false),
                    OwnerId = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_player_explored", x => x.Id);
                    table.ForeignKey(
                        name: "FK_player_explored_worlds_WorldId",
                        column: x => x.WorldId,
                        principalTable: "worlds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_player_explored_WorldId_OwnerId",
                table: "player_explored",
                columns: new[] { "WorldId", "OwnerId" },
                unique: true);
        }
    }
}
