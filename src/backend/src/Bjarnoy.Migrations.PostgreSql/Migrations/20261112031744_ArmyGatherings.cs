using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class ArmyGatherings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "GatherDepartAt",
                table: "armies",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "GatheringId",
                table: "armies",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "gatherings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SettlementId = table.Column<Guid>(type: "uuid", nullable: false),
                    HexQ = table.Column<int>(type: "integer", nullable: false),
                    HexR = table.Column<int>(type: "integer", nullable: false),
                    BoardingQ = table.Column<int>(type: "integer", nullable: true),
                    BoardingR = table.Column<int>(type: "integer", nullable: true),
                    DepartAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Mission = table.Column<int>(type: "integer", nullable: false),
                    TargetSettlementId = table.Column<Guid>(type: "uuid", nullable: true),
                    TargetBuildingQ = table.Column<int>(type: "integer", nullable: true),
                    TargetBuildingR = table.Column<int>(type: "integer", nullable: true),
                    TargetCampQ = table.Column<int>(type: "integer", nullable: true),
                    TargetCampR = table.Column<int>(type: "integer", nullable: true),
                    Stops = table.Column<string>(type: "text", nullable: false),
                    HomeSpotQ = table.Column<int>(type: "integer", nullable: false),
                    HomeSpotR = table.Column<int>(type: "integer", nullable: false),
                    ParentGatheringId = table.Column<Guid>(type: "uuid", nullable: true),
                    IsFleet = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
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
                name: "IX_gatherings_DepartAt",
                table: "gatherings",
                column: "DepartAt");

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
                name: "GatherDepartAt",
                table: "armies");

            migrationBuilder.DropColumn(
                name: "GatheringId",
                table: "armies");
        }
    }
}
