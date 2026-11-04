using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class AddApiKeys : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "api_key_requests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Kind = table.Column<int>(type: "INTEGER", nullable: false),
                    Status = table.Column<int>(type: "INTEGER", nullable: false),
                    UserCode = table.Column<string>(type: "TEXT", maxLength: 9, nullable: false),
                    PollSecretHash = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Purpose = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    Description = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    ContextUrl = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    Features = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    AllWorlds = table.Column<bool>(type: "INTEGER", nullable: false),
                    WorldIds = table.Column<string>(type: "TEXT", nullable: false),
                    RequestsPerMinute = table.Column<int>(type: "INTEGER", nullable: false),
                    LifetimeMinutes = table.Column<int>(type: "INTEGER", nullable: false),
                    RequestedOwnerUserName = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    RenewsApiKeyId = table.Column<Guid>(type: "TEXT", nullable: true),
                    RequesterIp = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    RequesterUserAgent = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    DecidedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    DecidedByUserId = table.Column<Guid>(type: "TEXT", nullable: true),
                    ApiKeyId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CompletedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    OwnerUserId = table.Column<Guid>(type: "TEXT", nullable: true),
                    ApprovedFeatures = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    ApprovedAllWorlds = table.Column<bool>(type: "INTEGER", nullable: true),
                    ApprovedWorldIds = table.Column<string>(type: "TEXT", nullable: false),
                    ApprovedRequestsPerMinute = table.Column<int>(type: "INTEGER", nullable: true),
                    ApprovedLifetimeMinutes = table.Column<int>(type: "INTEGER", nullable: true),
                    AutoRenewUntil = table.Column<DateTimeOffset>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_api_key_requests", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "api_keys",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    KeyId = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    SecretHash = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    OwnerUserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Features = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    AllWorlds = table.Column<bool>(type: "INTEGER", nullable: false),
                    WorldIds = table.Column<string>(type: "TEXT", nullable: false),
                    RequestsPerMinute = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    LastUsedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    RevokedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    ReplacedByApiKeyId = table.Column<Guid>(type: "TEXT", nullable: true),
                    AutoRenewUntil = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    Purpose = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_api_keys", x => x.Id);
                    table.ForeignKey(
                        name: "FK_api_keys_users_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_api_keys_users_OwnerUserId",
                        column: x => x.OwnerUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_api_key_requests_Status",
                table: "api_key_requests",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_api_key_requests_UserCode",
                table: "api_key_requests",
                column: "UserCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_api_keys_CreatedByUserId",
                table: "api_keys",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_api_keys_KeyId",
                table: "api_keys",
                column: "KeyId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_api_keys_OwnerUserId",
                table: "api_keys",
                column: "OwnerUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "api_key_requests");

            migrationBuilder.DropTable(
                name: "api_keys");
        }
    }
}
