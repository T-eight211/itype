CREATE TABLE "user_xp" (
  "id"                    SERIAL           PRIMARY KEY,
  "user_id"               TEXT             NOT NULL,
  "total_xp"              INTEGER          NOT NULL DEFAULT 0,
  "current_level"         INTEGER          NOT NULL DEFAULT 0,
  "current_streak_days"   INTEGER          NOT NULL DEFAULT 0,
  "max_streak_days"       INTEGER          NOT NULL DEFAULT 0,
  "last_streak_date"      DATE,
  "last_daily_bonus_date" DATE,
  "created_at"            TIMESTAMPTZ(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMPTZ(6)   NOT NULL
);

CREATE UNIQUE INDEX "user_xp_user_id_key" ON "user_xp" ("user_id");
CREATE INDEX "user_xp_user_id_idx" ON "user_xp" ("user_id");

ALTER TABLE "user_xp"
  ADD CONSTRAINT "user_xp_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users" ("user_id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
