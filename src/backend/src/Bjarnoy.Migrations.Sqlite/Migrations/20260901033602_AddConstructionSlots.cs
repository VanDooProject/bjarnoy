using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.Sqlite.Migrations
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
                type: "TEXT",
                nullable: true,
                oldClrType: typeof(DateTimeOffset),
                oldType: "TEXT");

            migrationBuilder.AlterColumn<DateTimeOffset>(
                name: "CompletesAt",
                table: "build_orders",
                type: "TEXT",
                nullable: true,
                oldClrType: typeof(DateTimeOffset),
                oldType: "TEXT");

            migrationBuilder.AddColumn<TimeSpan>(
                name: "BaseDuration",
                table: "build_orders",
                type: "TEXT",
                nullable: false,
                defaultValue: new TimeSpan(0, 0, 0, 0, 0));

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "QueuedAt",
                table: "build_orders",
                type: "TEXT",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            // Lossless backfill (issue #158): every existing row has already
            // started, so its exact StartedAt/CompletesAt is untouched —
            // QueuedAt is simply backdated to StartedAt (the real order time
            // predates this column and is not recoverable, but nothing reads
            // QueuedAt for an already-started order anyway), and BaseDuration
            // is derived from the two timestamps this row already has. No
            // un-scaling by SpeedFactor, which would be wrong the moment a
            // world had ever been retuned. substr(...,1,19) trims to
            // "yyyy-MM-dd HH:mm:ss" (EF's Sqlite DateTimeOffset text format)
            // so julianday can parse it; sub-second precision is not needed
            // for a build duration.
            migrationBuilder.Sql(
                """
                UPDATE build_orders
                SET
                    QueuedAt = StartedAt,
                    BaseDuration = printf('%02d:%02d:%02d',
                        CAST(ROUND((julianday(substr(CompletesAt, 1, 19)) - julianday(substr(StartedAt, 1, 19))) * 86400) AS INTEGER) / 3600,
                        (CAST(ROUND((julianday(substr(CompletesAt, 1, 19)) - julianday(substr(StartedAt, 1, 19))) * 86400) AS INTEGER) / 60) % 60,
                        CAST(ROUND((julianday(substr(CompletesAt, 1, 19)) - julianday(substr(StartedAt, 1, 19))) * 86400) AS INTEGER) % 60)
                WHERE StartedAt IS NOT NULL AND CompletesAt IS NOT NULL;
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
                type: "TEXT",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)),
                oldClrType: typeof(DateTimeOffset),
                oldType: "TEXT",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateTimeOffset>(
                name: "CompletesAt",
                table: "build_orders",
                type: "TEXT",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)),
                oldClrType: typeof(DateTimeOffset),
                oldType: "TEXT",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_build_orders_SettlementId_Q_R",
                table: "build_orders",
                columns: new[] { "SettlementId", "Q", "R" },
                unique: true);
        }
    }
}
