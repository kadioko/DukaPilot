function occurredExpenseDateSql(alias = "e") {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error("Invalid SQL alias");
  return `(${alias}."dateReviewedAt" IS NOT NULL OR (NOT ${alias}."requiresDateReview" AND (${alias}."spentAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Dar_es_Salaam')::date <= (${alias}."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Dar_es_Salaam')::date))`;
}

function needsExpenseDateReviewSql(alias = "e") {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error("Invalid SQL alias");
  return `(${alias}."dateReviewedAt" IS NULL AND (${alias}."requiresDateReview" OR (${alias}."spentAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Dar_es_Salaam')::date > (${alias}."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Dar_es_Salaam')::date))`;
}

module.exports = { occurredExpenseDateSql, needsExpenseDateReviewSql };
