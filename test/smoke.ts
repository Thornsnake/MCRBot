/**
 * Read-only smoke test against the live Crypto.com Exchange v1 PUBLIC endpoints. It performs no
 * authentication and places no orders — it only confirms that the endpoints, response envelopes and
 * field names/types the bot relies on are still correct.
 *
 * Run with:  npm run smoke
 */
import assert from "assert";
import axios from "axios";

async function main() {
    console.log("Crypto.com Exchange v1 public endpoint smoke test\n");

    /* get-instruments ------------------------------------------------------ */
    const instrumentsRes = await axios.get("https://api.crypto.com/exchange/v1/public/get-instruments", { timeout: 30000 });
    const data = instrumentsRes.data?.result?.data;

    assert.ok(Array.isArray(data) && data.length > 0, "get-instruments should return a result.data array");

    const spot = data.filter((i: any) => i.inst_type === "CCY_PAIR" && i.tradable);
    console.log(`  instruments: ${data.length} total, ${spot.length} tradable spot pairs (inst_type === "CCY_PAIR")`);
    assert.ok(spot.length > 0, "there should be tradable spot pairs");

    const sample = spot.find((i: any) => i.symbol === "BTC_USD") || spot[0];
    for (const field of ["symbol", "base_ccy", "quote_ccy", "quote_decimals", "quantity_decimals", "price_tick_size", "qty_tick_size", "tradable"]) {
        assert.ok(sample[field] !== undefined, `instrument field "${field}" should be present`);
    }
    console.log(`  sample spot pair: ${sample.symbol} (quote_decimals=${sample.quote_decimals}, qty_tick_size=${sample.qty_tick_size})`);

    /* get-book ------------------------------------------------------------- */
    const bookRes = await axios.get("https://api.crypto.com/exchange/v1/public/get-book?instrument_name=BTC_USD&depth=10", { timeout: 30000 });
    const bookData = bookRes.data?.result?.data?.[0];

    assert.ok(bookData && Array.isArray(bookData.bids) && bookData.bids.length > 0, "get-book should return bids");

    const level = bookData.bids[0];
    assert.ok(Array.isArray(level) && level.length === 3, "each book level should have 3 elements [price, quantity, num_orders]");
    assert.strictEqual(typeof level[0], "string", "book level elements should be strings (parsed with Number in Book.ts)");

    console.log(`  book BTC_USD top bid (raw): [${level.join(", ")}]`);
    console.log(`  parsed: price=${Number(level[0])}, quantity=${Number(level[1])}`);

    console.log("\nSmoke test passed — v1 public endpoints match what the bot expects.");
}

main().catch((err) => {
    console.error("Smoke test FAILED:", err.message);
    process.exit(1);
});
