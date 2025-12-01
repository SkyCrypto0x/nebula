// src/fee.ts

// 0.5% = 50 BPS
export const FEE_BPS = 50;

export type FeeResult = {
  userAmount: string;
  feeAmount: string;
};

export function applyFee(amountIn: string): FeeResult {
  const amt = Number(amountIn);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error("Invalid amountIn");
  }

  const fee = (amt * FEE_BPS) / 10000;
  const userAmt = amt - fee;

  return {
    userAmount: userAmt.toString(),
    feeAmount: fee.toString(),
  };
}
