// src/fee.ts

/**
 * FEE_BPS is imported from config.ts
 * BPS = Basis Points
 * 1%  = 100 BPS
 * 0.5% = 50 BPS (example)
 *
 * This value is the single source of truth for protocol fee.
 */
import { FEE_BPS } from "./config";

export function applyFee(amountInSmallest: bigint) {
  const fee = (amountInSmallest * BigInt(FEE_BPS)) / 10_000n;
  const net = amountInSmallest - fee;
  return { net, fee };
}


/**
 * Result object returned by applyProtocolFeeSmallest.
 *
 * net:
 *   amount remaining after subtracting protocol fee
 *
 * fee:
 *   protocol fee deducted from the original amount
 */
export type ProtocolFeeResult = {
  net: bigint;
  fee: bigint;
};

/**
 * Apply protocol fee using basis points (BPS).
 *
 * amountIn:
 *   Must be in smallest units (e.g. wei, lamports, token decimals)
 *
 * Calculation:
 *   fee = (amountIn * FEE_BPS) / 10,000
 *   net = amountIn - fee
 *
 * Example:
 *   FEE_BPS = 50 → 0.5%
 *   amountIn = 1000000n → fee = 5000n, net = 995000n
 */
export function applyProtocolFeeSmallest(amountIn: bigint): ProtocolFeeResult {
  if (amountIn < 0n) {
    throw new Error("amountIn must be non-negative");
  }

  // Convert BPS to percentage: divide by 10,000
  const fee = (amountIn * BigInt(FEE_BPS)) / 10_000n;

  // Amount the user gets after deducting fee
  const net = amountIn - fee;

  return { net, fee };
}
