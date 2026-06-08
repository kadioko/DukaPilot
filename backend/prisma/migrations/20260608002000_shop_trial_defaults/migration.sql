UPDATE "shops"
SET "trialEndsAt" = COALESCE("trialEndsAt", "createdAt" + INTERVAL '14 days')
WHERE "plan" = 'FREE_TRIAL'
  AND "subscriptionEndsAt" IS NULL
  AND "trialEndsAt" IS NULL;
