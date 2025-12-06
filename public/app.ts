// public/app.ts

// declare const confetti: any;

// ---- Types ----

type ChainName = "solana" | "ethereum" | "bsc" | "arbitrum" | "base";
type TokenSymbol = "USDC" | "USDT" | "ETH" | "SOL";

type QuoteApiResponse = {
  success: boolean;
  netAmount?: string; // smallest units from backend
  feeAmount?: string;
  error?: string;
  rawQuote?: any;
  routes?: any[]; // optional route list from backend
};

type StatusKind = "default" | "ok" | "error";

type ConnectedWallet = {
  type: "metamask" | "phantom";
  address: string;
};

interface BridgeHistoryEntry {
  time: number;
  amount: number | undefined;
  from: string;
  to: string;
  tx: any;
}

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

// ছোট হেল্পার – element নাও, কিন্তু না থাকলে null রিটার্ন করো
function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

// required element helper – না থাকলে error
function mustGet<T extends HTMLElement>(id: string): T {
  const el = byId<T>(id);
  if (!el) {
    throw new Error(`Required element #${id} not found`);
  }
  return el;
}

// ---- DOM refs (assigned inside initUI) ----

let backendStatusEl: HTMLSpanElement;

// tabs + panels
let bridgeTabBtn: HTMLButtonElement;
let historyTabBtn: HTMLButtonElement;
let bridgePanelWrapperEl: HTMLDivElement;
let historyPanelEl: HTMLDivElement;
let historyListEl: HTMLDivElement;

let fromChainEl: HTMLSelectElement;
let toChainEl: HTMLSelectElement;
let flipBtn: HTMLButtonElement;

let tokenEl: HTMLSelectElement;
let amountEl: HTMLInputElement;
let destAddressEl: HTMLInputElement;

let quoteBtn: HTMLButtonElement;
let swapBtn: HTMLButtonElement;

let statusEl: HTMLDivElement;
let outputEl: HTMLPreElement;
let receivePreviewEl: HTMLSpanElement;

// summary card
let youSendEl: HTMLDivElement;
let youSendChainEl: HTMLDivElement;
let youReceiveEl: HTMLDivElement;
let youReceiveChainEl: HTMLDivElement;
let sourceWalletEl: HTMLSpanElement;
let destinationWalletEl: HTMLSpanElement;
let walletSummaryEl: HTMLSpanElement;

// wallet modal
let openWalletModalBtn: HTMLButtonElement;
let closeWalletModalBtn: HTMLButtonElement;
let walletBackdropEl: HTMLDivElement;
let walletModalEl: HTMLDivElement;
let walletItemBtns: NodeListOf<HTMLButtonElement>;

// NEW DOM ELEMENTS
let slippageEl: HTMLInputElement;
let mevToggleEl: HTMLInputElement;
let refuelToggleEl: HTMLInputElement;

let routeFiltersEl: HTMLDivElement;
let routeContainerEl: HTMLDivElement;
let routeListEl: HTMLDivElement;

let minReceiveBoxEl: HTMLDivElement;
let minReceiveValueEl: HTMLSpanElement;

let microcopyEl: HTMLDivElement;

let progressBarEl: HTMLDivElement;

// Route filter buttons (Fastest / Cheapest / Safest)
let routeFilterButtons: NodeListOf<HTMLButtonElement>;

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

// --- NEW STATE ---
let selectedRouteType: "fastest" | "cheapest" | "safest" = "cheapest";
let bridgeHistory: BridgeHistoryEntry[] = [];

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

  // hide routes + min receive
  routeContainerEl?.classList.add("hidden");
  routeFiltersEl?.classList.add("hidden");
  minReceiveBoxEl?.classList.add("hidden");
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

// ---- Route selection ----

function updateRouteSelection(type: "fastest" | "cheapest" | "safest") {
  selectedRouteType = type;

  routeFilterButtons.forEach((btn) => {
    const filter = btn.dataset.filter as
      | "fastest"
      | "cheapest"
      | "safest"
      | undefined;
    btn.classList.toggle("active", filter === type);
  });

  // Re-run quote if user switches route filter
  if (lastQuote) {
    fetchQuote();
  }
}

