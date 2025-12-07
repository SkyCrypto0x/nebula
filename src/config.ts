// src/config.ts

import dotenv from "dotenv";
dotenv.config();

/**
 * Environment variable helper.
 * If the variable is truly required for the app to run,
 * call mustEnv("NAME") so that startup fails with a clear message.
 */
export function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Server port.
 * - Optional: if PORT is not set, default to 3000.
 */
export const PORT: number = Number(process.env.PORT) || 3000;

/**
 * Referrer address for Mayan / protocol.
 * - Treated as OPTIONAL.
 * - If you want to make it mandatory later:
 *     export const REFERRER_ADDRESS = mustEnv("REFERRER_ADDRESS");
 */
export const REFERRER_ADDRESS: string | undefined =
  process.env.REFERRER_ADDRESS || undefined;

/**
 * Frontend origin (for CORS whitelist).
 */
export const FRONTEND_ORIGIN: string | undefined =
  process.env.FRONTEND_ORIGIN || undefined;

/**
 * Mandatory environment variables for protocol integrations.
 */
export const SOLANA_PROGRAM = mustEnv("SOLANA_PROGRAM");
export const FORWARDER_ADDRESS = mustEnv("FORWARDER_ADDRESS");
export const FEE_WALLET = mustEnv("FEE_WALLET");

/**
 * Global fee configuration (single source of truth).
 *
 * DEFAULT_FEE_BPS:
 *   - 50 bps = 0.5%
 *
 * FEE_BPS:
 *   - Can be overridden via env:
 *       FEE_BPS
 *       MAYAN_REFERRER_BPS
 *       MAYAN_FEE_BPS
 *   - If invalid, falls back to DEFAULT_FEE_BPS.
 */
export const DEFAULT_FEE_BPS = 50;

export const FEE_BPS: number = (() => {
  const raw =
    process.env.FEE_BPS ??
    process.env.MAYAN_REFERRER_BPS ??
    process.env.MAYAN_FEE_BPS;

  if (!raw) return DEFAULT_FEE_BPS;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_FEE_BPS;
  }

  return parsed;
})();

/**
 * External APIs
 */
export const PRICE_API = "https://price-api.mayan.finance/v3/quote";
export const EXPLORER_API = "https://explorer-api.mayan.finance/v3";

/**
 * OPTIONAL / FUTURE CONFIGS
 *
 * এগুলো এখন কোডে actively use হচ্ছে না, তাই এখানে রাখলে
 * উপরে বড় comment দেওয়া রয়েছে যেন কেউ confuse না হয়।
 *
 * Production-এ যেদিন এগুলো দরকার হবে, তখন:
 *   - এই লাইনগুলো uncomment করো,
 *   - আর যেখানে ব্যবহার হবে সেখানে import করো।
 */

// export const SOME_PROGRAM_ID = mustEnv("SOME_PROGRAM_ID"); // TODO
// export const RELAYER_FORWARDER = mustEnv("RELAYER_FORWARDER"); // TODO
// export const DEDICATED_FEE_WALLET = mustEnv("DEDICATED_FEE_WALLET"); // TODO

// export const PRICE_SERVICE_API = process.env.PRICE_SERVICE_API || ""; // TODO
// export const BLOCK_EXPLORER_API = process.env.BLOCK_EXPLORER_API || ""; // TODO
