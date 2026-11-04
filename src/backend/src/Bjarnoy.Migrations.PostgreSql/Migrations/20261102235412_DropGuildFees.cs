using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class DropGuildFees : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FeeTier",
                table: "guilds");

            migrationBuilder.DropColumn(
                name: "FeePaidThroughAt",
                table: "guild_memberships");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "FeeTier",
                table: "guilds",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "FeePaidThroughAt",
                table: "guild_memberships",
                type: "timestamp with time zone",
                nullable: true);
        }
    }
}
