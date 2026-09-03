using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddBeginnerShield : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "BaseShieldDays",
                table: "worlds",
                type: "double precision",
                nullable: false,
                defaultValue: 7.0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ShieldExpiresAtUtc",
                table: "settlements",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BaseShieldDays",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "ShieldExpiresAtUtc",
                table: "settlements");
        }
    }
}
