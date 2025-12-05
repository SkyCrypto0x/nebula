// public/app.ts

// ---- Types ----

type ChainName = "solana" | "ethereum" | "bsc" | "arbitrum" | "base";
type TokenSymbol = "USDC" | "USDT" | "ETH" | "SOL";

type QuoteApiResponse = {
  success: boolean;
  netAmount?: string; // smallest units from backend
  feeAmount?: string;
  error?: string;
  rawQuote?: any;
};

type StatusKind = "default" | "ok" | "error";

type ConnectedWallet = {
  type: "metamask" | "phantom";
  address: string;
};

// small decimal map (UI side only)
const TOKEN_DECIMALS: Record<TokenSymbol, number> = {
  USDC: 6,
  USDT: 6,
  ETH: 18,
  SOL: 9,
};

// ---- extended window type ----
type AnyWindow = Window &
  typeof globalThis & {
    solana?: any;
    ethereum?: any;
  };

const w = window as AnyWindow;

// ---- DOM refs ----

const backendStatusEl = document.getElementById(
  "backendStatus"
) as HTMLSpanElement;

const fromChainEl = document.getElementById("fromChain") as HTMLSelectElement;
const toChainEl = document.getElementById("toChain") as HTMLSelectElement;
const flipBtn = document.getElementById("flipChains") as HTMLButtonElement;

const tokenEl = document.getElementById("token") as HTMLSelectElement;
const amountEl = document.getElementById("amount") as HTMLInputElement;
const destAddressEl = document.getElementById(
  "destAddress"
) as HTMLInputElement;

const quoteBtn = document.getElementById("quoteBtn") as HTMLButtonElement;
const swapBtn = document.getElementById("swapBtn") as HTMLButtonElement;

const statusEl = document.getElementById("status") as HTMLDivElement;
const outputEl = document.getElementById("output") as HTMLPreElement;
const receivePreviewEl = document.getElementById(
  "receivePreview"
) as HTMLSpanElement;

// summary card
const youSendEl = document.getElementById("youSend") as HTMLDivElement;
const youSendChainEl = document.getElementById(
  "youSendChain"
) as HTMLDivElement;
const youReceiveEl = document.getElementById("youReceive") as HTMLDivElement;
const youReceiveChainEl = document.getElementById(
  "youReceiveChain"
) as HTMLDivElement;
const sourceWalletEl = document.getElementById(
  "sourceWallet"
) as HTMLSpanElement;
const destinationWalletEl = document.getElementById(
  "destinationWallet"
) as HTMLSpanElement;
const walletSummaryEl = document.getElementById(
  "walletSummary"
) as HTMLSpanElement;

// wallet modal
const openWalletModalBtn = document.getElementById(
  "openWalletModal"
) as HTMLButtonElement;
const closeWalletModalBtn = document.getElementById(
  "closeWalletModal"
) as HTMLButtonElement;
const walletBackdropEl = document.getElementById(
  "walletBackdrop"
) as HTMLDivElement;
const walletModalEl = document.getElementById("walletModal") as HTMLDivElement;
const walletItemBtns = document.querySelectorAll<HTMLButtonElement>(
  ".wallet-item"
);

// ---- State ----

let isQuoting = false;
let isSwapping = false;
let lastQuote: QuoteApiResponse | null = null;

let quoteMeta:
  | {
      token: TokenSymbol;
      fromChain: ChainName;
      toChain: ChainName;
      inputAmount: number;
    }
  | null = null;

let connectedWallet: ConnectedWallet | null = null;

// ---- Helper functions ----

function setStatus(message: string, kind: StatusKind = "default") {
  statusEl.textContent = message;
  statusEl.classList.remove("ok", "error");

  if (kind === "ok") statusEl.classList.add("ok");
  if (kind === "error") statusEl.classList.add("error");
}

function shortenAddress(addr: string, size = 4) {
  if (!addr) return "";
  if (addr.length <= size * 2) return addr;
  return `${addr.slice(0, size)}…${addr.slice(-size)}`;
}

function clearQuoteState() {
  lastQuote = null;
  quoteMeta = null;
  receivePreviewEl.textContent = "–";
  youReceiveEl.textContent = "-";
  youReceiveChainEl.textContent = "-";
  outputEl.textContent = "";
  swapBtn.disabled = true;
}

