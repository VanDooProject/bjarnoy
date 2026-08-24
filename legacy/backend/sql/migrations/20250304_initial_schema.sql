-- Create Users table
CREATE TABLE "Users" (
    "Id" BYTEA PRIMARY KEY,                    -- 16 byte UUID
    "Username" VARCHAR(100) UNIQUE NOT NULL,    
    "Email" VARCHAR(255) UNIQUE NOT NULL,
    "PasswordHash" VARCHAR(255) NOT NULL,       -- Bcrypt hash
    "CreatedAt" TIMESTAMP NOT NULL,
    "LastLoginAt" TIMESTAMP,
    "Status" INT NOT NULL DEFAULT 0,            -- 0: Active, 1: Inactive, 2: Banned
    "Roles" text[] NOT NULL DEFAULT '{}'       -- Array of role names
);

-- Create Worlds table
CREATE TABLE "Worlds" (
    "Id" BYTEA PRIMARY KEY,                    -- 16 byte UUID
    "Name" VARCHAR(100) NOT NULL,
    "Status" INT NOT NULL DEFAULT 0,           -- 0: Active, 1: Inactive, 2: Full
    "CreatedAt" TIMESTAMP NOT NULL,
    "MaxPlayers" INT NOT NULL
);

-- Create Players table with UserId
CREATE TABLE "Players" (
    "Id" BYTEA PRIMARY KEY,
    "Name" VARCHAR(100) NOT NULL,
    "UserId" BYTEA NOT NULL,
    "WorldId" BYTEA NOT NULL,
    CONSTRAINT "FK_Players_Users" FOREIGN KEY ("UserId") REFERENCES "Users"("Id"),
    CONSTRAINT "FK_Players_Worlds" FOREIGN KEY ("WorldId") REFERENCES "Worlds"("Id")
);

-- Create RefreshTokens table
CREATE TABLE "RefreshTokens" (
    "Id" BYTEA PRIMARY KEY,
    "UserId" BYTEA NOT NULL,
    "Token" VARCHAR(255) UNIQUE NOT NULL,
    "ExpiresAt" TIMESTAMP NOT NULL,
    "CreatedAt" TIMESTAMP NOT NULL,
    "RevokedAt" TIMESTAMP,
    CONSTRAINT "FK_RefreshTokens_Users" FOREIGN KEY ("UserId") REFERENCES "Users"("Id")
);

-- Create EmailVerifications table
CREATE TABLE "EmailVerifications" (
    "Id" BYTEA PRIMARY KEY,
    "UserId" BYTEA NOT NULL,
    "Email" VARCHAR(255) NOT NULL,
    "Token" VARCHAR(255) UNIQUE NOT NULL,
    "ExpiresAt" TIMESTAMP NOT NULL,
    "CreatedAt" TIMESTAMP NOT NULL,
    CONSTRAINT "FK_EmailVerifications_Users" FOREIGN KEY ("UserId") REFERENCES "Users"("Id")
);

-- Create indexes
CREATE INDEX "idx_players_userid" ON "Players"("UserId");
CREATE INDEX "idx_players_worldid" ON "Players"("WorldId");
CREATE INDEX "idx_refreshtokens_userid" ON "RefreshTokens"("UserId");
CREATE INDEX "idx_emailverifications_userid" ON "EmailVerifications"("UserId");
CREATE INDEX "idx_users_roles" ON "Users" USING GIN ("Roles");