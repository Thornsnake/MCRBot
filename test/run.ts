/**
 * Unit tests for the pure calculation logic. These lock in the behaviour of the fixes for the open
 * GitHub issues (#13, #21, #23, #24) without needing the exchange or any network access.
 *
 * Run with:  npm test   (compiles via tsconfig.test.json, then runs this file with node)
 *
 * The tests mutate the shared CONFIG object before each assertion so they are fully deterministic
 * regardless of what is in the user's config.ts.
 */
import assert from "assert";
import { CONFIG } from "../config.js";
import { Calculation } from "../class/Calculation.js";
import { IBook } from "../interface/IBook.js";
import { IInstrument } from "../interface/IInstrument.js";
import { IDistributionDelta } from "../interface/IDistributionDelta.js";

const calc = new Calculation();

let failures = 0;

function test(name: string, fn: () => void) {
    try {
        fn();
        console.log(`  PASS  ${name}`);
    }
    catch (err) {
        failures++;
        console.error(`  FAIL  ${name}`);
        console.error(`        ${(err as Error).message}`);
    }
}

function approx(actual: number, expected: number, message: string) {
    assert.ok(Math.abs(actual - expected) < 1e-9, `${message} (got ${actual}, expected ${expected})`);
}

function instrument(overrides: Partial<IInstrument> = {}): IInstrument {
    return {
        instrument_name: "A_USD",
        base_currency: "A",
        quote_currency: "USD",
        price_decimals: 5,
        quantity_decimals: 1,
        price_tick_size: "0.00001",
        quantity_tick_size: "0.1",
        tradable: true,
        ...overrides
    };
}

function delta(name: string, percentage: number, deviation: number): IDistributionDelta {
    return { name, percentage, deviation, target: 0 };
}

function resetConfig() {
    CONFIG.QUOTE = "USD";
    CONFIG.INVESTMENT = 25;
    CONFIG.WEIGHT = {} as any;
    CONFIG.EXCLUDE = [];
    CONFIG.INCLUDE = [];
    CONFIG.TOP = 50;
}

console.log("Calculation unit tests\n");

/* -------------------------------------------------------------------------- */
/* #21 — weight-aware reinvestment                                            */
/* -------------------------------------------------------------------------- */

test("getReinvestTarget with no weights is an equal split (regression lock for #21)", () => {
    resetConfig();
    const coins = ["A", "B", "C", "D"];
    approx(calc.getReinvestTarget(coins, "A", 100), 25, "equal split");
    approx(calc.getReinvestTarget(coins, "D", 100), 25, "equal split");
});

test("getReinvestTarget honours WEIGHT (#21)", () => {
    resetConfig();
    CONFIG.WEIGHT = { BTC: 40 } as any;
    const coins = ["BTC", "A", "B", "C"];
    approx(calc.getReinvestTarget(coins, "BTC", 100), 40, "weighted coin");
    // Remaining 60% split over the 3 unweighted coins -> 20 each.
    approx(calc.getReinvestTarget(coins, "A", 100), 20, "unweighted share");
});

test("getReinvestTarget WEIGHT lookup is case-insensitive (casing fix)", () => {
    resetConfig();
    CONFIG.WEIGHT = { btc: 40 } as any;
    const coins = ["BTC", "A", "B"];
    approx(calc.getReinvestTarget(coins, "BTC", 90), 36, "weighted coin lowercase key");
    approx(calc.getReinvestTarget(coins, "A", 90), 27, "unweighted share with lowercase weight key");
});

test("getReinvestTarget guards against divide-by-zero", () => {
    resetConfig();
    CONFIG.WEIGHT = { A: 50 } as any;
    // "B" has no weight and there are no unweighted coins in the set -> 0, not NaN/Infinity.
    const result = calc.getReinvestTarget(["A"], "B", 100);
    assert.ok(Number.isFinite(result), "result is finite");
    approx(result, 0, "no unweighted coins");
});

test("getCoinInvestmentTarget scales CONFIG.INVESTMENT", () => {
    resetConfig();
    CONFIG.INVESTMENT = 25;
    approx(calc.getCoinInvestmentTarget(["A", "B"], "A"), 12.5, "investment split");
});

/* -------------------------------------------------------------------------- */
/* #13 / #23 — removal-list coins must never be a buy target                  */
/* -------------------------------------------------------------------------- */