// smallest-units -> human readable (আগের কোড থেকে কপি করা লজিক)
function formatFromMinimal(
  minimal: string | undefined,
  symbol: string
): string {
  if (!minimal) return "-";
  const decimals = TOKEN_DECIMALS[symbol as TokenSymbol] ?? 6;

  try {
    const bn = BigInt(minimal);
    const base = 10n ** BigInt(decimals);
    const whole = bn / base;
    const frac = bn % base;

    let fracStr = frac.toString().padStart(decimals, "0").slice(0, 6); // cap 6
    fracStr = fracStr.replace(/0+$/, "");
    return fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
  } catch {
    // fallback (Number ভিত্তিক)
    const num = Number(minimal);
    const factor = Math.pow(10, decimals);
    const human = num / factor;
    return human.toLocaleString(undefined, {
      maximumFractionDigits: 6,
    });
  }
}

function updateSummaryCard() {
  const token = tokenEl.value as TokenSymbol;
  const fromChain = fromChainEl.value as ChainName;
  const toChain = toChainEl.value as ChainName;
  const amountStr = amountEl.value.trim();
  const amountNum = Number(amountStr || "0");

  if (amountNum > 0) {
    youSendEl.textContent = `${amountStr} ${token}`;
    youSendChainEl.textContent = fromChain.toUpperCase();
  } else {
    youSendEl.textContent = "-";
    youSendChainEl.textContent = fromChain.toUpperCase();
  }

  // netAmount minimal units থেকে human readable বানাই
  if (lastQuote && quoteMeta) {
    const netText = formatFromMinimal(lastQuote.netAmount, quoteMeta.token);

    youReceiveEl.textContent = `${netText} ${quoteMeta.token}`;
    youReceiveChainEl.textContent = toChain.toUpperCase();
    receivePreviewEl.textContent = `${netText} ${quoteMeta.token}`;
  } else {
    youReceiveEl.textContent = "-";
    youReceiveChainEl.textContent = toChain.toUpperCase();
    receivePreviewEl.textContent = "–";
  }

  // destination wallet preview
  if (destAddressEl.value.trim()) {
    destinationWalletEl.textContent = shortenAddress(
      destAddressEl.value.trim()
    );
  } else {
    destinationWalletEl.textContent = "Not set";
  }
}

function maybeEnableSwapButton() {
  swapBtn.disabled = !(
    lastQuote &&
    quoteMeta &&
    !isQuoting &&
    !isSwapping
  );
}

async function pingBackend() {
  try {
    const resp = await fetch("/api/health");
    if (!resp.ok) throw new Error("status " + resp.status);
    const data = (await resp.json()) as { ok?: boolean };
    if (data.ok) {
      backendStatusEl.textContent = "Backend: online";
    } else {
      backendStatusEl.textContent = "Backend: issue";
    }
  } catch {
    backendStatusEl.textContent = "Backend: offline";
  }
}

// ---- Wallet UI helpers ----

function updateWalletUI() {
  if (connectedWallet) {
    const short = shortenAddress(connectedWallet.address);
    const label =
      connectedWallet.type === "metamask" ? "EVM" : "Solana";

    openWalletModalBtn.textContent = `${label}: ${short}`;
    sourceWalletEl.textContent = `${label} · ${short}`;
    walletSummaryEl.textContent = `${label} · ${short}`;
  } else {
    openWalletModalBtn.textContent = "Connect wallet";
    sourceWalletEl.textContent = "Not connected";
    walletSummaryEl.textContent = "No wallet";
  }
}

function openWalletModal() {
  walletBackdropEl.classList.add("show");
  walletModalEl.setAttribute("aria-hidden", "false");
}

function closeWalletModal() {
  walletBackdropEl.classList.remove("show");
  walletModalEl.setAttribute("aria-hidden", "true");
}

// ---- Wallet connect implementations ----

async function connectMetamask() {
  if (!w.ethereum) {
    setStatus("MetaMask / EVM wallet not found in this browser.", "error");
    return;
  }
  try {
    const accounts = (await w.ethereum.request({
      method: "eth_requestAccounts",
    })) as string[];
    const addr = accounts?.[0];
    if (!addr) throw new Error("No address returned.");

    connectedWallet = { type: "metamask", address: addr };
    updateWalletUI();
    setStatus("EVM wallet connected.", "ok");
  } catch (err) {
    console.error("Metamask connect error:", err);
    setStatus("Failed to connect EVM wallet.", "error");
  }
}

async function connectPhantom() {
  const phantom = w.solana;
  if (!phantom || !phantom.isPhantom) {
    setStatus("Phantom wallet not found.", "error");
    return;
  }
  try {
    const resp = await phantom.connect();
    const addr = resp?.publicKey?.toString?.();
    if (!addr) throw new Error("No publicKey from Phantom.");

    connectedWallet = { type: "phantom", address: addr };
    updateWalletUI();
    setStatus("Phantom wallet connected.", "ok");
  } catch (err) {
    console.error("Phantom connect error:", err);
    setStatus("Failed to connect Phantom wallet.", "error");
  }
}

