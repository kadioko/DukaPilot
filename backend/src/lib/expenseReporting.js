function occurredExpenseDateSql(alias = "e") {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error("Invalid SQL alias");
  return `(${alias}."dateReviewedAt" IS NOT NULL OR ${alias}."spentAt" < ((date_trunc('day', ${alias}."createdAt" AT TIME ZONE 'Africa/Dar_es_Salaam') + interval '1 day') AT TIME ZONE 'Africa/Dar_es_Salaam'))`;
}

function needsExpenseDateReviewSql(alias = "e") {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error("Invalid SQL alias");
  return `(${alias}."dateReviewedAt" IS NULL AND ${alias}."spentAt" >= ((date_trunc('day', ${alias}."createdAt" AT TIME ZONE 'Africa/Dar_es_Salaam') + interval '1 day') AT TIME ZONE 'Africa/Dar_es_Salaam'))`;
}

module.exports = { occurredExpenseDateSql, needsExpenseDateReviewSql };
