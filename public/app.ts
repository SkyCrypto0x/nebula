// public/app.ts

type QuoteApiResponse = {
  success: boolean;
  netAmount?: string; // in smallest units from backend
  feeAmount?: string;
  error?: string;
  mayan?: any;
  rawQuote?: any;
};

const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  USDT: 6,
  ETH: 18,
  SOL: 9,
  AUTO: 6,
};

// -------- DOM refs --------

const fromChainEl = document.getElementById("fromChain") as HTMLSelectElement;
const toChainEl = document.getElementById("toChain") as HTMLSelectElement;
const tokenEl = document.getElementById("token") as HTMLSelectElement;
const amountEl = document.getElementById("amount") as HTMLInputElement;
const destAddressEl = document.getElementById(
  "destAddress"
) as HTMLInputElement;

const quoteBtn = document.getElementById("quoteBtn") as HTMLButtonElement;
const swapBtn = document.getElementById("swapBtn") as HTMLButtonElement;
const flipBtn = document.getElementById("flipChains") as HTMLButtonElement;

const statusEl = document.getElementById("status") as HTMLDivElement;
const youSendEl = document.getElementById("youSend") as HTMLDivElement;
const youReceiveEl = document.getElementById("youReceive") as HTMLDivElement;
const youSendChainEl = document.getElementById(
  "youSendChain"
) as HTMLDivElement;
const youReceiveChainEl = document.getElementById(
  "youReceiveChain"
) as HTMLDivElement;
const receivePreviewEl = document.getElementById(
  "receivePreview"
) as HTMLDivElement;

const outputEl = document.getElementById("output") as HTMLPreElement;
const sourceWalletEl = document.getElementById(
  "sourceWallet"
) as HTMLDivElement;
const destinationWalletEl = document.getElementById(
  "destinationWallet"
) as HTMLDivElement;
const walletSummaryEl = document.getElementById(
  "walletSummary"
) as HTMLSpanElement;

// wallet modal elements
const openWalletModalBtn = document.getElementById(
  "openWalletModal"
) as HTMLButtonElement;
const walletModal = document.getElementById("walletModal") as HTMLDivElement;
const walletBackdrop = document.getElementById(
  "walletBackdrop"
) as HTMLDivElement;
const closeWalletModalBtn = document.getElementById(
  "closeWalletModal"
) as HTMLButtonElement;
const walletItems = Array.from(
  document.querySelectorAll<HTMLButtonElement>(".wallet-item")
);

// extended window type
type AnyWindow = Window &
  typeof globalThis & {
    solana?: any;
    ethereum?: any;
    ethers?: any;
  };

const w = window as AnyWindow;

// -------- state --------

let lastQuote: QuoteApiResponse | null = null;
let solanaWallet: string | null = null;
let evmWallet: string | null = null;

// -------- helpers --------

function setStatus(msg: string, type: "default" | "error" | "ok" = "default") {
  statusEl.textContent = msg;
  statusEl.classList.remove("error", "ok");
  if (type === "error") statusEl.classList.add("error");
  if (type === "ok") statusEl.classList.add("ok");
}

// smallest-units -> human readable
function formatFromMinimal(
  minimal: string | undefined,
  symbol: string
): string {
  if (!minimal) return "-";
  const decimals = TOKEN_DECIMALS[symbol] ?? 6;

  try {
    const bn = BigInt(minimal);
    const base = 10n ** BigInt(decimals);
    const whole = bn / base;
    const frac = bn % base;

    let fracStr = frac.toString().padStart(decimals, "0").slice(0, 6); // cap 6
    fracStr = fracStr.replace(/0+$/, "");
    return fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
  } catch {
    // fallback
    const num = Number(minimal);
    const factor = Math.pow(10, decimals);
    const human = num / factor;
    return human.toLocaleString(undefined, {
      maximumFractionDigits: 6,
    });
  }
}

// -------- flip chains --------

flipBtn.addEventListener("click", () => {
  const from = fromChainEl.value;
  fromChainEl.value = toChainEl.value;
  toChainEl.value = from;

  youSendChainEl.textContent = fromChainEl.value.toUpperCase();
  youReceiveChainEl.textContent = toChainEl.value.toUpperCase();
});

// -------- wallet modal logic --------

function openWalletModal() {
  walletBackdrop.classList.add("show");
  walletModal.setAttribute("aria-hidden", "false");
}

function closeWalletModal() {
  walletBackdrop.classList.remove("show");
  walletModal.setAttribute("aria-hidden", "true");
}

openWalletModalBtn.addEventListener("click", openWalletModal);
closeWalletModalBtn.addEventListener("click", closeWalletModal);
walletBackdrop.addEventListener("click", (e) => {
  if (e.target === walletBackdrop) {
    closeWalletModal();
  }
});

// wallet connect helpers

async function connectPhantom() {
  try {
    if (!w.solana || !w.solana.isPhantom) {
      setStatus("Phantom wallet not found", "error");
      return;
    }
    const resp = await w.solana.connect();
    solanaWallet = resp.publicKey?.toString?.() ?? null;
    if (solanaWallet) {
      const sliced =
        solanaWallet.slice(0, 4) +
        "..." +
        solanaWallet.slice(solanaWallet.length - 4);
      sourceWalletEl.textContent = sliced;
      walletSummaryEl.textContent = `Phantom · ${sliced}`;
      setStatus("Phantom wallet connected ✅", "ok");
      maybeEnableSwapButton();
    }
  } catch (err) {
    console.error(err);
    setStatus("Failed to connect Phantom", "error");
  }
}

