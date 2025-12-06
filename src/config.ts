//src/config.ts

import dotenv from "dotenv";
dotenv.config();

export const PORT = process.env.PORT!;
export const SOLANA_PROGRAM = process.env.SOLANA_PROGRAM!;
export const FORWARDER_ADDRESS = process.env.FORWARDER_ADDRESS!;
export const REFERRER_ADDRESS = process.env.REFERRER_ADDRESS!;
export const FEE_WALLET = process.env.FEE_WALLET!;

export const PRICE_API = "https://price-api.mayan.finance/v3/quote";
export const EXPLORER_API = "https://explorer-api.mayan.finance/v3";
