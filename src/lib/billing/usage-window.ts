function daysInMonthUtc(year: number, monthZeroBased: number) {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
}

function addMonthsPreserveUtc(date: Date, months: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();
  const ms = date.getUTCMilliseconds();

  const targetMonthRaw = month + months;
  const targetYear = year + Math.floor(targetMonthRaw / 12);
  const targetMonth = ((targetMonthRaw % 12) + 12) % 12;
  const maxDay = daysInMonthUtc(targetYear, targetMonth);
  const clampedDay = Math.min(day, maxDay);

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      clampedDay,
      hour,
      minute,
      second,
      ms
    )
  );
}

export function toDayStringUTC(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getMonthlyUsageWindow(anchorStart: Date, now = new Date()) {
  let start = new Date(anchorStart.getTime());
  if (Number.isNaN(start.getTime())) {
    throw new Error("invalid anchorStart");
  }

  if (now < start) {
    while (now < start) {
      start = addMonthsPreserveUtc(start, -1);
    }
  } else {
    while (now >= addMonthsPreserveUtc(start, 1)) {
      start = addMonthsPreserveUtc(start, 1);
    }
  }

  const end = addMonthsPreserveUtc(start, 1);
  return { start, end };
}
