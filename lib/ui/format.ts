const dateTime = new Intl.DateTimeFormat("et-EE", { dateStyle: "medium", timeStyle: "short" });

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : dateTime.format(date);
}
