ALTER TABLE "chats"
ADD COLUMN IF NOT EXISTS "private_pair_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "chats_private_pair_key_idx"
ON "chats" ("private_pair_key")
WHERE "private_pair_key" IS NOT NULL;
