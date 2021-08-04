export interface IPortfolioSnapshot {
    [coin: string]: {
        quantity: number;
        price: number;
    }
}