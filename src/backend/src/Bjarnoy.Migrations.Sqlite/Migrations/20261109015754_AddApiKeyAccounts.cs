using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class AddApiKeyAccounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ApprovedAdditionalUserIds",
                table: "api_key_requests",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "RequestedAdditionalUserNames",
                table: "api_key_requests",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "api_key_accounts",
                columns: table => new
                {
                    ApiKeyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_api_key_accounts", x => new { x.ApiKeyId, x.UserId });
                    table.ForeignKey(
                        name: "FK_api_key_accounts_api_keys_ApiKeyId",
                        column: x => x.ApiKeyId,
                        principalTable: "api_keys",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_api_key_accounts_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_api_key_accounts_UserId",
                table: "api_key_accounts",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "api_key_accounts");

            migrationBuilder.DropColumn(
                name: "ApprovedAdditionalUserIds",
                table: "api_key_requests");

            migrationBuilder.DropColumn(
                name: "RequestedAdditionalUserNames",
                table: "api_key_requests");
        }
    }
}
