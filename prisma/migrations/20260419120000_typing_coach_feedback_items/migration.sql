-- TypingCoachAiOutput: multiple feedback strings as JSON array (replaces single coaching_text).

ALTER TABLE "typing_coach_ai_outputs" ADD COLUMN "feedback_items" JSONB;

UPDATE "typing_coach_ai_outputs"
SET "feedback_items" = jsonb_build_array("coaching_text")
WHERE "coaching_text" IS NOT NULL;

UPDATE "typing_coach_ai_outputs"
SET "feedback_items" = '[]'::jsonb
WHERE "feedback_items" IS NULL;

ALTER TABLE "typing_coach_ai_outputs" ALTER COLUMN "feedback_items" SET NOT NULL;

ALTER TABLE "typing_coach_ai_outputs" DROP COLUMN "coaching_text";
