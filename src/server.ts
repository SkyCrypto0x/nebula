// src/server.ts

import express from "express";
import path from "path";
import dotenv from "dotenv";
import { router } from "./routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// JSON body parser (future POST endpoints er jonno)
app.use(express.json());

// Static frontend (public folder)
app.use(express.static(path.join(__dirname, "..", "public")));

// API routes
app.use("/api", router);

// SPA hole nice fallback – ekhane simple index.html
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Bridge backend running on ${PORT}`);
});
