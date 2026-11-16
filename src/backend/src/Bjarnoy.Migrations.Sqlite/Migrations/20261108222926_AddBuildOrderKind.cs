using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class AddBuildOrderKind : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Kind",
                table: "build_orders",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Kind",
                table: "build_orders");
        }
    }
}
