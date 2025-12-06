// src/server.ts 

// Phase-2 Pro Router Backend Upgrade

import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import { router } from "./routes";   // <-- গুরুত্বপূর্ণ

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// --------------------
// 1) API routes আগে
// --------------------
app.use("/api", router);

// (optional) simple history store
type HistoryItem = {
  time: number;
  payload: any;
};

const history: HistoryItem[] = [];

app.get("/api/history", (_req: Request, res: Response) => {
  res.json(history.slice(-20).reverse());
});

// --------------------
// 2) Static files
// --------------------
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

// --------------------
// 3) SPA Fallback
//    (API ছাড়া সব path এ index.html)
// --------------------
app.get(/^\/(?!api).*/, (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// --------------------
// Start server
// --------------------
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
