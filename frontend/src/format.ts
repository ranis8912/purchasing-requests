// Display formatting. GES convention: timestamps in Pacific time as "2026-10-27 13:20 PT".

const PT = "America/Los_Angeles";

function parts(iso: string): Record<string, string> {
  // The API returns UTC; treat naive timestamps as UTC too.
  const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: PT, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  return Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
}

export function dateTimePT(iso: string | null | undefined): string {
  if (!iso) return "—";
  const p = parts(iso);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} PT`;
}

export function datePT(iso: string | null | undefined): string {
  if (!iso) return "—";
  const p = parts(iso);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Calendar dates (no time) are shown as-is. */
export const day = (d: string | null | undefined) => d || "—";

export function money(amount: number, currency = "USD", compact = false): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency, maximumFractionDigits: 0, notation: compact ? "compact" : "standard",
  }).format(amount);
}

export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(name: string): string {
  return name.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
}

export function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: PT, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** "YYYY-MM" in Pacific time, for monthly grouping. */
export function monthKeyPT(iso: string): string {
  const p = parts(iso);
  return `${p.year}-${p.month}`;
}
