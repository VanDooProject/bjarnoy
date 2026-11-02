using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class AddWorldHidden : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "Hidden",
                table: "worlds",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Hidden",
                table: "worlds");
        }
    }
}
