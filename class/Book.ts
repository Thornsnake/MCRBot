import axios, { AxiosResponse } from "axios";
import { CONFIG } from "../config.js";
import { IBook } from "../interface/IBook.js";
import { retry } from "./Util.js";

export class Book {
    constructor() {}

    public async all(tradableCoins: string[]): Promise<IBook[] | null> {
        try {
            const bookPromises: Promise<AxiosResponse>[] = [];

            for (const coin of tradableCoins) {
                bookPromises.push(retry(() => axios.get(
                    `https://api.crypto.com/exchange/v1/public/get-book?instrument_name=${coin}_${CONFIG.QUOTE}&depth=50`,
                    { timeout: 30000 }
                )));
            }

            /**
             * Use allSettled so that a single failing book (e.g. a coin that lost its quote pair or
             * an illiquid instrument returning an error) does not abort the entire cycle. Every
             * consumer already guards against a missing book, so the affected coin is simply skipped.
             */
            const bookResponses = await Promise.allSettled(bookPromises);
            const books: IBook[] = [];

            for (const settled of bookResponses) {
                if (settled.status !== "fulfilled") {
                    continue;
                }

                const result = settled.value.data?.result;
                const data = result?.data?.[0];

                if (!result || !data || !Array.isArray(data.bids) || !Array.isArray(data.asks)) {
                    continue;
                }

                /**
                 * v1 returns each price level as a 3-element string array
                 * ["price", "quantity", "num_orders"]. Convert to numbers and drop any malformed
                 * level (wrong length, non-finite, non-positive price, or negative quantity) so a
                 * single bad field cannot poison the order-book math (NaN/Infinity) or be sent as an
                 * order amount.
                 */
                const sanitize = (levels: string[][]) =>
                    levels
                        .map((level) => level.map(Number))
                        .filter((level) => level.length >= 2
                            && Number.isFinite(level[0]) && level[0] > 0
                            && Number.isFinite(level[1]) && level[1] >= 0);

                const bids = sanitize(data.bids);
                const asks = sanitize(data.asks);

                /**
                 * Skip a book with no usable level on either side (illiquid / one-sided / empty).
                 * Every consumer already guards a missing book, so the affected coin is simply
                 * skipped — what the allSettled design intends. This also keeps the level-0 accesses
                 * (bids[0][0] / asks[0][0]) downstream from ever throwing or reading NaN.
                 */
                if (bids.length === 0 || asks.length === 0) {
                    continue;
                }

                books.push({
                    i: result.instrument_name,
                    bids: bids,
                    asks: asks,
                    t: data.t
                });
            }

            return books;
        }
        catch (err) {
            console.error(err);
        }

        return null;
    }
}
