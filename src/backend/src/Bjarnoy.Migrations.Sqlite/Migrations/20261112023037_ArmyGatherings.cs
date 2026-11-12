using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class ArmyGatherings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "GatheringId",
                table: "armies",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "gatherings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SettlementId = table.Column<Guid>(type: "TEXT", nullable: false),
                    HexQ = table.Column<int>(type: "INTEGER", nullable: false),
                    HexR = table.Column<int>(type: "INTEGER", nullable: false),
                    DepartAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    Mission = table.Column<int>(type: "INTEGER", nullable: false),
                    TargetSettlementId = table.Column<Guid>(type: "TEXT", nullable: true),
                    TargetBuildingQ = table.Column<int>(type: "INTEGER", nullable: true),
                    TargetBuildingR = table.Column<int>(type: "INTEGER", nullable: true),
                    TargetCampQ = table.Column<int>(type: "INTEGER", nullable: true),
                    TargetCampR = table.Column<int>(type: "INTEGER", nullable: true),
                    Stops = table.Column<string>(type: "TEXT", nullable: false),
                    HomeSpotQ = table.Column<int>(type: "INTEGER", nullable: false),
                    HomeSpotR = table.Column<int>(type: "INTEGER", nullable: false),
                    ParentGatheringId = table.Column<Guid>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_gatherings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_gatherings_gatherings_ParentGatheringId",
                        column: x => x.ParentGatheringId,
                        principalTable: "gatherings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_gatherings_settlements_SettlementId",
                        column: x => x.SettlementId,
                        principalTable: "settlements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_armies_GatheringId",
                table: "armies",
                column: "GatheringId");

            migrationBuilder.CreateIndex(
                name: "IX_gatherings_ParentGatheringId",
                table: "gatherings",
                column: "ParentGatheringId");

            migrationBuilder.CreateIndex(
                name: "IX_gatherings_SettlementId",
                table: "gatherings",
                column: "SettlementId");

            migrationBuilder.AddForeignKey(
                name: "FK_armies_gatherings_GatheringId",
                table: "armies",
                column: "GatheringId",
                principalTable: "gatherings",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_armies_gatherings_GatheringId",
                table: "armies");

            migrationBuilder.DropTable(
                name: "gatherings");

            migrationBuilder.DropIndex(
                name: "IX_armies_GatheringId",
                table: "armies");

            migrationBuilder.DropColumn(
                name: "GatheringId",
                table: "armies");
        }
    }
}
