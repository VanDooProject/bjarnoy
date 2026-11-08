using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddMovementEdgeHours : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "EdgeHours",
                table: "armies",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ReturnEdgeHours",
                table: "armies",
                type: "text",
                nullable: false,
                defaultValue: "");

            // Armies already on the road predate the edge schedule: give them each leg's midpoint as the edge time (the marker moves
            // at one even speed and the army changes hex halfway), the same split the client falls back to.
            foreach (var (edges, cumulative) in new[] { ("EdgeHours", "CumulativeHours"), ("ReturnEdgeHours", "ReturnCumulativeHours") })
            {
                migrationBuilder.Sql($"""
                    UPDATE armies SET "{edges}" = COALESCE((
                        SELECT string_agg(CASE WHEN t.ord = 1 THEN '0' ELSE ((t.prev + t.cur) / 2)::text END, ' ' ORDER BY t.ord)
                        FROM (
                            SELECT u.ord, u.cur::float8 AS cur, lag(u.cur::float8) OVER (ORDER BY u.ord) AS prev
                            FROM unnest(string_to_array(armies."{cumulative}", ' ')) WITH ORDINALITY AS u(cur, ord)
                        ) t), '')
                    WHERE "{cumulative}" <> '';
                    """);
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EdgeHours",
                table: "armies");

            migrationBuilder.DropColumn(
                name: "ReturnEdgeHours",
                table: "armies");
        }
    }
}
