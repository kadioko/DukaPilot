ALTER TABLE "expenses" ADD COLUMN "requiresDateReview" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the existing review queue while correcting the UTC timestamp interpretation.
SET TIME ZONE 'UTC';
UPDATE "expenses" AS e
SET "requiresDateReview" = true
WHERE e."dateReviewedAt" IS NULL
  AND e."spentAt" >= ((date_trunc('day', e."createdAt" AT TIME ZONE 'Africa/Dar_es_Salaam') + interval '1 day') AT TIME ZONE 'Africa/Dar_es_Salaam')
  AND (e."spentAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Dar_es_Salaam')::date <= (e."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Dar_es_Salaam')::date;
RESET TIME ZONE;
