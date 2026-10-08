/**
 * Date display helpers. The whole app shows dates as `dd.mm.yyyy`, so the format lives here
 * instead of being repeated per screen.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;

/** `dd.mm.yyyy`. A date-only ISO string is read as a calendar date, so the day never shifts. */
export function formatDateRu(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const iso = value.match(ISO_DATE);
  if (iso) {
    return `${iso[3]}.${iso[2]}.${iso[1]}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

/** `dd.mm.yyyy HH:MM`. */
export function formatDateTimeRu(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  const time = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
  return `${formatDateRu(value)} ${time}`;
}
