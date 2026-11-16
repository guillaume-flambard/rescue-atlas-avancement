// Dates en français, à l'heure de Paris.
const TZ = "Europe/Paris";
const fmt = (d: Date | string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, ...o }).format(new Date(d));

export const dayLong = (d: Date | string) => fmt(d, { weekday: "long", day: "numeric", month: "long" });
export const dayShort = (d: Date | string) => fmt(d, { day: "numeric", month: "short" });
export const dayTiny = (d: Date | string) => fmt(d, { weekday: "short", day: "numeric", month: "short" });
export const hour = (d: Date | string) => fmt(d, { hour: "2-digit", minute: "2-digit" }).replace(":", " h ");
export const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
