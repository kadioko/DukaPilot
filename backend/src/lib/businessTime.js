const TANZANIA_OFFSET_MS = 3 * 60 * 60 * 1000;

function shiftedParts(date = new Date()) {
  const shifted = new Date(date.getTime() + TANZANIA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

function tanzaniaDateKey(date = new Date()) {
  const { year, month, day } = shiftedParts(date);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function startOfTanzaniaDay(date = new Date()) {
  const { year, month, day } = shiftedParts(date);
  return new Date(Date.UTC(year, month, day) - TANZANIA_OFFSET_MS);
}

function startOfTanzaniaMonth(date = new Date()) {
  const { year, month } = shiftedParts(date);
  return new Date(Date.UTC(year, month, 1) - TANZANIA_OFFSET_MS);
}

module.exports = { startOfTanzaniaDay, startOfTanzaniaMonth, tanzaniaDateKey };