// ---- Event wiring ----

// flip chains
flipBtn.addEventListener("click", () => {
  const from = fromChainEl.value;
  fromChainEl.value = toChainEl.value;
  toChainEl.value = from;

  clearQuoteState();
  updateSummaryCard();
});

// when user edits amount / token / chain => clear old quote
[fromChainEl, toChainEl, tokenEl].forEach((el) =>
  el.addEventListener("change", () => {
    clearQuoteState();
    updateSummaryCard();
  })
);

amountEl.addEventListener("input", () => {
  clearQuoteState();
  updateSummaryCard();
});

destAddressEl.addEventListener("input", () => {
  updateSummaryCard();
});

// wallet modal open/close
openWalletModalBtn.addEventListener("click", () => {
  openWalletModal();
});

closeWalletModalBtn.addEventListener("click", () => {
  closeWalletModal();
});

walletBackdropEl.addEventListener("click", (ev) => {
  if (ev.target === walletBackdropEl) {
    closeWalletModal();
  }
});

// wallet choice
walletItemBtns.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const type = btn.dataset.wallet;
    if (type === "metamask") {
      await connectMetamask();
    } else if (type === "phantom") {
      await connectPhantom();
    } else {
      setStatus("WalletConnect support coming soon.", "default");
    }
    closeWalletModal();
  });
});

// ---- Quote handler ----

quoteBtn.addEventListener("click", async () => {
  const amountStr = amountEl.value.trim();
  const amountNum = Number(amountStr);

  const fromChain = fromChainEl.value as ChainName;
  const toChain = toChainEl.value as ChainName;
  const token = tokenEl.value as TokenSymbol;

  if (!amountStr || isNaN(amountNum) || amountNum <= 0) {
    setStatus("Enter a valid positive amount.", "error");
    return;
  }

  if (fromChain === toChain) {
    setStatus("From & To chain must be different.", "error");
    return;
  }

  clearQuoteState();
  isQuoting = true;
  quoteBtn.disabled = true;
  quoteBtn.textContent = "Getting quote…";
  setStatus("Contacting router backend for a quote…");

  try {
    const params = new URLSearchParams({
      fromChain,
      toChain,
      // backend expects HUMAN units here (e.g. "10"), not smallest units
      amountIn: amountStr,
      token,
    });

    const resp = await fetch(`/api/quote?${params.toString()}`);
    const data = (await resp.json()) as QuoteApiResponse;

    if (!resp.ok || !data.success) {
      throw new Error(data.error || `Backend error: ${resp.status}`);
    }

    lastQuote = data;
    console.log("Quote from backend:", data);

    quoteMeta = { token, fromChain, toChain, inputAmount: amountNum };

    outputEl.textContent = JSON.stringify(data.rawQuote ?? data, null, 2);
    setStatus("Quote received. You can now execute the bridge.", "ok");
    updateSummaryCard();
  } catch (err: any) {
    console.error("Quote error:", err);
    setStatus(
      err?.message || "Failed to fetch quote from backend.",
      "error"
    );
  } finally {
    isQuoting = false;
    quoteBtn.disabled = false;
    quoteBtn.textContent = "Get bridge quote";
    maybeEnableSwapButton();
  }
});

// ---- Swap handler (skeleton) ----

swapBtn.addEventListener("click", async () => {
  if (!lastQuote || !quoteMeta) {
    setStatus("No active quote. Get a quote first.", "error");
    return;
  }

  if (!connectedWallet) {
    setStatus("Connect a wallet before executing the bridge.", "error");
    return;
  }

  isSwapping = true;
  swapBtn.disabled = true;
  const originalLabel = swapBtn.textContent;
  swapBtn.textContent = "Executing…";
  setStatus("Preparing bridge transaction payload…");

  try {
    // TODO: wire real swap endpoint here (EVM / Solana)
    // Example skeleton:
    // const resp = await fetch("/api/evm-swap", { method: "POST", body: JSON.stringify({ ... }) });

    console.log("Execute bridge with:", {
      quoteMeta,
      lastQuote,
      wallet: connectedWallet,
      destAddress: destAddressEl.value.trim() || null,
    });

    setStatus(
      "Swap execution skeleton ready. Next step: wire /api/evm-swap with Mayan swap-sdk.",
      "ok"
    );
  } catch (err) {
    console.error("Swap error:", err);
    setStatus("Swap execution failed.", "error");
  } finally {
    isSwapping = false;
    swapBtn.textContent = originalLabel || "Execute bridge";
    maybeEnableSwapButton();
  }
});

// ---- Initial bootstrap ----

updateSummaryCard();
updateWalletUI();
pingBackend();
