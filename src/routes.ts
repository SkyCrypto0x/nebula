// src/routes.ts

import express from "express";
import type { ChainName } from "@mayanfinance/swap-sdk";
import { getMayanQuote } from "./mayan";

export const router = express.Router();

// simple health check
router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// GET /api/quote?fromChain=solana&toChain=ethereum&amountIn=90
router.get("/quote", async (req, res) => {
  try {
    const from = String(req.query.fromChain || "").toLowerCase();
    const to = String(req.query.toChain || "").toLowerCase();

    // front-end theke amountIn pathaccho
    const amountStr = String(req.query.amountIn ?? req.query.amount ?? "0");

    if (!from || !to || !amountStr) {
      return res.status(400).json({
        success: false,
        error: "Missing parameters",
      });
    }

    const amountHuman = Number(amountStr);
    if (!Number.isFinite(amountHuman) || amountHuman <= 0) {
      return res.status(400).json({
        success: false,
        error: "Amount must be a positive number",
      });
    }

    const fromChain = from as ChainName;
    const toChain = to as ChainName;

    const quote = await getMayanQuote({
      fromChain,
      toChain,
      tokenSymbol: "USDC", // ekhon UI USDC fixed; pore dynamic korbo
      amountHuman,
      referrer: process.env.REFERRER_ADDRESS,
    });

    return res.json({
      success: true,
      rawQuote: quote.rawQuote,
      netAmount: quote.netAmountIn,
      feeAmount: quote.feeAmount,
    });
  } catch (err: any) {
    console.error("Quote route error:", err?.message || err);
    return res.status(502).json({
      success: false,
      error: err?.message || "Failed to fetch quote from Mayan",
    });
  }
});
