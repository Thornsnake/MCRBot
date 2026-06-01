/**
 * Shared formatting helpers.
 */

/** Formats a number with thousands separators and fixed decimals. */
export function formatNumber(value: number, decimals = 2): string {
  if (!isFinite(value)) return "0";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Formats a quote-currency amount, e.g. formatQuote(12.5, "USD") -> "12.50 USD". */
export function formatQuote(value: number, quote: string, decimals = 2): string {
  return `${formatNumber(value, decimals)} ${quote}`;
}

/** Formats a percentage with a sign, e.g. +4.20%. */
export function formatSignedPct(value: number, decimals = 2): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, decimals)}%`;
}

/** Formats a millisecond epoch timestamp as a locale date-time string. */
export function formatTimestamp(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Compact "time ago" rendering for recent events / trades. */
export function timeAgo(ms: number): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
