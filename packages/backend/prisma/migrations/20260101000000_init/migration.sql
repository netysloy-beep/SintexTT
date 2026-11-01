-- Created by init migration
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "money" BIGINT NOT NULL DEFAULT 500000,
    "workers" INTEGER NOT NULL DEFAULT 4,
    "trucks" INTEGER NOT NULL DEFAULT 1,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lastDailyAt" TIMESTAMP(3),
    "referredBy" TEXT,
    "suspicion" INTEGER NOT NULL DEFAULT 0,
    "guildId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Player_telegramId_key" ON "Player"("telegramId");
CREATE INDEX "Player_guildId_idx" ON "Player"("guildId");

CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "qty" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Resource_playerId_kind_key" ON "Resource"("playerId", "kind");
CREATE INDEX "Resource_playerId_idx" ON "Resource"("playerId");

CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "assignedWorkers" INTEGER NOT NULL DEFAULT 0,
    "lastCollectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Building_playerId_idx" ON "Building"("playerId");

CREATE TABLE "PlayerTech" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "techId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerTech_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerTech_playerId_techId_key" ON "PlayerTech"("playerId", "techId");

CREATE TABLE "PlayerBooster" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "boosterId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerBooster_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlayerBooster_playerId_idx" ON "PlayerBooster"("playerId");

CREATE TABLE "MarketPrice" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketPrice_kind_key" ON "MarketPrice"("kind");

CREATE TABLE "PricePoint" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricePoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PricePoint_kind_recordedAt_idx" ON "PricePoint"("kind", "recordedAt");

CREATE TABLE "GameEvent" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GameEvent_playerId_resolved_idx" ON "GameEvent"("playerId", "resolved");

CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "qty" BIGINT NOT NULL,
    "reward" BIGINT NOT NULL,
    "penalty" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFERED',
    "deadline" TIMESTAMP(3) NOT NULL,
    "truckLocked" BOOLEAN NOT NULL DEFAULT false,
    "deliveredQty" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Contract_playerId_status_idx" ON "Contract"("playerId", "status");

CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Guild_name_key" ON "Guild"("name");

CREATE TABLE "GuildContract" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "qty" BIGINT NOT NULL,
    "deliveredQty" BIGINT NOT NULL DEFAULT 0,
    "reward" BIGINT NOT NULL,
    "contributions" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "deadline" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildContract_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GuildContract_guildId_status_idx" ON "GuildContract"("guildId", "status");

CREATE TABLE "AuctionLot" (
    "id" TEXT NOT NULL,
    "boosterId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "closeAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "winnerId" TEXT,
    "winnerBid" BIGINT,

    CONSTRAINT "AuctionLot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuctionLot_kind_key" ON "AuctionLot"("kind");

CREATE TABLE "AuctionBid" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "escrowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionBid_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuctionBid_lotId_amount_desc_idx" ON "AuctionBid"("lotId", "amount" DESC);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

CREATE TABLE "IdempotencyRecord" (
    "key" TEXT NOT NULL,
    "responseBody" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 200,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "JobLock" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLock_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Resource" ADD CONSTRAINT "Resource_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Building" ADD CONSTRAINT "Building_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerTech" ADD CONSTRAINT "PlayerTech_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerBooster" ADD CONSTRAINT "PlayerBooster_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuildContract" ADD CONSTRAINT "GuildContract_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "AuctionLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Player" ADD CONSTRAINT "Player_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE SET NULL ON UPDATE CASCADE;
