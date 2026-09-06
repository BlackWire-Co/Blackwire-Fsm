import { prisma } from "./prisma";
import { JobStatus } from "@prisma/client";

// --- Settings singleton (same pattern as lib/settings.ts) ---

export async function ensureBookingSettings() {
  const existing = await prisma.bookingSettings.findUnique({ where: { id: "singleton" } });
  if (existing) return existing;
  return prisma.bookingSettings.create({ data: { id: "singleton" } });
}

export async function getBookingSettings() {
  const settings = await prisma.bookingSettings.findUnique({ where: { id: "singleton" } });
  if (settings) return settings;
  return ensureBookingSettings();
}

// --- Timezone helpers ---
// All availability math happens in the shop's single business timezone
// (BookingSettings.timezone). These use Intl.DateTimeFormat instead of a
// date library so no new dependency is needed - there's one timezone for
// the whole business, not per-user zones to juggle.

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
  return (asUTC - date.getTime()) / 60000;
}

// Converts a wall-clock time (year/month/day/hour/minute, business timezone)
// into the actual UTC instant it represents.
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 2; i++) {
    const offset = getTimeZoneOffsetMinutes(new Date(guess), timeZone);
    guess = Date.UTC(year, month - 1, day, hour, minute, 0) - offset * 60000;
  }
  return new Date(guess);
}

function zonedMinutesSinceMidnight(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return (+map.hour) * 60 + (+map.minute);
}

function zonedYMD(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return { year: +map.year, month: +map.month, day: +map.day };
}

