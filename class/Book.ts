import axios, { AxiosResponse } from "axios";
import { CONFIG } from "../config.js";
import { IBook } from "../interface/IBook.js";

export class Book {
    constructor() {}

    public async all(tradableCoins: string[]): Promise<IBook[] | null> {
        try {
            const bookPromises: Promise<AxiosResponse>[] = [];

            for (const coin of tradableCoins) {
                bookPromises.push(axios.get(`https://api.crypto.com/v2/public/get-book?instrument_name=${coin}_${CONFIG.QUOTE}&depth=150`, {timeout: 30000}));
            }

            const bookResponses = await Promise.all(bookPromises);
            const books: IBook[] = null;

            for (const response of bookResponses) {
                books.push({
                    i: response.data.result.instrument_name,
                    ...response.data.result.data[0]
                });
            }

            return books;
        }
        catch(err) {
            console.error(err);
        }

        return null;
    }
}