// ---- Quote logic extracted into a function ----

async function fetchQuote() {
  const amountStr = amountEl.value.trim();
  const amountNum = Number(amountStr);

  if (!amountNum || amountNum <= 0) {
    setStatus("Enter a valid amount", "error");
    return;
  }

  isQuoting = true;
  maybeEnableSwapButton();

  setStatus("Fetching best cross-chain route...");
  if (progressBarEl) progressBarEl.style.width = "25%";

  try {
    const params = new URLSearchParams({
      fromChain: fromChainEl.value,
      toChain: toChainEl.value,
      token: tokenEl.value,
      amountIn: amountStr,
      slippage: slippageEl.value,
      routeType: selectedRouteType,
      mev: mevToggleEl.checked ? "1" : "0",
      refuel: refuelToggleEl.checked ? "1" : "0",
    });

    const res = await fetch(`/api/quote?${params.toString()}`);
    const data = (await res.json()) as QuoteApiResponse & {
      routes?: any[];
    };

    if (!data.success) throw new Error(data.error || "Quote failed");

    lastQuote = data;

    // keep quoteMeta in sync with latest successful quote
    quoteMeta = {
      token: tokenEl.value as TokenSymbol,
      fromChain: fromChainEl.value as ChainName,
      toChain: toChainEl.value as ChainName,
      inputAmount: amountNum,
    };

    // Update receive preview from minimal units
    const decimals = TOKEN_DECIMALS[tokenEl.value as TokenSymbol];
    const humanNet = Number(data.netAmount) / Math.pow(10, decimals);
    const minReceived =
      humanNet * (1 - Number(slippageEl.value || "0") / 100);

    receivePreviewEl.textContent = `${humanNet.toFixed(
      6
    )} ${tokenEl.value}`;

    if (minReceiveBoxEl && minReceiveValueEl) {
      minReceiveBoxEl.classList.remove("hidden");
      minReceiveValueEl.textContent = `${minReceived.toFixed(
        6
      )} ${tokenEl.value}`;
    }

    microcopyEl.textContent = `Includes all bridge fees & est. gas.`;

    // Render route list
    renderRoutes(data.routes || []);

    outputEl.textContent = JSON.stringify(data.rawQuote ?? data, null, 2);
    updateSummaryCard();

    if (progressBarEl) progressBarEl.style.width = "60%";
    setStatus("Route ready. Execute when you’re ready.", "ok");

    maybeEnableSwapButton();
  } catch (err: any) {
    console.error(err);
    setStatus(err.message ?? "Failed to get quote", "error");
  } finally {
    isQuoting = false;
    maybeEnableSwapButton();
  }
}

// ---- Route renderer ----

function renderRoutes(routes: any[]) {
  if (!routeContainerEl || !routeListEl) return;

  if (!routes || routes.length === 0) {
    routeContainerEl.classList.add("hidden");
    routeFiltersEl?.classList.add("hidden");
    routeListEl.innerHTML = "";
    return;
  }

  routeContainerEl.classList.remove("hidden");
  routeFiltersEl?.classList.remove("hidden");

  routeListEl.innerHTML = routes
    .map(
      (r: any) => `
      <div class="route-row">
        <div class="route-left">
          <span>${r.protocol}</span>
          <small>${r.estimatedTime} sec</small>
        </div>
        <div class="route-right">
          <span>${r.netHuman} ${tokenEl.value}</span>
          <small>Fee: ${r.totalFee}</small>
        </div>
      </div>`
    )
    .join("");
}

// ---- Swap handler (updated) ----

function celebrateBridge() {
  confetti({
    particleCount: 150,
    spread: 70,
    origin: { y: 0.65 },
    scalar: 0.9,
    colors: ["#22d3ee", "#8b5cf6", "#ec4899", "#22c55e"],
  });
}

// ---- History panel render ----

