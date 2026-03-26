-- Rename WordMistake n-gram flags (rare -> focus)
ALTER TABLE "word_mistakes" RENAME COLUMN "contains_rare_bigram" TO "contains_focus_bigram";
ALTER TABLE "word_mistakes" RENAME COLUMN "contains_rare_trigram" TO "contains_focus_trigram";