export function zonedYMDString(date: Date, timeZone: string): string {
  const { year, month, day } = zonedYMD(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type MinuteRange = [number, number];

function subtractRange(ranges: MinuteRange[], cut: MinuteRange): MinuteRange[] {
  const out: MinuteRange[] = [];
  for (const [s, e] of ranges) {
    if (cut[1] <= s || cut[0] >= e) {
      out.push([s, e]);
      continue;
    }
    if (cut[0] > s) out.push([s, cut[0]]);
    if (cut[1] < e) out.push([cut[1], e]);
  }
  return out;
}

interface BookingSettingsLike {
  timezone: string;
  bufferMin: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  slotIntervalMin: number;
}

interface ServiceLike {
  durationMin: number;
}

/**
 * Computes bookable start times for one provider, on one calendar day (in
 * the business timezone), for a given service. Free time = the provider's
 * weekly availability, minus recurring breaks, minus one-off blocks (their
 * own or company-wide), minus any job already assigned to them (expanded by
 * the configured buffer on each side) - then sliced into slot-interval-
 * aligned starts wherever the service's duration fits.
 */
async function computeProviderSlots(
  provider: { id: string; userId: string },
  service: ServiceLike,
  dateStr: string,
  settings: BookingSettingsLike
): Promise<{ start: Date; end: Date; blocked: boolean }[]> {
  const tz = settings.timezone;
  const parts = dateStr.split("-").map(Number);
  const [y, m, d] = parts;
  if (!y || !m || !d) return [];

  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

  const [availability, breaks, blocks] = await Promise.all([
    prisma.bookingAvailability.findMany({ where: { providerId: provider.id, dayOfWeek } }),
    prisma.bookingBreak.findMany({ where: { providerId: provider.id, OR: [{ dayOfWeek }, { dayOfWeek: null }] } }),
    prisma.bookingBlock.findMany({ where: { OR: [{ providerId: provider.id }, { providerId: null }] } }),
  ]);

  if (availability.length === 0) return [];

  let windows: MinuteRange[] = availability.map((a) => [a.startMinute, a.endMinute]);
  for (const b of breaks) {
    windows = subtractRange(windows, [b.startMinute, b.endMinute]);
  }

  const dayStartUtc = zonedTimeToUtc(y, m, d, 0, 0, tz);
  const dayEndUtc = zonedTimeToUtc(y, m, d, 24, 0, tz);

  for (const blk of blocks) {
    if (blk.endAt <= dayStartUtc || blk.startAt >= dayEndUtc) continue;
    const clipStart = blk.startAt < dayStartUtc ? dayStartUtc : blk.startAt;
    const clipEnd = blk.endAt > dayEndUtc ? dayEndUtc : blk.endAt;
    const startMin = zonedMinutesSinceMidnight(clipStart, tz);
    const endMin = clipEnd.getTime() >= dayEndUtc.getTime() ? 24 * 60 : zonedMinutesSinceMidnight(clipEnd, tz);
    windows = subtractRange(windows, [startMin, endMin]);
  }

  // Jobs already assigned to this provider that fall on (or near) this day,
  // widened by a day on each side since a job's local day can spill across
  // the UTC window boundary near midnight.
  const jobs = await prisma.job.findMany({
    where: {
      status: { notIn: [JobStatus.CANCELLED] },
      technicians: { some: { userId: provider.userId } },
      OR: [
        { startTime: { gte: new Date(dayStartUtc.getTime() - 24 * 60 * 60000), lte: new Date(dayEndUtc.getTime() + 24 * 60 * 60000) } },
        { scheduledDate: { gte: new Date(dayStartUtc.getTime() - 24 * 60 * 60000), lte: new Date(dayEndUtc.getTime() + 24 * 60 * 60000) } },
      ],
    },
    select: { startTime: true, endTime: true, scheduledDate: true, estimatedDurationMin: true },
  });

  for (const j of jobs) {
    const jobStart = j.startTime || j.scheduledDate;
    if (!jobStart) continue;
    const jobEnd = j.endTime || new Date(jobStart.getTime() + (j.estimatedDurationMin || 60) * 60000);
    const bufferedStart = new Date(jobStart.getTime() - settings.bufferMin * 60000);
    const bufferedEnd = new Date(jobEnd.getTime() + settings.bufferMin * 60000);
    if (bufferedEnd <= dayStartUtc || bufferedStart >= dayEndUtc) continue;
    const clipStart = bufferedStart < dayStartUtc ? dayStartUtc : bufferedStart;
    const clipEnd = bufferedEnd > dayEndUtc ? dayEndUtc : bufferedEnd;
    const startMin = zonedMinutesSinceMidnight(clipStart, tz);
    const endMin = clipEnd.getTime() >= dayEndUtc.getTime() ? 24 * 60 : zonedMinutesSinceMidnight(clipEnd, tz);
    windows = subtractRange(windows, [startMin, endMin]);
  }

  const now = new Date();
  const earliestUtc = new Date(now.getTime() + settings.minNoticeHours * 60 * 60000);
  const latest = zonedYMD(new Date(now.getTime() + settings.maxAdvanceDays * 24 * 60 * 60000), tz);
  if (y > latest.year || (y === latest.year && (m > latest.month || (m === latest.month && d > latest.day)))) {
    return [];
  }

  // Candidates inside the minimum-notice window are still returned (tagged
  // "blocked") rather than dropped, so the booking page can show them
  // greyed-out/crossed-out instead of just vanishing - a customer should be
  // able to see "yeah, 2pm was open, it's just too soon to grab it now."
  // They're never actually bookable - the POST handler rejects a blocked
  // slot even if a client tries to submit it directly.
  const slots: { start: Date; end: Date; blocked: boolean }[] = [];
  for (const [s, e] of windows) {
    const firstAligned = Math.ceil(s / settings.slotIntervalMin) * settings.slotIntervalMin;
    for (let start = firstAligned; start + service.durationMin <= e; start += settings.slotIntervalMin) {
      const startUtc = zonedTimeToUtc(y, m, d, Math.floor(start / 60), start % 60, tz);
      slots.push({ start: startUtc, end: new Date(startUtc.getTime() + service.durationMin * 60000), blocked: startUtc < earliestUtc });
    }
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export interface MergedSlot {
  start: string;
  end: string;
  providerIds: string[];
  // True when this time is within the shop's configured minimum-notice
  // window - genuinely open time-wise, just not far enough out to book.
  // Same value for every provider, since minNoticeHours is one global
  // setting rather than per-provider.
  blocked: boolean;
}

/**
 * Public-facing slot lookup: either for one specific provider, or merged
 * across every active provider ("Any Available") so the customer sees one
 * combined list of times, with the eligible provider ids kept alongside
 * each slot so booking can pick one (re-validated for real at booking time).
 */
export async function getAvailableSlots(params: { serviceId: string; date: string; providerId?: string }) {
  const settings = await getBookingSettings();
  if (!settings.enabled) return { enabled: false, slots: [] as MergedSlot[] };

  const service = await prisma.bookingService.findUnique({ where: { id: params.serviceId } });
  if (!service || !service.active) return { enabled: true, slots: [] as MergedSlot[], error: "Service not found" };

  const providers = params.providerId
    ? await prisma.bookingProvider.findMany({ where: { id: params.providerId, active: true } })
    : await prisma.bookingProvider.findMany({ where: { active: true } });

  const byStart = new Map<string, MergedSlot>();
  for (const provider of providers) {
    const slots = await computeProviderSlots(provider, service, params.date, settings);
    for (const slot of slots) {
      const key = slot.start.toISOString();
      if (!byStart.has(key)) byStart.set(key, { start: key, end: slot.end.toISOString(), providerIds: [], blocked: slot.blocked });
      byStart.get(key)!.providerIds.push(provider.id);
    }
  }

  const merged = Array.from(byStart.values()).sort((a, b) => a.start.localeCompare(b.start));
  return { enabled: true, slots: merged };
}
