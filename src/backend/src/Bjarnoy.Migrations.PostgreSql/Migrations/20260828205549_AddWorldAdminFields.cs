using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddWorldAdminFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EndbossAt",
                table: "worlds",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EndbossTriggeredAt",
                table: "worlds",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "JoinsClosed",
                table: "worlds",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<double>(
                name: "SpeedFactor",
                table: "worlds",
                type: "double precision",
                nullable: false,
                defaultValue: 1.0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "StartsAt",
                table: "worlds",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EndbossAt",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "EndbossTriggeredAt",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "JoinsClosed",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "SpeedFactor",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "StartsAt",
                table: "worlds");
        }
    }
}
