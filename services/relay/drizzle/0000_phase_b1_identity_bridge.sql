ALTER TABLE "users" ADD COLUMN "legacy_web_user_id" text;
CREATE UNIQUE INDEX "users_legacy_web_user_id_idx"
  ON "users" ("legacy_web_user_id")
  WHERE "users"."legacy_web_user_id" IS NOT NULL;
