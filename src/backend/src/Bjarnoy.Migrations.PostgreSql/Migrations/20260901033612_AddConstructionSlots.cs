using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddConstructionSlots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_build_orders_SettlementId_Q_R",
                table: "build_orders");

            migrationBuilder.AlterColumn<DateTimeOffset>(
                name: "StartedAt",
                table: "build_orders",
                type: "timestamp with time zone",
                nullable: true,
                oldClrType: typeof(DateTimeOffset),
                oldType: "timestamp with time zone");

            migrationBuilder.AlterColumn<DateTimeOffset>(
                name: "CompletesAt",
                table: "build_orders",
                type: "timestamp with time zone",
                nullable: true,
                oldClrType: typeof(DateTimeOffset),
                oldType: "timestamp with time zone");

            migrationBuilder.AddColumn<TimeSpan>(
                name: "BaseDuration",
                table: "build_orders",
                type: "interval",
                nullable: false,
                defaultValue: new TimeSpan(0, 0, 0, 0, 0));

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "QueuedAt",
                table: "build_orders",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            // Lossless backfill (issue #158): every existing row has already
            // started, so its exact StartedAt/CompletesAt is untouched —
            // QueuedAt is simply backdated to StartedAt, and BaseDuration is
            // derived by native interval subtraction (never read for these
            // rows, since they have all started). No un-scaling by
            // SpeedFactor, which would be wrong the moment a world had ever
            // been retuned.
            migrationBuilder.Sql(
                """
                UPDATE build_orders
                SET "QueuedAt" = "StartedAt",
                    "BaseDuration" = "CompletesAt" - "StartedAt"
                WHERE "StartedAt" IS NOT NULL AND "CompletesAt" IS NOT NULL;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_build_orders_SettlementId_Q_R_TargetLevel",
                table: "build_orders",
                columns: new[] { "SettlementId", "Q", "R", "TargetLevel" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_build_orders_SettlementId_Q_R_TargetLevel",
                table: "build_orders");

            migrationBuilder.DropColumn(
                name: "BaseDuration",
                table: "build_orders");

            migrationBuilder.DropColumn(
                name: "QueuedAt",
                table: "build_orders");

            migrationBuilder.AlterColumn<DateTimeOffset>(
                name: "StartedAt",
                table: "build_orders",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)),
                oldClrType: typeof(DateTimeOffset),
                oldType: "timestamp with time zone",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateTimeOffset>(
                name: "CompletesAt",
                table: "build_orders",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)),
                oldClrType: typeof(DateTimeOffset),
                oldType: "timestamp with time zone",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_build_orders_SettlementId_Q_R",
                table: "build_orders",
                columns: new[] { "SettlementId", "Q", "R" },
                unique: true);
        }
    }
}
