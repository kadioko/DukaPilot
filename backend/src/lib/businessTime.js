const TANZANIA_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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

function startOfTanzaniaWeek(date = new Date()) {
  const start = startOfTanzaniaDay(date);
  const weekday = new Date(start.getTime() + TANZANIA_OFFSET_MS).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return new Date(start.getTime() - daysSinceMonday * DAY_MS);
}

function lastSevenTanzaniaDays(date = new Date()) {
  const today = startOfTanzaniaDay(date);
  return Array.from({ length: 7 }, (_, index) => new Date(today.getTime() - (6 - index) * DAY_MS));
}

function addTanzaniaMonths(date, months) {
  const shifted = new Date(date.getTime() + TANZANIA_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + months, 1) - TANZANIA_OFFSET_MS);
}

module.exports = { startOfTanzaniaDay, startOfTanzaniaWeek, lastSevenTanzaniaDays, startOfTanzaniaMonth, addTanzaniaMonths, tanzaniaDateKey };
