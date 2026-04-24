CREATE TABLE "user_badges" (
  "id"               SERIAL           PRIMARY KEY,
  "user_id"          TEXT             NOT NULL,
  "badge_key"        TEXT             NOT NULL,
  "unlocked_at"      TIMESTAMPTZ(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source_result_id" INTEGER,
  "metadata"         JSONB
);

CREATE UNIQUE INDEX "user_badges_user_id_badge_key_key" ON "user_badges" ("user_id", "badge_key");
CREATE INDEX "user_badges_user_id_idx" ON "user_badges" ("user_id");
CREATE INDEX "user_badges_user_id_unlocked_at_idx" ON "user_badges" ("user_id", "unlocked_at");

ALTER TABLE "user_badges"
  ADD CONSTRAINT "user_badges_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users" ("user_id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "user_badges"
  ADD CONSTRAINT "user_badges_source_result_id_fkey"
    FOREIGN KEY ("source_result_id")
    REFERENCES "typing_results" ("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
