using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
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
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    UserCode = table.Column<string>(type: "character varying(9)", maxLength: 9, nullable: false),
                    PollSecretHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Purpose = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ContextUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Features = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    AllWorlds = table.Column<bool>(type: "boolean", nullable: false),
                    WorldIds = table.Column<string>(type: "text", nullable: false),
                    RequestsPerMinute = table.Column<int>(type: "integer", nullable: false),
                    LifetimeMinutes = table.Column<int>(type: "integer", nullable: false),
                    RequestedOwnerUserName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    RenewsApiKeyId = table.Column<Guid>(type: "uuid", nullable: true),
                    RequesterIp = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    RequesterUserAgent = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DecidedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DecidedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ApiKeyId = table.Column<Guid>(type: "uuid", nullable: true),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    OwnerUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ApprovedFeatures = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    ApprovedAllWorlds = table.Column<bool>(type: "boolean", nullable: true),
                    ApprovedWorldIds = table.Column<string>(type: "text", nullable: false),
                    ApprovedRequestsPerMinute = table.Column<int>(type: "integer", nullable: true),
                    ApprovedLifetimeMinutes = table.Column<int>(type: "integer", nullable: true),
                    AutoRenewUntil = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_api_key_requests", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "api_keys",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    KeyId = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    SecretHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    OwnerUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Features = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    AllWorlds = table.Column<bool>(type: "boolean", nullable: false),
                    WorldIds = table.Column<string>(type: "text", nullable: false),
                    RequestsPerMinute = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastUsedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RevokedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ReplacedByApiKeyId = table.Column<Guid>(type: "uuid", nullable: true),
                    AutoRenewUntil = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Purpose = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
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
