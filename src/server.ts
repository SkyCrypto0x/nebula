// src/server.ts

// Phase-2 Pro Router Backend Upgrade (hardened version)

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { router } from "./routes";

const app = express();
const PORT = process.env.PORT || 3000;

// --------------------
// 1) CORS – whitelist-based
// --------------------

const ALLOWED_ORIGINS: string[] = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  process.env.FRONTEND_ORIGIN || "", // optional prod origin
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Same-origin / tools (Postman, curl) → no origin header
      if (!origin) return callback(null, true);

      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);

// Optional: handle CORS errors a bit more nicely
app.use(
  (
    err: Error,
    _req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (err.message.startsWith("Not allowed by CORS")) {
      return res.status(403).json({ success: false, error: err.message });
    }
    return next(err);
  }
);

// --------------------
// 2) Security headers (Helmet)
// --------------------

app.use(
  helmet({
    // Adjust as needed for SPA
    contentSecurityPolicy: false,
  })
);

// --------------------
// 3) JSON body parsing with size limit
// --------------------

app.use(express.json({ limit: "200kb" }));

// --------------------
// 4) Rate limiting for API
// --------------------

// প্রতি IP প্রতি মিনিটে X টা request (যেমন 60)
const apiLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 60,          // max 60 requests / minute / IP
  standardHeaders: true,
  legacyHeaders: false,
});

// `/api/quote` এবং `/api/swap` – দুটোতেই limiter apply
app.use("/api/quote", apiLimiter);
app.use("/api/swap", apiLimiter);

// --------------------
// 5) API routes
// --------------------

app.use("/api", router);

// Short-term safe stub for /api/swap
// Frontend currently calls this, কিন্তু routes.ts এ এখনো implement করা হয়নি।
app.post("/api/swap", (_req: Request, res: Response) => {
  return res.status(501).json({
    success: false,
    error: "Swap route not implemented yet. Please try again later.",
  });
});

// --------------------
// 6) Static files (public directory)
// --------------------

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

// --------------------
// 7) SPA Fallback
//    (API ছাড়া সব path এ index.html ফেরত দেবে)
// --------------------

app.get(/^\/(?!api).*/, (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// --------------------
// 8) Start server
// --------------------

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