function renderHistoryPanel() {
  historyListEl.innerHTML = bridgeHistory
    .map(
      (h: BridgeHistoryEntry) => `
      <div class="history-item">
        <div>${new Date(h.time).toLocaleTimeString()}</div>
        <div>${h.amount ?? "-"} ${tokenEl.value}</div>
        <div>${h.from} → ${h.to}</div>
        <div>Tx: ${
          h.tx?.hash ? h.tx.hash.slice(0, 8) + "…" : "--------"
        }</div>
      </div>`
    )
    .join("");
}

// ---- Custom cursor init – safe ভাবে ----

function initCustomCursor() {
  // যদি pointer coarse হয় (touch device), কিছুই করবো না
  if (!window.matchMedia || !window.matchMedia("(pointer: fine)").matches) {
    return;
  }

  const cursor = byId<HTMLDivElement>("customCursor");
  if (!cursor) {
    // element না থাকলে system cursor hide করবো না
    console.warn("Custom cursor element not found");
    return;
  }

  // cursor visible করো
  cursor.style.display = "block";

  // এখনই body-তে class যোগ করো (CSS তখন default cursor hide করবে)
  // document.body.classList.add("custom-cursor-enabled");

  window.addEventListener("mousemove", (e) => {
    cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  });

  window.addEventListener("mousedown", () => {
    cursor.style.transform += " scale(0.85)";
  });

  window.addEventListener("mouseup", () => {
    cursor.style.transform = cursor.style.transform.replace(" scale(0.85)", "");
  });
}

// ---- Slippage presets + custom ----

function setupSlippageControls() {
  const input = slippageEl;
  if (!input) return;

  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".slip-btn")
  );

  const customBtn = buttons.find((b) =>
    b.classList.contains("slip-btn-custom")
  );

  const setActive = (btn: HTMLButtonElement) => {
    buttons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  };

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const isCustom = btn.classList.contains("slip-btn-custom");

      if (isCustom) {
        // Custom mode: keep whatever user types
        setActive(btn);
        input.classList.remove("hidden");
        input.focus();
      } else {
        // Preset mode
        const v = btn.dataset.value || "0.5";
        input.value = v;
        input.classList.add("hidden");
        setActive(btn);
      }
    });
  });

  // যদি custom ইনপুটে মান টাইপ করে, ওটা custom বোঝাতে
  input.addEventListener("input", () => {
    if (customBtn) {
      setActive(customBtn);
      input.classList.remove("hidden");
    }
  });
}

// ---- UI init (all DOM wiring এখানে) ----

