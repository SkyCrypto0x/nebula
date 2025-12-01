// src/mayan.ts

import {
  fetchQuote,
  type Quote,
  type ChainName,
} from "@mayanfinance/swap-sdk";

// Very small token map (ekhon sudhu USDC).
// Pore chai le aro token / chain add korle ekhanei add korbi.
const TOKEN_CONFIG: Record<
  string,
  {
    USDC?: { address: string; decimals: number };
  }
> = {
  solana: {
    USDC: {
      // Solana native USDC
      address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      decimals: 6,
    },
  },
  ethereum: {
    USDC: {
      // Ethereum USDC
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: 6,
    },
  },
  bsc: {
    USDC: {
      // BSC USDC
      address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      decimals: 18,
    },
  },
  arbitrum: {
    USDC: {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      decimals: 6,
    },
  },
  base: {
    USDC: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
    },
  },
};

export type MayanQuoteResult = {
  rawQuote: Quote;
  netAmountIn: string; // user input-er por 0.5% fee minus kore
  feeAmount: string;   // 0.5% fee in smallest units
};

function toSmallestUnits(amountHuman: number, decimals: number): bigint {
  // e.g. 90 USDC (dec 6) → 90 * 10^6
  const factor = BigInt(10) ** BigInt(decimals);
  const integerPart = BigInt(Math.floor(amountHuman));
  const frac = amountHuman - Math.floor(amountHuman);
  const fracUnits = BigInt(Math.round(frac * Number(factor)));
  return integerPart * factor + fracUnits;
}

export async function getMayanQuote(params: {
  fromChain: ChainName;
  toChain: ChainName;
  tokenSymbol: string; // e.g. "USDC"
  amountHuman: number; // e.g. 90 (normal units)
  referrer?: string;
}): Promise<MayanQuoteResult> {
  const { fromChain, toChain, tokenSymbol, amountHuman, referrer } = params;

  const fromTokenCfg = TOKEN_CONFIG[fromChain]?.[
    tokenSymbol as "USDC"
  ];
  const toTokenCfg = TOKEN_CONFIG[toChain]?.[tokenSymbol as "USDC"];

  if (!fromTokenCfg || !toTokenCfg) {
    throw new Error(
      `Unsupported token/chain combination: ${tokenSymbol} ${fromChain} → ${toChain}`
    );
  }

  const amountIn64 = toSmallestUnits(
    amountHuman,
    fromTokenCfg.decimals
  ).toString(); // smallest units string

  try {
    const quotes = await fetchQuote({
      amountIn64,
      fromToken: fromTokenCfg.address,
      toToken: toTokenCfg.address,
      fromChain,
      toChain,
      slippageBps: "auto",
      gasDrop: 0,
      referrer,
      // Docs: 1 bps = 0.01% → 50 bps = 0.5%
      referrerBps: 50,
    });

    if (!quotes || !quotes.length) {
      throw new Error("No quote returned from Mayan");
    }

    const best = quotes[0];

    // Amader nijer 0.5% protocol fee (UI te hidden),
    // user input amount thekei minus kore dekhacchi.
    const amountInBig = BigInt(amountIn64);
    const fee = (amountInBig * BigInt(5)) / BigInt(1000); // 0.5%
    const net = amountInBig - fee;

    return {
      rawQuote: best,
      netAmountIn: net.toString(),
      feeAmount: fee.toString(),
    };
  } catch (err: any) {
    console.error("Mayan fetchQuote error:", err?.response?.data || err);
    throw new Error(
      `Mayan quote failed upstream: ${
        err?.response?.data?.message || err?.message || "unknown"
      }`
    );
  }
}
