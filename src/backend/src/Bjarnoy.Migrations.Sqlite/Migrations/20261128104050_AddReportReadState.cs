using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class AddReportReadState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AcceptorReadAt",
                table: "trade_reports",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PosterReadAt",
                table: "trade_reports",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SideAReadAt",
                table: "field_battle_reports",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SideBReadAt",
                table: "field_battle_reports",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ReadAt",
                table: "camp_reports",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AttackerReadAt",
                table: "battle_reports",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DefenderReadAt",
                table: "battle_reports",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ReadAt",
                table: "army_reports",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AcceptorReadAt",
                table: "trade_reports");

            migrationBuilder.DropColumn(
                name: "PosterReadAt",
                table: "trade_reports");

            migrationBuilder.DropColumn(
                name: "SideAReadAt",
                table: "field_battle_reports");

            migrationBuilder.DropColumn(
                name: "SideBReadAt",
                table: "field_battle_reports");

            migrationBuilder.DropColumn(
                name: "ReadAt",
                table: "camp_reports");

            migrationBuilder.DropColumn(
                name: "AttackerReadAt",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "DefenderReadAt",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "ReadAt",
                table: "army_reports");
        }
    }
}
