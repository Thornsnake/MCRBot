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

                if (!result || !data || !data.bids || !data.asks) {
                    continue;
                }

                books.push({
                    i: result.instrument_name,
                    /**
                     * v1 returns each price level as a 3-element string array
                     * ["price", "quantity", "num_orders"]. Convert to numbers so all downstream
                     * math keeps working on numeric values.
                     */
                    bids: data.bids.map((level: string[]) => level.map(Number)),
                    asks: data.asks.map((level: string[]) => level.map(Number)),
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
