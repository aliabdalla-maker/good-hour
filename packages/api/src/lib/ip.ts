/**
 * True if the address is a loopback, link-local, or private-range IP (v4 or
 * v6). Used by the URL importer to refuse SSRF targets. Pure + dependency-free
 * so it can be unit-tested in isolation.
 */
export function isPrivateIp(ip: string): boolean {
  if (
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip === "0.0.0.0"
  ) {
    return true;
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fe80") || v6.startsWith("fc") || v6.startsWith("fd");
}
