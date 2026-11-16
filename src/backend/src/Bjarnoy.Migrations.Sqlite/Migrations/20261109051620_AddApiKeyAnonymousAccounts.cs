using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class AddApiKeyAnonymousAccounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "OwnerCanAct",
                table: "api_keys",
                type: "INTEGER",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "ApprovedAnonymousAccounts",
                table: "api_key_requests",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "ApprovedOwnerCanAct",
                table: "api_key_requests",
                type: "INTEGER",
                nullable: false,
                defaultValue: true);

            migrationBuilder.CreateTable(
                name: "api_key_anonymous_accounts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ApiKeyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    OwnerId = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Label = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    IsPrimary = table.Column<bool>(type: "INTEGER", nullable: false),
                    SourceSettlementId = table.Column<Guid>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_api_key_anonymous_accounts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_api_key_anonymous_accounts_api_keys_ApiKeyId",
                        column: x => x.ApiKeyId,
                        principalTable: "api_keys",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_api_key_anonymous_accounts_ApiKeyId_Label",
                table: "api_key_anonymous_accounts",
                columns: new[] { "ApiKeyId", "Label" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "api_key_anonymous_accounts");

            migrationBuilder.DropColumn(
                name: "OwnerCanAct",
                table: "api_keys");

            migrationBuilder.DropColumn(
                name: "ApprovedAnonymousAccounts",
                table: "api_key_requests");

            migrationBuilder.DropColumn(
                name: "ApprovedOwnerCanAct",
                table: "api_key_requests");
        }
    }
}