function initUI() {
  // Required elements
  backendStatusEl = mustGet<HTMLSpanElement>("backendStatus");

  // tabs & panels
  bridgeTabBtn = mustGet<HTMLButtonElement>("bridgeBtn");
  historyTabBtn = mustGet<HTMLButtonElement>("historyBtn");
  bridgePanelWrapperEl = mustGet<HTMLDivElement>("bridgePanel");
  historyPanelEl = mustGet<HTMLDivElement>("historyPanel");
  historyListEl = mustGet<HTMLDivElement>("historyList");

  fromChainEl = mustGet<HTMLSelectElement>("fromChain");
  toChainEl = mustGet<HTMLSelectElement>("toChain");
  flipBtn = mustGet<HTMLButtonElement>("flipChains");

  tokenEl = mustGet<HTMLSelectElement>("token");
  amountEl = mustGet<HTMLInputElement>("amount");
  destAddressEl = mustGet<HTMLInputElement>("destAddress");

  quoteBtn = mustGet<HTMLButtonElement>("quoteBtn");
  swapBtn = mustGet<HTMLButtonElement>("swapBtn");

  statusEl = mustGet<HTMLDivElement>("status");
  outputEl = mustGet<HTMLPreElement>("output");
  receivePreviewEl = mustGet<HTMLSpanElement>("receivePreview");

  youSendEl = mustGet<HTMLDivElement>("youSend");
  youSendChainEl = mustGet<HTMLDivElement>("youSendChain");
  youReceiveEl = mustGet<HTMLDivElement>("youReceive");
  youReceiveChainEl = mustGet<HTMLDivElement>("youReceiveChain");
  sourceWalletEl = mustGet<HTMLSpanElement>("sourceWallet");
  destinationWalletEl = mustGet<HTMLSpanElement>("destinationWallet");
  walletSummaryEl = mustGet<HTMLSpanElement>("walletSummary");

  openWalletModalBtn = mustGet<HTMLButtonElement>("openWalletModal");
  closeWalletModalBtn = mustGet<HTMLButtonElement>("closeWalletModal");
  walletBackdropEl = mustGet<HTMLDivElement>("walletBackdrop");
  walletModalEl = mustGet<HTMLDivElement>("walletModal");

  slippageEl = mustGet<HTMLInputElement>("slippage");
  mevToggleEl = mustGet<HTMLInputElement>("mevToggle");
  refuelToggleEl = mustGet<HTMLInputElement>("refuelToggle");

  routeFiltersEl = mustGet<HTMLDivElement>("routeFilters");
  routeContainerEl = mustGet<HTMLDivElement>("routeContainer");
  routeListEl = mustGet<HTMLDivElement>("routeList");

  minReceiveBoxEl = mustGet<HTMLDivElement>("minReceive");
  minReceiveValueEl = mustGet<HTMLSpanElement>("minReceiveValue");

  microcopyEl = mustGet<HTMLDivElement>("microcopy");

  progressBarEl = mustGet<HTMLDivElement>("progressBar");

  // NodeLists
  walletItemBtns =
    document.querySelectorAll<HTMLButtonElement>(".wallet-item");
  routeFilterButtons =
    document.querySelectorAll<HTMLButtonElement>(".route-filter");

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

  // Route filter buttons
  routeFilterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const filter = (btn.dataset.filter ||
        "cheapest") as "fastest" | "cheapest" | "safest";
      updateRouteSelection(filter);
    });
  });

  // Quote button
  quoteBtn.addEventListener("click", () => {
    fetchQuote();
  });

  // Swap handler
  swapBtn.addEventListener("click", async () => {
    if (!lastQuote) {
      setStatus("Get a quote first", "error");
      return;
    }

    isSwapping = true;
    maybeEnableSwapButton();

    setStatus("Preparing transaction...");
    if (progressBarEl) progressBarEl.style.width = "30%";

    try {
      const payload = {
        quote: lastQuote,
        wallet: connectedWallet,
        dest: destAddressEl.value.trim(),
        mev: mevToggleEl.checked,
        refuel: refuelToggleEl.checked,
      };

      const res = await fetch("/api/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const tx = await res.json();
      if (progressBarEl) progressBarEl.style.width = "70%";
      setStatus("Transaction submitted...");

      // Save history
      bridgeHistory.push({
        time: Date.now(),
        amount: quoteMeta?.inputAmount,
        from: fromChainEl.value,
        to: toChainEl.value,
        tx,
      });

      if (progressBarEl) progressBarEl.style.width = "100%";
      setStatus("Bridge completed!", "ok");

      celebrateBridge();
    } catch (err) {
      console.error(err);
      setStatus("Swap failed", "error");
    } finally {
      isSwapping = false;
      maybeEnableSwapButton();
    }
  });

  // ---- Tabs: Bridge / History ----

  bridgeTabBtn.addEventListener("click", () => {
    bridgeTabBtn.classList.add("active");
    historyTabBtn.classList.remove("active");

    bridgePanelWrapperEl.classList.remove("hidden");
    historyPanelEl.classList.add("hidden");
  });

  historyTabBtn.addEventListener("click", () => {
    historyTabBtn.classList.add("active");
    bridgeTabBtn.classList.remove("active");

    historyPanelEl.classList.remove("hidden");
    bridgePanelWrapperEl.classList.add("hidden");

    renderHistoryPanel();
  });

  // ---- Slippage presets ----
  setupSlippageControls();
}

// ---- DOM content ready হলে init ----

document.addEventListener("DOMContentLoaded", () => {
  try {
    initUI();
    updateSummaryCard();
    updateWalletUI();
    pingBackend();
    initCustomCursor();
    console.log("Soul Swap UI initialized");
  } catch (err) {
    console.error("Initialization error:", err);
    // কোনো কারণে crash হলে হলেও default cursor ফিরে পাওয়ার জন্য
    document.body.classList.remove("custom-cursor-enabled");
  }
});
