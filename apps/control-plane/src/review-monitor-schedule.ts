import type { ReviewScheduleConfig } from "@frevos/contracts";

export type ReviewOccurrence = { key: string; at: string };
const minute = 60000;
const day = 86400000;
const formats = new Map<string, Intl.DateTimeFormat>();
function local(time: number, zone: string) {
  let format = formats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    if (formats.size > 100) formats.clear();
    formats.set(zone, format);
  }
  const parts = Object.fromEntries(
    format.formatToParts(time).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts["year"]}-${parts["month"]}-${parts["day"]}`,
    year: Number(parts["year"]),
    month: Number(parts["month"]),
    day: Number(parts["day"]),
    hour: Number(parts["hour"]),
    minute: Number(parts["minute"]),
  };
}
function slot(date: string, time: string, zone: string): number | null {
  const target = Date.parse(`${date}T${time}:00.000Z`),
    wanted = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const offsets = new Set<number>();
  for (let step = -36; step <= 36; step += 12) {
    const stamp = target + step * 3600000,
      parts = local(stamp, zone);
    offsets.add(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - stamp);
  }
  const matches = [...offsets]
    .map((offset) => target - offset)
    .filter((stamp) => {
      const parts = local(stamp, zone);
      return parts.date === date && parts.hour * 60 + parts.minute === wanted;
    });
  if (matches.length) return Math.min(...matches); // repeated DST wall times have one occurrence key.
  // A spring-forward gap runs at its first available later wall minute that day.
  let next: { wall: number; stamp: number } | null = null;
  for (let stamp = target - 15 * 3600000; stamp <= target + 15 * 3600000; stamp += minute) {
    const parts = local(stamp, zone),
      wall = parts.hour * 60 + parts.minute;
    if (
      parts.date === date &&
      wall >= wanted &&
      (!next || wall < next.wall || (wall === next.wall && stamp < next.stamp))
    )
      next = { wall, stamp };
  }
  return next?.stamp ?? null;
}
function occurrences(schedule: ReviewScheduleConfig, at: string) {
  if (!schedule.enabled || !schedule.weekdays.length) return [];
  const date = local(Date.parse(at), schedule.timeZone).date,
    base = Date.parse(`${date}T00:00:00.000Z`),
    result: ReviewOccurrence[] = [];
  for (let offset = -7; offset <= 8; offset++) {
    const calendar = new Date(base + offset * day),
      weekday = calendar.getUTCDay() || 7;
    if (!schedule.weekdays.includes(weekday)) continue;
    const date = calendar.toISOString().slice(0, 10),
      stamp = slot(date, schedule.time, schedule.timeZone);
    if (stamp !== null)
      result.push({
        key: `${date}T${schedule.time}[${schedule.timeZone}]`,
        at: new Date(stamp).toISOString(),
      });
  }
  return result;
}
export function nextReviewOccurrence(
  schedule: ReviewScheduleConfig,
  at: string,
): ReviewOccurrence | null {
  return (
    occurrences(schedule, at)
      .filter((slot) => Date.parse(slot.at) > Date.parse(at))
      .sort((a, b) => a.at.localeCompare(b.at))[0] ?? null
  );
}
export function latestReviewOccurrence(
  schedule: ReviewScheduleConfig,
  at: string,
  configuredAt: string,
): ReviewOccurrence | null {
  const floor = Math.max(Date.parse(configuredAt), Date.parse(at) - 7 * day);
  return (
    occurrences(schedule, at)
      .filter((slot) => Date.parse(slot.at) <= Date.parse(at) && Date.parse(slot.at) >= floor)
      .sort((a, b) => b.at.localeCompare(a.at))[0] ?? null
  );
}
