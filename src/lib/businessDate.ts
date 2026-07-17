export function getSeoulTodayText(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const datePartMap = new Map(parts.map((part) => [part.type, part.value]));

  return `${datePartMap.get("year")}-${datePartMap.get("month")}-${datePartMap.get("day")}`;
}
