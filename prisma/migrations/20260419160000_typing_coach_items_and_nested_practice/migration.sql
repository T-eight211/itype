-- feedback_items (string[]) + practice_words (string[][]), same index paired. Migrate from feedback_blocks.

ALTER TABLE "typing_coach_ai_outputs" ADD COLUMN "feedback_items" JSONB;
ALTER TABLE "typing_coach_ai_outputs" ADD COLUMN "practice_words" JSONB;

UPDATE "typing_coach_ai_outputs" AS o
SET
  "feedback_items" = COALESCE(
    (
      SELECT jsonb_agg(elem -> 'feedback' ORDER BY ord)
      FROM jsonb_array_elements(o."feedback_blocks") WITH ORDINALITY AS t(elem, ord)
    ),
    '[]'::jsonb
  ),
  "practice_words" = COALESCE(
    (
      SELECT jsonb_agg(elem -> 'practice_words' ORDER BY ord)
      FROM jsonb_array_elements(o."feedback_blocks") WITH ORDINALITY AS t(elem, ord)
    ),
    '[]'::jsonb
  )
WHERE o."feedback_blocks" IS NOT NULL;

UPDATE "typing_coach_ai_outputs"
SET
  "feedback_items" = '[]'::jsonb,
  "practice_words" = '[]'::jsonb
WHERE "feedback_items" IS NULL;

UPDATE "typing_coach_ai_outputs"
SET "practice_words" = '[]'::jsonb
WHERE "practice_words" IS NULL;

ALTER TABLE "typing_coach_ai_outputs" ALTER COLUMN "feedback_items" SET NOT NULL;
ALTER TABLE "typing_coach_ai_outputs" ALTER COLUMN "practice_words" SET NOT NULL;

ALTER TABLE "typing_coach_ai_outputs" DROP COLUMN "feedback_blocks";
