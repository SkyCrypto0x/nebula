// src/mayan.ts

import { fetchQuote, type ChainName } from "@mayanfinance/swap-sdk";
import { FEE_BPS } from "./config";
import { applyFee } from "./fee";

/**
 * Token symbols supported by the app.
 * Keep this in sync with frontend + routes.ts.
 */
export type TokenSymbol = "USDC" | "USDT" | "ETH" | "SOL";

export type RouteType = "fastest" | "cheapest" | "safest";

export interface GetMayanQuoteParams {
  fromChain: ChainName;
  toChain: ChainName;
  tokenSymbol: TokenSymbol;      // source token
  toTokenSymbol?: TokenSymbol;   // optional dest token (defaults to same as source)
  amountHuman: number;           // human-readable (e.g. 100.5 USDC)
  routeType?: RouteType;
  slippageBps?: number;          // e.g. 50 -> 0.5%
  mevProtection?: boolean;       // reserved for future use
  refuelGas?: boolean;           // whether to enable gas drop / refuel

  // 🔥 আমাদের main param – সবসময় wallet address
  referrerWallet?: string;
}

export interface MayanQuoteResult {
  rawQuote: any;
  netAmountIn: string;  // smallest units (string)
  feeAmount: string;    // smallest units (string)
}

/**
 * Per-chain token config (address + decimals).
 * Partial<Record<ChainName,...>> যাতে SDK যত চেইনই জানুক, আমাদের
 * একটা subset define করলেই চলে।
 */
interface TokenConfig {
  address: string;
  decimals: number;
}

// NOTE: A few addresses are placeholders – verify on mainnet before prod.
const TOKEN_CONFIG: Partial<Record<ChainName, Record<TokenSymbol, TokenConfig>>> = {
  solana: {
    USDC: {
      address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // real Solana USDC
      decimals: 6,
    },
    USDT: {
      address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // real Solana USDT
      decimals: 6,
    },
    ETH: {
      address: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", // rarely used on Solana; placeholder
      decimals: 8,
    },
    SOL: {
      address: "So11111111111111111111111111111111111111112",
      decimals: 9,
    },
  },

  ethereum: {
    USDC: {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: 6,
    },
    USDT: {
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      decimals: 6,
    },
    ETH: {
      address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // native pseudo-address
      decimals: 18,
    },
    SOL: {
      address: "0xD31a59c85aE9D8edEFeC411D448f90841571b89c",
      decimals: 9,
    },
  },

  bsc: {
    USDC: {
      address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      decimals: 18, // USDC on BSC is 18 – verify on BscScan
    },
    USDT: {
      address: "0x55d398326f99059Ff775485246999027B3197955",
      decimals: 18,
    },
    ETH: {
      address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
      decimals: 18,
    },
    SOL: {
      address: "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF",
      decimals: 18,
    },
  },

  arbitrum: {
    USDC: {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      decimals: 6,
    },
    USDT: {
      address: "0xfd086bc7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      decimals: 6,
    },
    ETH: {
      address: "0x0000000000000000000000000000000000000000",
      decimals: 18,
    },
    SOL: {
      address: "",
      decimals: 9,
    },
  },

  base: {
    USDC: {
      address: "0x833589fCD6eDb6E08f4c7C32D4F71b54bdA02913",
      decimals: 6,
    },
    USDT: {
      address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
      decimals: 6,
    },
    ETH: {
      address: "0x0000000000000000000000000000000000000000",
      decimals: 18,
    },
    SOL: {
      address: "",
      decimals: 9,
    },
  },
};

function getTokenConfig(chain: ChainName, symbol: TokenSymbol): TokenConfig {
  const perChain = TOKEN_CONFIG[chain];
  if (!perChain) {
    throw new Error(`Unsupported chain for tokens: ${chain}`);
  }
  const cfg = perChain[symbol];
  if (!cfg) {
    throw new Error(`Unsupported token ${symbol} on chain ${chain}`);
  }
  return cfg;
}

/**
 * Convert human-readable amount -> smallest units (BigInt).
 * Example: 100.5 USDC (6 decimals) -> 100_500_000n
 */