async function connectMetaMask() {
  try {
    if (!w.ethereum) {
      setStatus("MetaMask / EVM wallet not found", "error");
      return;
    }
    const accounts: string[] = await w.ethereum.request({
      method: "eth_requestAccounts",
    });
    if (!accounts || accounts.length === 0) {
      setStatus("No EVM account selected", "error");
      return;
    }
    evmWallet = accounts[0];
    const sliced =
      evmWallet.slice(0, 6) + "..." + evmWallet.slice(evmWallet.length - 4);
    sourceWalletEl.textContent = sliced;
    walletSummaryEl.textContent = `MetaMask · ${sliced}`;
    setStatus("EVM wallet connected ✅", "ok");
    maybeEnableSwapButton();
  } catch (err) {
    console.error(err);
    setStatus("Failed to connect EVM wallet", "error");
  }
}

// wallet list click
walletItems.forEach((btn) => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.wallet;
    if (type === "metamask") {
      void connectMetaMask();
    } else if (type === "phantom") {
      void connectPhantom();
    } else {
      setStatus("Wallet support coming soon", "error");
    }
    closeWalletModal();
  });
});

// -------- swap button enable logic --------

function maybeEnableSwapButton() {
  if (!lastQuote || !lastQuote.success) {
    swapBtn.disabled = true;
    return;
  }
  const fromChain = fromChainEl.value;
  if (fromChain === "solana") {
    swapBtn.disabled = !solanaWallet;
  } else {
    swapBtn.disabled = !evmWallet;
  }
}

// update destination wallet label when user types
destAddressEl.addEventListener("input", () => {
  const dest = destAddressEl.value.trim();
  if (dest) {
    destinationWalletEl.textContent =
      dest.slice(0, 4) + "..." + dest.slice(dest.length - 4);
  } else {
    destinationWalletEl.textContent = "Not set";
  }
});

// -------- quote handling --------

quoteBtn.addEventListener("click", async () => {
  const fromChain = fromChainEl.value;
  const toChain = toChainEl.value;
  const amountHuman = amountEl.value.trim();

  if (!amountHuman || Number(amountHuman) <= 0) {
    setStatus("Amount must be greater than 0", "error");
    return;
  }

  setStatus("Requesting bridge quote…");
  swapBtn.disabled = true;
  lastQuote = null;
  youSendEl.textContent = "-";
  youReceiveEl.textContent = "-";
  receivePreviewEl.textContent = "–";
  outputEl.textContent = "";

  try {
    const params = new URLSearchParams({
      fromChain,
      toChain,
      amountIn: amountHuman, // human; backend converts to minimal & applies 0.5% fee
      token: tokenEl.value,
    });

    const res = await fetch(`/api/quote?${params.toString()}`);
    const data = (await res.json()) as QuoteApiResponse;

    if (!data.success) {
      setStatus(data.error ?? "Bridge quote failed", "error");
      return;
    }

    lastQuote = data;

    const symbol = tokenEl.value;
    const sendHuman = Number(amountHuman);
    const sendFormatted = isNaN(sendHuman)
      ? amountHuman
      : sendHuman.toLocaleString(undefined, {
          maximumFractionDigits: 6,
        });

    const netFormatted = formatFromMinimal(data.netAmount, symbol);

    youSendEl.textContent = `${sendFormatted} ${symbol}`;
    youReceiveEl.textContent = `${netFormatted} ${symbol}`;
    youSendChainEl.textContent = fromChain.toUpperCase();
    youReceiveChainEl.textContent = toChain.toUpperCase();
    receivePreviewEl.textContent = `${netFormatted} ${symbol}`;

    const rawQuote = (data.rawQuote ?? data.mayan ?? data) as any;
    outputEl.textContent = JSON.stringify(rawQuote, null, 2);

    setStatus("Quote received. You can now execute the bridge.", "ok");
    maybeEnableSwapButton();
  } catch (err) {
    console.error(err);
    setStatus("Failed to fetch quote from backend", "error");
  }
});

// -------- swap execution skeleton --------

swapBtn.addEventListener("click", async () => {
  if (!lastQuote || !lastQuote.success) {
    setStatus("No quote yet. Please Get bridge quote first.", "error");
    return;
  }

  const fromChain = fromChainEl.value;
  const toChain = toChainEl.value;
  const destInput = destAddressEl.value.trim();
  const destinationWallet =
    destInput ||
    (toChain === "solana" ? solanaWallet : evmWallet) ||
    null;

  if (!destinationWallet) {
    setStatus(
      "Please connect a wallet or enter destination wallet address.",
      "error"
    );
    return;
  }

  destinationWalletEl.textContent =
    destinationWallet.slice(0, 4) +
    "..." +
    destinationWallet.slice(destinationWallet.length - 4);

  if (fromChain === "solana") {
    setStatus(
      "Solana swap execution TODO: implement backend with Mayan swap-sdk and sign via Phantom.",
      "error"
    );
    return;
  }

  if (!evmWallet || !w.ethereum || !w.ethers) {
    setStatus("EVM wallet not connected", "error");
    return;
  }

  setStatus("Preparing EVM transaction (example)…");
  swapBtn.disabled = true;

  try {
    // Future: call your backend to create EVM tx payload using Mayan swap-sdk
    // const evmPayloadRes = await fetch("/api/evm-swap", { ... });
    // const txPayload = await evmPayloadRes.json();
    // const provider = new w.ethers.BrowserProvider(w.ethereum);
    // const signer = await provider.getSigner();
    // const tx = await signer.sendTransaction({ ...txPayload });

    setStatus(
      "Swap execution skeleton ready. Next step: wire /api/evm-swap with Mayan swap-sdk.",
      "ok"
    );
  } catch (err) {
    console.error(err);
    setStatus("Swap execution failed", "error");
  } finally {
    maybeEnableSwapButton();
  }
});
