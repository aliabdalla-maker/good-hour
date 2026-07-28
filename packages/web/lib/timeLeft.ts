/**
 * Human countdown for an auction close.
 *
 * Lives here rather than in the auctions page because Next.js rejects any
 * named export from a route file — a page module may only export `default`
 * and its known config keys.
 */
export function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "closed";
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m left`;
  return `${Math.floor(h / 24)}d ${h % 24}h left`;
}
