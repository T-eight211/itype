INSERT INTO "typing_coach_ai_feedback_items" ("run_id", "sort_order", "feedback_text", "practice_words", "created_at")
SELECT
  o."run_id",
  (fi.n - 1)::integer,
  fi.fb,
  COALESCE(pw.elem, '[]'::jsonb),
  o."created_at"
FROM "typing_coach_ai_outputs" o
CROSS JOIN LATERAL jsonb_array_elements_text(o."feedback_items") WITH ORDINALITY AS fi(fb, n)
CROSS JOIN LATERAL jsonb_array_elements(o."practice_words") WITH ORDINALITY AS pw(elem, m)
WHERE fi.n = pw.m;
