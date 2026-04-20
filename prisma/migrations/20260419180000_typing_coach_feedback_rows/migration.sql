-- One table row per weakness (replaces single-row typing_coach_ai_outputs).

CREATE TABLE IF NOT EXISTS "typing_coach_ai_feedback_items" (
    "id" SERIAL NOT NULL,
    "run_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "feedback_text" TEXT NOT NULL,
    "practice_words" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "typing_coach_ai_feedback_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "typing_coach_ai_feedback_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "typing_coach_ai_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "typing_coach_ai_feedback_items_run_id_sort_order_key" UNIQUE ("run_id", "sort_order")
);

CREATE INDEX IF NOT EXISTS "typing_coach_ai_feedback_items_run_id_idx" ON "typing_coach_ai_feedback_items"("run_id");
