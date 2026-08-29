using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddTrade : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "trade_offers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorldId = table.Column<Guid>(type: "uuid", nullable: false),
                    PosterSettlementId = table.Column<Guid>(type: "uuid", nullable: false),
                    OfferedResource = table.Column<int>(type: "integer", nullable: false),
                    OfferedAmount = table.Column<double>(type: "double precision", nullable: false),
                    RequestedResource = table.Column<int>(type: "integer", nullable: false),
                    RequestedAmount = table.Column<double>(type: "double precision", nullable: false),
                    GuildOnly = table.Column<bool>(type: "boolean", nullable: false),
                    PostedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    State = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_trade_offers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_trade_offers_settlements_PosterSettlementId",
                        column: x => x.PosterSettlementId,
                        principalTable: "settlements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "shipments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OfferId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromSettlementId = table.Column<Guid>(type: "uuid", nullable: false),
                    ToSettlementId = table.Column<Guid>(type: "uuid", nullable: false),
                    CargoResource = table.Column<int>(type: "integer", nullable: false),
                    CargoAmount = table.Column<double>(type: "double precision", nullable: false),
                    Carts = table.Column<int>(type: "integer", nullable: false),
                    FromQ = table.Column<int>(type: "integer", nullable: false),
                    FromR = table.Column<int>(type: "integer", nullable: false),
                    ToQ = table.Column<int>(type: "integer", nullable: false),
                    ToR = table.Column<int>(type: "integer", nullable: false),
                    DepartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ArrivesAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ReturnArrivesAtGameTime = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DeliveredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_shipments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_shipments_settlements_FromSettlementId",
                        column: x => x.FromSettlementId,
                        principalTable: "settlements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_shipments_settlements_ToSettlementId",
                        column: x => x.ToSettlementId,
                        principalTable: "settlements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_shipments_trade_offers_OfferId",
                        column: x => x.OfferId,
                        principalTable: "trade_offers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "trade_reports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OfferId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    PosterSettlementId = table.Column<Guid>(type: "uuid", nullable: false),
                    AcceptorSettlementId = table.Column<Guid>(type: "uuid", nullable: false),
                    OfferedResource = table.Column<int>(type: "integer", nullable: false),
                    OfferedAmount = table.Column<double>(type: "double precision", nullable: false),
                    RequestedResource = table.Column<int>(type: "integer", nullable: false),
                    RequestedAmount = table.Column<double>(type: "double precision", nullable: false),
                    GuildTrade = table.Column<bool>(type: "boolean", nullable: false),
                    TravelHours = table.Column<double>(type: "double precision", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_trade_reports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_trade_reports_trade_offers_OfferId",
                        column: x => x.OfferId,
                        principalTable: "trade_offers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_shipments_FromSettlementId",
                table: "shipments",
                column: "FromSettlementId");

            migrationBuilder.CreateIndex(
                name: "IX_shipments_OfferId",
                table: "shipments",
                column: "OfferId");

            migrationBuilder.CreateIndex(
                name: "IX_shipments_ToSettlementId_DeliveredAt_ArrivesAt",
                table: "shipments",
                columns: new[] { "ToSettlementId", "DeliveredAt", "ArrivesAt" });

            migrationBuilder.CreateIndex(
                name: "IX_trade_offers_PosterSettlementId",
                table: "trade_offers",
                column: "PosterSettlementId");

            migrationBuilder.CreateIndex(
                name: "IX_trade_offers_WorldId_State_ExpiresAt",
                table: "trade_offers",
                columns: new[] { "WorldId", "State", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_trade_reports_AcceptorSettlementId",
                table: "trade_reports",
                column: "AcceptorSettlementId");

            migrationBuilder.CreateIndex(
                name: "IX_trade_reports_OfferId",
                table: "trade_reports",
                column: "OfferId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_trade_reports_PosterSettlementId",
                table: "trade_reports",
                column: "PosterSettlementId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "trade_reports");

            migrationBuilder.DropTable(
                name: "shipments");

            migrationBuilder.DropTable(
                name: "trade_offers");
        }
    }
}
