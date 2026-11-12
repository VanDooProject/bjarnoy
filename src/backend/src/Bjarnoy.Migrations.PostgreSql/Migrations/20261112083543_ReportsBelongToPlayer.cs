using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class ReportsBelongToPlayer : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_camp_reports_settlements_SettlementId",
                table: "camp_reports");

            migrationBuilder.DropForeignKey(
                name: "FK_trade_reports_trade_offers_OfferId",
                table: "trade_reports");

            migrationBuilder.DropIndex(
                name: "IX_camp_reports_SettlementId",
                table: "camp_reports");

            migrationBuilder.DropIndex(
                name: "IX_camp_reports_WorldId",
                table: "camp_reports");

            migrationBuilder.AddColumn<string>(
                name: "AcceptorOwnerId",
                table: "trade_reports",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "PosterOwnerId",
                table: "trade_reports",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "WorldId",
                table: "trade_reports",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<string>(
                name: "SideAOwnerId",
                table: "field_battle_reports",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SideBOwnerId",
                table: "field_battle_reports",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "WorldId",
                table: "field_battle_reports",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<string>(
                name: "OwnerId",
                table: "camp_reports",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AttackerOwnerId",
                table: "battle_reports",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DefenderOwnerId",
                table: "battle_reports",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "WorldId",
                table: "battle_reports",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.CreateIndex(
                name: "IX_trade_reports_WorldId_AcceptorOwnerId",
                table: "trade_reports",
                columns: new[] { "WorldId", "AcceptorOwnerId" });

            migrationBuilder.CreateIndex(
                name: "IX_trade_reports_WorldId_PosterOwnerId",
                table: "trade_reports",
                columns: new[] { "WorldId", "PosterOwnerId" });

            migrationBuilder.CreateIndex(
                name: "IX_field_battle_reports_WorldId_SideAOwnerId",
                table: "field_battle_reports",
                columns: new[] { "WorldId", "SideAOwnerId" });

            migrationBuilder.CreateIndex(
                name: "IX_field_battle_reports_WorldId_SideBOwnerId",
                table: "field_battle_reports",
                columns: new[] { "WorldId", "SideBOwnerId" });

            migrationBuilder.CreateIndex(
                name: "IX_camp_reports_WorldId_OwnerId",
                table: "camp_reports",
                columns: new[] { "WorldId", "OwnerId" });

            migrationBuilder.CreateIndex(
                name: "IX_battle_reports_WorldId_AttackerOwnerId",
                table: "battle_reports",
                columns: new[] { "WorldId", "AttackerOwnerId" });

            migrationBuilder.CreateIndex(
                name: "IX_battle_reports_WorldId_DefenderOwnerId",
                table: "battle_reports",
                columns: new[] { "WorldId", "DefenderOwnerId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_trade_reports_WorldId_AcceptorOwnerId",
                table: "trade_reports");

            migrationBuilder.DropIndex(
                name: "IX_trade_reports_WorldId_PosterOwnerId",
                table: "trade_reports");

            migrationBuilder.DropIndex(
                name: "IX_field_battle_reports_WorldId_SideAOwnerId",
                table: "field_battle_reports");

            migrationBuilder.DropIndex(
                name: "IX_field_battle_reports_WorldId_SideBOwnerId",
                table: "field_battle_reports");

            migrationBuilder.DropIndex(
                name: "IX_camp_reports_WorldId_OwnerId",
                table: "camp_reports");

            migrationBuilder.DropIndex(
                name: "IX_battle_reports_WorldId_AttackerOwnerId",
                table: "battle_reports");

            migrationBuilder.DropIndex(
                name: "IX_battle_reports_WorldId_DefenderOwnerId",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "AcceptorOwnerId",
                table: "trade_reports");

            migrationBuilder.DropColumn(
                name: "PosterOwnerId",
                table: "trade_reports");

            migrationBuilder.DropColumn(
                name: "WorldId",
                table: "trade_reports");

            migrationBuilder.DropColumn(
                name: "SideAOwnerId",
                table: "field_battle_reports");

            migrationBuilder.DropColumn(
                name: "SideBOwnerId",
                table: "field_battle_reports");

            migrationBuilder.DropColumn(
                name: "WorldId",
                table: "field_battle_reports");

            migrationBuilder.DropColumn(
                name: "OwnerId",
                table: "camp_reports");

            migrationBuilder.DropColumn(
                name: "AttackerOwnerId",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "DefenderOwnerId",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "WorldId",
                table: "battle_reports");

            migrationBuilder.CreateIndex(
                name: "IX_camp_reports_SettlementId",
                table: "camp_reports",
                column: "SettlementId");

            migrationBuilder.CreateIndex(
                name: "IX_camp_reports_WorldId",
                table: "camp_reports",
                column: "WorldId");

            migrationBuilder.AddForeignKey(
                name: "FK_camp_reports_settlements_SettlementId",
                table: "camp_reports",
                column: "SettlementId",
                principalTable: "settlements",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_trade_reports_trade_offers_OfferId",
                table: "trade_reports",
                column: "OfferId",
                principalTable: "trade_offers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
