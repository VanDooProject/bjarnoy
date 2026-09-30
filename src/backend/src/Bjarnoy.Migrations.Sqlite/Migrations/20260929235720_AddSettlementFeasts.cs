using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class AddSettlementFeasts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "FeastEndsAt",
                table: "settlements",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "FeastRenownGain",
                table: "settlements",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "FeastStartedAt",
                table: "settlements",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "PendingFeastRenown",
                table: "settlements",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FeastEndsAt",
                table: "settlements");

            migrationBuilder.DropColumn(
                name: "FeastRenownGain",
                table: "settlements");

            migrationBuilder.DropColumn(
                name: "FeastStartedAt",
                table: "settlements");

            migrationBuilder.DropColumn(
                name: "PendingFeastRenown",
                table: "settlements");
        }
    }
}
