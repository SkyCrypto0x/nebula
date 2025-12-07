// src/routes.ts

import express, { Request, Response } from "express";
import type { ChainName } from "@mayanfinance/swap-sdk";
import { getMayanQuote } from "./mayan";

export const router = express.Router();

/**
 * Supported chains for the bridge.
 * MUST stay in sync with Mayan + frontend dropdown.
 */
const ALLOWED_CHAINS: ChainName[] = [
  "solana",
  "ethereum",
  "bsc",
  "arbitrum",
  "base",
];

/**
 * Supported tokens – align with frontend <select id="token">
 */
const ALLOWED_TOKENS = ["USDC", "USDT", "ETH", "SOL"] as const;
type TokenSymbol = (typeof ALLOWED_TOKENS)[number];

/**
 * Route type options exposed in the UI.
 */
type RouteType = "fastest" | "cheapest" | "safest";

/**
 * Parse boolean-like query param ("true"/"1"/"yes" → true).
 */
function parseBool(input: unknown): boolean {
  if (typeof input !== "string") return false;
  const v = input.toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

// ---------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------

router.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// ---------------------------------------------------------------------
// GET /api/quote
//
// Example:
// /api/quote?fromChain=solana&toChain=ethereum&amountIn=90&token=USDC
//           &routeType=fastest&slippage=0.5&mev=true&refuel=false
// ---------------------------------------------------------------------

router.get("/quote", async (req: Request, res: Response) => {
  try {
    const fromRaw = String(req.query.fromChain || "").toLowerCase();
    const toRaw = String(req.query.toChain || "").toLowerCase();
    const amountInRaw = String(
      req.query.amountIn ?? req.query.amount ?? ""
    ).trim();

    // -------- 1) Basic required field validation --------

    if (!fromRaw || !toRaw || !amountInRaw) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters: fromChain, toChain, amountIn",
      });
    }

    const amountHuman = Number(amountInRaw);
    if (!Number.isFinite(amountHuman) || amountHuman <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid amount – please provide a positive number.",
      });
    }

    // -------- 2) Chain whitelist validation (Security #1) --------

    const fromChain = fromRaw as ChainName;
    const toChain = toRaw as ChainName;

    if (!ALLOWED_CHAINS.includes(fromChain) || !ALLOWED_CHAINS.includes(toChain)) {
      return res.status(400).json({
        success: false,
        error: "Unsupported chain. Please select supported networks.",
      });
    }

    // -------- 3) Token selection + whitelist (Functionality #3) --------

    const tokenParam = (req.query.token || "USDC").toString().toUpperCase();
    const tokenSymbol = tokenParam as TokenSymbol;

    if (!ALLOWED_TOKENS.includes(tokenSymbol)) {
      return res.status(400).json({
        success: false,
        error: "Unsupported token symbol.",
      });
    }

    // -------- 4) Route type (fastest/cheapest/safest) (Functionality #4) --------

    let routeType: RouteType | undefined;
    if (typeof req.query.routeType === "string") {
      const rtCandidate = req.query.routeType.toLowerCase() as RouteType;
      if (rtCandidate === "fastest" || rtCandidate === "cheapest" || rtCandidate === "safest") {
        routeType = rtCandidate;
      }
    }

    // -------- 5) Slippage handling (to BPS) (Functionality #5) --------

    let slippageBps: number | undefined;
    if (typeof req.query.slippage === "string" && req.query.slippage.trim() !== "") {
      const slipNum = Number(req.query.slippage);
      if (Number.isFinite(slipNum) && slipNum >= 0 && slipNum <= 50) {
        // e.g. 0.5% → 50 bps
        slippageBps = Math.round(slipNum * 100);
      }
    }

    // -------- 6) MEV & Refuel flags (Functionality #6) --------

    const mevProtection = parseBool(req.query.mev);
    const refuelGas = parseBool(req.query.refuel);

    // -------- 7) Call Mayan wrapper --------

    const quote = await getMayanQuote({
      fromChain,
      toChain,
      tokenSymbol,
      amountHuman,

      // 🔥 main change: pass referrerWallet instead of referrer
      referrerWallet: process.env.REFERRER_ADDRESS,

      routeType,
      slippageBps,
      mevProtection,
      refuelGas,
    });

    return res.json({
      success: true,
      rawQuote: quote.rawQuote,
      netAmount: quote.netAmountIn,
      feeAmount: quote.feeAmount,
    });
  } catch (err: any) {
    // Security #2: log full error server-side, but do NOT leak upstream internals to client
    console.error("Quote route error:", err);

    return res.status(502).json({
      success: false,
      error: "Failed to fetch quote from bridge backend.",
    });
  }
});
