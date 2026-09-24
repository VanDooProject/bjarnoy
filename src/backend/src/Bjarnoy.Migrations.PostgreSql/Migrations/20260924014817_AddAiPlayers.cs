using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddAiPlayers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The default is evaluated when this migration actually runs (a
            // regular C# expression in Up(), not a value baked in at
            // generation time), so every pre-existing settlement backfills to
            // roughly "now" rather than some arbitrary fixed instant. A fixed
            // literal (e.g. year 1, or this file's own authoring time) would
            // make every settlement that already existed either instantly
            // eligible for AI takeover or eligible on a schedule that has
            // nothing to do with when the migration was actually deployed —
            // see docs/design/ai-players.md's "Takeover rule".
            var backfillInstant = DateTimeOffset.UtcNow;

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastOwnerActivityAt",
                table: "settlements",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: backfillInstant);

            migrationBuilder.CreateTable(
                name: "ai_players",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorldId = table.Column<Guid>(type: "uuid", nullable: false),
                    Personality = table.Column<int>(type: "integer", nullable: false),
                    Objectives = table.Column<string>(type: "text", nullable: false),
                    NextActAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    TakenOverSettlementId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ai_players", x => x.UserId);
                    table.ForeignKey(
                        name: "FK_ai_players_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ai_players_worlds_WorldId",
                        column: x => x.WorldId,
                        principalTable: "worlds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ai_players_NextActAt",
                table: "ai_players",
                column: "NextActAt");

            migrationBuilder.CreateIndex(
                name: "IX_ai_players_WorldId",
                table: "ai_players",
                column: "WorldId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ai_players");

            migrationBuilder.DropColumn(
                name: "LastOwnerActivityAt",
                table: "settlements");
        }
    }
}
