-- Pair feedback with practice words per block (replaces separate feedback_items + practice_words).

ALTER TABLE "typing_coach_ai_outputs" ADD COLUMN "feedback_blocks" JSONB;

-- Legacy rows: single block with all feedback paragraphs + full practice word list.
UPDATE "typing_coach_ai_outputs" AS o
SET "feedback_blocks" = jsonb_build_array(
  jsonb_build_object(
    'feedback',
    COALESCE(
      (
        SELECT string_agg(value, E'\n\n')
        FROM jsonb_array_elements_text(COALESCE(o."feedback_items", '[]'::jsonb))
      ),
      ''
    ),
    'practice_words',
    COALESCE(o."practice_words", '[]'::jsonb)
  )
)
WHERE o."feedback_blocks" IS NULL;

UPDATE "typing_coach_ai_outputs"
SET "feedback_blocks" = '[]'::jsonb
WHERE "feedback_blocks" IS NULL;

ALTER TABLE "typing_coach_ai_outputs" ALTER COLUMN "feedback_blocks" SET NOT NULL;

ALTER TABLE "typing_coach_ai_outputs" DROP COLUMN "feedback_items";
ALTER TABLE "typing_coach_ai_outputs" DROP COLUMN "practice_words";
