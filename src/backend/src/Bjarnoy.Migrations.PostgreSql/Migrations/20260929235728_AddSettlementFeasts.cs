using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
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
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "FeastRenownGain",
                table: "settlements",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "FeastStartedAt",
                table: "settlements",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "PendingFeastRenown",
                table: "settlements",
                type: "double precision",
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