test("getLowestPerformer skips ignored (removal-list) coins (#13/#23)", () => {
    resetConfig();
    const distributionDelta = [
        delta("LUNA2", -90, -120),   // phantom under-performer (removal coin, ~0 balance)
        delta("BTC", -5, -3),
        delta("ETH", 10, 6)
    ];
    // With LUNA2 ignored (because it is not buyable), the lowest performer must be BTC, never LUNA2.
    const lowest = calc.getLowestPerformer(distributionDelta, ["LUNA2"]);
    assert.strictEqual(lowest.name, "BTC", "LUNA2 must not be selected as a buy target");
});

/* -------------------------------------------------------------------------- */
/* #24 — cost-basis cap                                                        */
/* -------------------------------------------------------------------------- */

test("cappedInvestment never grows the basis by more than CONFIG.INVESTMENT (#24)", () => {
    resetConfig();
    CONFIG.INVESTMENT = 25;
    // Churn made totalInvested 130, but the basis should only grow by the intended 25.
    approx(calc.cappedInvestment(1000, 130), 1025, "capped at CONFIG.INVESTMENT");
    // A smaller-than-configured genuine investment is counted in full.
    approx(calc.cappedInvestment(1000, 10), 1010, "below cap counted in full");
});

/* -------------------------------------------------------------------------- */
/* Numeric order-book math (v1 returns string arrays -> parsed to numbers)     */
/* -------------------------------------------------------------------------- */

test("getOrderBookBidWorth walks the book with numeric levels", () => {
    resetConfig();
    const book: IBook = { i: "A_USD", bids: [[100, 2], [99, 5]], asks: [], t: 0 };
    // Selling 3 units: 2 @ 100 + 1 @ 99 = 299.
    approx(calc.getOrderBookBidWorth(3, book), 299, "bid worth across two levels");
});

test("fixNotional / fixQuantity / minimumSellQuantity respect instrument precision", () => {
    resetConfig();
    const instr = instrument({ price_decimals: 5, quantity_decimals: 1 });
    approx(calc.fixNotional(instr, 0.123456), 0.12345, "notional floored to 5 decimals");
    approx(calc.fixQuantity(instr, 1.27), 1.2, "quantity floored to 1 decimal");
    approx(calc.minimumSellQuantity(instr), 0.1, "min sell quantity from decimals");
});

/* -------------------------------------------------------------------------- */
/* Numeric robustness against floating-point and malformed order-book data     */
/* -------------------------------------------------------------------------- */

test("fixNotional does not drop a whole tick on binary-float boundary values", () => {
    resetConfig();
    const instr = instrument({ price_decimals: 2 });
    // 0.29 * 100 = 28.999999999999996 in IEEE-754 — must still round-trip to 0.29, not 0.28.
    approx(calc.fixNotional(instr, 0.29), 0.29, "0.29 stays 0.29");
    approx(calc.fixNotional(instr, 0.58), 0.58, "0.58 stays 0.58");
    // A genuine sub-tick remainder is still floored down.
    approx(calc.fixNotional(instr, 0.299), 0.29, "0.299 floors to 0.29");
});

test("getOrderBookBidWorth skips malformed (NaN) levels instead of returning NaN", () => {
    resetConfig();
    const book: IBook = { i: "A_USD", bids: [[100, 2], [NaN, 5], [99, 5]], asks: [], t: 0 };
    // Selling 3 units: 2 @ 100 + 1 @ 99 = 299 — the NaN level is skipped, not poisoning the sum.
    approx(calc.getOrderBookBidWorth(3, book), 299, "NaN level skipped");
    assert.ok(Number.isFinite(calc.getOrderBookBidWorth(3, book)), "result is finite");
});

test("minimumBuyNotional falls back to the price-only minimum when asks are empty", () => {
    resetConfig();
    const instr = instrument({ price_decimals: 5, quantity_decimals: 1 });
    const book: IBook = { i: "A_USD", bids: [[100, 2]], asks: [], t: 0 };
    const expected = (1 / Math.pow(10, 5)) * 1.1;
    approx(calc.minimumBuyNotional(instr, book), expected, "empty asks -> price-only minimum");
    assert.ok(Number.isFinite(calc.minimumBuyNotional(instr, book)), "result is finite");
});

console.log("");

if (failures > 0) {
    console.error(`${failures} test(s) failed.`);
    process.exit(1);
}
else {
    console.log("All tests passed.");
}
