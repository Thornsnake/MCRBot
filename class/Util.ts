/**
 * Shared helpers used across the bot.
 */

/**
 * Converts a number to a plain decimal string WITHOUT exponential notation.
 *
 * This matters for two reasons on the Crypto.com v1 API:
 *   1. The request signature is computed over the stringified params. If a tiny value like a tick
 *      size (e.g. 1e-8) were serialized as "1e-8", the signature would not match what the exchange
 *      computes from the JSON body, and the request would be rejected.
 *   2. Order amounts (notional/quantity) must be sent as well-formed decimals, never "1e-7".
 *
 * Normal numbers are returned as-is; only values that JavaScript would otherwise render in
 * exponential form are expanded.
 */
export function toPlainString(value: number): string {
    const str = String(value);

    if (!/e/i.test(str)) {
        return str;
    }

    // Exponential notation detected (very small/large value) — expand it.
    let fixed = value.toFixed(20);

    if (fixed.indexOf(".") !== -1) {
        fixed = fixed.replace(/0+$/, "").replace(/\.$/, "");
    }

    return fixed;
}

/**
 * Runs an async function, retrying it on failure with a linear backoff. Used to make the bot
 * resilient against transient network errors, request timeouts and HTTP 429/5xx responses from the
 * exchange and CoinGecko. Permanent client errors (most 4xx, e.g. 401 auth failure or 404 missing
 * pair) are NOT retried — retrying them would just waste time — so they are rethrown immediately.
 * The original error is rethrown once all attempts are exhausted, so callers keep their own
 * try/catch handling.
 */
export async function retry<T>(fn: () => Promise<T>, retries: number = 2, delayMs: number = 1000): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            const status = (err as any)?.response?.status;

            // Retry only on transient failures: no HTTP response at all (network error / timeout),
            // rate limiting (429) or server errors (5xx).
            const retriable = status === undefined || status === 429 || status >= 500;

            if (!retriable || attempt >= retries) {
                throw err;
            }

            await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
        }
    }

    // Unreachable, but satisfies the type checker.
    throw new Error("retry: exhausted without returning");
}