function toSmallestUnits(amountHuman: number, decimals: number): bigint {
  if (!Number.isFinite(amountHuman) || amountHuman < 0) {
    throw new Error("Invalid amountHuman");
  }
  const factor = 10n ** BigInt(decimals); // 10^decimals as BigInt
  const scaled = BigInt(Math.round(amountHuman * Number(factor)));
  return scaled;
}

/**
 * MAIN: getMayanQuote
 *
 * - Uses Mayan SDK `fetchQuote`
 * - SDK (v12+) expects `amountIn64` as a string in smallest units.
 * - We also compute our protocol fee locally (using FEE_BPS) for UI.
 */
export async function getMayanQuote(
  params: GetMayanQuoteParams
): Promise<MayanQuoteResult> {
  const {
    fromChain,
    toChain,
    tokenSymbol,
    toTokenSymbol = tokenSymbol,
    amountHuman,
    routeType,
    slippageBps,
    mevProtection,
    refuelGas,
    referrerWallet,       // 👈 নতুন param
  } = params;

  const fromToken = getTokenConfig(fromChain, tokenSymbol);
  const toToken = getTokenConfig(toChain, toTokenSymbol);

  // 1) Human amount -> smallest units
  const amountInSmallest = toSmallestUnits(amountHuman, fromToken.decimals);
  const amountIn64 = amountInSmallest.toString(); // Mayan expects string

  // 2) Slippage: number | "auto"
  const slippageField: number | "auto" =
    typeof slippageBps === "number" && slippageBps > 0
      ? slippageBps
      : "auto";

  // 3) Gas drop / refuel (currently disabled)
  const gasDrop: number | undefined = undefined;

  // 4) MEV protection – reserved until SDK exposes dedicated flag
  const enableMevProtection = !!mevProtection;
  void enableMevProtection;
  void refuelGas;

  // 🔑 Effective referrer: wallet param > ENV > undefined
  const effectiveReferrer =
    referrerWallet || process.env.REFERRER_ADDRESS || undefined;

  // 5) Build quote params – use `any` to avoid fighting SDK typings
  const quoteParams: any = {
    fromChain,
    toChain,
    fromToken: fromToken.address,
    toToken: toToken.address,
    amountIn64,                 // 🔴 main change vs পুরনো code
    slippageBps: slippageField,
    gasDrop,
    referrer: effectiveReferrer,   // 👈 এখন সবসময় wallet/ENV থেকে
    referrerBps: FEE_BPS,          // ✅ 0.5% dev/referrer fee
    // mevProtection: enableMevProtection, // TODO when SDK supports
  };

  const mayanQuoteResponse: any = await fetchQuote(quoteParams);

  // --- নতুন ফিক্স: array / object দুই ফরম্যাটই handle করবো ---
  let quotes: any[] = [];

  if (Array.isArray(mayanQuoteResponse)) {
    // v12 SDK অনেক সময় সরাসরি array রিটার্ন করে
    quotes = mayanQuoteResponse;
  } else {
    if (Array.isArray(mayanQuoteResponse.quotes)) {
      quotes = mayanQuoteResponse.quotes;
    } else if (mayanQuoteResponse.bestQuote) {
      quotes = [mayanQuoteResponse.bestQuote];
    }
  }

  if (!quotes || quotes.length === 0) {
    throw new Error("No quotes returned from Mayan");
  }

  // 6) Route selection
  let selected: any = quotes[0];

  if (routeType === "cheapest") {
    selected = quotes.reduce((best, q) => {
      const bestFee = Number(best.totalFeeUsd ?? best.feeUsd ?? 0);
      const qFee = Number(q.totalFeeUsd ?? q.feeUsd ?? 0);
      return qFee < bestFee ? q : best;
    }, quotes[0]);
  } else if (routeType === "fastest") {
    selected = quotes.reduce((best, q) => {
      const bestTime = Number(best.estimatedTime ?? best.time ?? 0);
      const qTime = Number(q.estimatedTime ?? q.time ?? 0);
      return qTime < bestTime ? q : best;
    }, quotes[0]);
  } else if (routeType === "safest") {
    // For now just keep the default first route.
    selected = quotes[0];
  }

  // 7) Local protocol fee for UI (does not alter Mayan route)
  const { net, fee } = applyFee(amountInSmallest);

  return {
    rawQuote: selected,
    netAmountIn: net.toString(),
    feeAmount: fee.toString(),
  };
}
