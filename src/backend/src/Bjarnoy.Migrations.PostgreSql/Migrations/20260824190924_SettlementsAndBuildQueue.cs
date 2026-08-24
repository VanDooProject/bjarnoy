using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class SettlementsAndBuildQueue : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "ClockOffsetTicks",
                table: "worlds",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<int>(
                name: "RunState",
                table: "worlds",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RunStateSince",
                table: "worlds",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.CreateTable(
                name: "settlements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorldId = table.Column<Guid>(type: "uuid", nullable: false),
                    IslandId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    OwnerName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CentreQ = table.Column<int>(type: "integer", nullable: false),
                    CentreR = table.Column<int>(type: "integer", nullable: false),
                    StockWood = table.Column<double>(type: "double precision", nullable: false),
                    StockStone = table.Column<double>(type: "double precision", nullable: false),
                    StockFood = table.Column<double>(type: "double precision", nullable: false),
                    StockIron = table.Column<double>(type: "double precision", nullable: false),
                    RateWood = table.Column<double>(type: "double precision", nullable: false),
                    RateStone = table.Column<double>(type: "double precision", nullable: false),
                    RateFood = table.Column<double>(type: "double precision", nullable: false),
                    RateIron = table.Column<double>(type: "double precision", nullable: false),
                    CapacityWood = table.Column<double>(type: "double precision", nullable: false),
                    CapacityStone = table.Column<double>(type: "double precision", nullable: false),
                    CapacityFood = table.Column<double>(type: "double precision", nullable: false),
                    CapacityIron = table.Column<double>(type: "double precision", nullable: false),
                    SettledAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    FoundedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_settlements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_settlements_islands_IslandId",
                        column: x => x.IslandId,
                        principalTable: "islands",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_settlements_worlds_WorldId",
                        column: x => x.WorldId,
                        principalTable: "worlds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "build_orders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SettlementId = table.Column<Guid>(type: "uuid", nullable: false),
                    Q = table.Column<int>(type: "integer", nullable: false),
                    R = table.Column<int>(type: "integer", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    TargetLevel = table.Column<int>(type: "integer", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletesAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_build_orders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_build_orders_settlements_SettlementId",
                        column: x => x.SettlementId,
                        principalTable: "settlements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "placed_buildings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SettlementId = table.Column<Guid>(type: "uuid", nullable: false),
                    Q = table.Column<int>(type: "integer", nullable: false),
                    R = table.Column<int>(type: "integer", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Level = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_placed_buildings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_placed_buildings_settlements_SettlementId",
                        column: x => x.SettlementId,
                        principalTable: "settlements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_build_orders_SettlementId_Q_R",
                table: "build_orders",
                columns: new[] { "SettlementId", "Q", "R" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_placed_buildings_SettlementId_Q_R",
                table: "placed_buildings",
                columns: new[] { "SettlementId", "Q", "R" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_settlements_IslandId",
                table: "settlements",
                column: "IslandId");

            migrationBuilder.CreateIndex(
                name: "IX_settlements_WorldId_CentreQ_CentreR",
                table: "settlements",
                columns: new[] { "WorldId", "CentreQ", "CentreR" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "build_orders");

            migrationBuilder.DropTable(
                name: "placed_buildings");

            migrationBuilder.DropTable(
                name: "settlements");

            migrationBuilder.DropColumn(
                name: "ClockOffsetTicks",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "RunState",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "RunStateSince",
                table: "worlds");
        }
    }
}
