using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddArmies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "armies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SettlementId = table.Column<Guid>(type: "uuid", nullable: false),
                    Mission = table.Column<int>(type: "integer", nullable: false),
                    Provisions = table.Column<double>(type: "double precision", nullable: false),
                    AtHome = table.Column<bool>(type: "boolean", nullable: false),
                    DepartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Path = table.Column<string>(type: "text", nullable: false),
                    CumulativeHours = table.Column<string>(type: "text", nullable: false),
                    ReturnPath = table.Column<string>(type: "text", nullable: false),
                    ReturnCumulativeHours = table.Column<string>(type: "text", nullable: false),
                    TurnAroundAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    IsReturning = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_armies", x => x.Id);
                    table.ForeignKey(
                        name: "FK_armies_settlements_SettlementId",
                        column: x => x.SettlementId,
                        principalTable: "settlements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "army_unit_stacks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ArmyId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitType = table.Column<int>(type: "integer", nullable: false),
                    Count = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_army_unit_stacks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_army_unit_stacks_armies_ArmyId",
                        column: x => x.ArmyId,
                        principalTable: "armies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_armies_SettlementId",
                table: "armies",
                column: "SettlementId");

            migrationBuilder.CreateIndex(
                name: "IX_army_unit_stacks_ArmyId",
                table: "army_unit_stacks",
                column: "ArmyId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "army_unit_stacks");

            migrationBuilder.DropTable(
                name: "armies");
        }
    }
}
