"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Asset = "ETH" | "USDT";
type TransactionType = "buy" | "sell";
type View = "overview" | "add" | "ledger" | "settings";

type InvestmentTransaction = {
  id: string;
  type: TransactionType;
  asset: Asset;
  usdAmount: number;
  rate: number;
  quantity: number;
  date: string;
  time: string;
  note: string;
  createdAt: string;
};

type Position = {
  quantity: number;
  cost: number;
  realized: number;
  disposedCost: number;
};

type LedgerLine = InvestmentTransaction & {
  averageCostAfter: number;
  realizedGain: number | null;
  realizedPercent: number | null;
};

const STORAGE_KEY = "investment-tracker-v1";
const PRICE_KEY = "investment-tracker-prices-v1";
const ASSETS: Asset[] = ["ETH", "USDT"];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const signedMoney = (value: number) => `${value >= 0 ? "+" : "−"}${money.format(Math.abs(value))}`;
const percent = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;
const quantity = (value: number, asset: Asset) =>
  `${value.toLocaleString("en-US", { maximumFractionDigits: asset === "ETH" ? 8 : 2 })} ${asset}`;

function localDateParts() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  const local = new Date(now.getTime() - offset).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

function calculateLedger(transactions: InvestmentTransaction[]) {
  const positions: Record<Asset, Position> = {
    ETH: { quantity: 0, cost: 0, realized: 0, disposedCost: 0 },
    USDT: { quantity: 0, cost: 0, realized: 0, disposedCost: 0 },
  };
  const lineMap = new Map<string, LedgerLine>();
  const sorted = [...transactions].sort((a, b) =>
    `${a.date}T${a.time}-${a.createdAt}`.localeCompare(`${b.date}T${b.time}-${b.createdAt}`),
  );

  for (const transaction of sorted) {
    const position = positions[transaction.asset];
    let realizedGain: number | null = null;
    let realizedPercent: number | null = null;

    if (transaction.type === "buy") {
      position.quantity += transaction.quantity;
      position.cost += transaction.usdAmount;
    } else {
      const averageCost = position.quantity > 0 ? position.cost / position.quantity : 0;
      const disposedCost = averageCost * transaction.quantity;
      realizedGain = transaction.usdAmount - disposedCost;
      realizedPercent = disposedCost > 0 ? (realizedGain / disposedCost) * 100 : 0;
      position.quantity -= transaction.quantity;
      position.cost -= disposedCost;
      position.realized += realizedGain;
      position.disposedCost += disposedCost;
      if (Math.abs(position.quantity) < 1e-10) {
        position.quantity = 0;
        position.cost = 0;
      }
    }

    lineMap.set(transaction.id, {
      ...transaction,
      averageCostAfter: position.quantity > 0 ? position.cost / position.quantity : 0,
      realizedGain,
      realizedPercent,
    });
  }

  return { positions, lineMap };
}

function download(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const initialDate = localDateParts();
  const [view, setView] = useState<View>("overview");
  const [transactions, setTransactions] = useState<InvestmentTransaction[]>([]);
  const [ready, setReady] = useState(false);
  const [entryType, setEntryType] = useState<TransactionType>("buy");
  const [asset, setAsset] = useState<Asset>("ETH");
  const [usdAmount, setUsdAmount] = useState("");
  const [rate, setRate] = useState("");
  const [date, setDate] = useState(initialDate.date);
  const [time, setTime] = useState(initialDate.time);
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | Asset>("ALL");
  const [prices, setPrices] = useState<Record<Asset, number>>({ ETH: 0, USDT: 1 });
  const [priceStatus, setPriceStatus] = useState("Manual price");
  const [toast, setToast] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const { positions, lineMap } = useMemo(() => calculateLedger(transactions), [transactions]);
  const sortedTransactions = useMemo(
    () =>
      [...transactions]
        .filter((item) => filter === "ALL" || item.asset === filter)
        .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`)),
    [transactions, filter],
  );

  const effectivePrices = useMemo(() => {
    const latestEth = [...transactions]
      .filter((item) => item.asset === "ETH")
      .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))[0]?.rate;
    return { ETH: prices.ETH || latestEth || 0, USDT: 1 };
  }, [prices, transactions]);

  const totals = useMemo(() => {
    const currentValue = ASSETS.reduce(
      (sum, item) => sum + positions[item].quantity * effectivePrices[item],
      0,
    );
    const openCost = ASSETS.reduce((sum, item) => sum + positions[item].cost, 0);
    const realized = ASSETS.reduce((sum, item) => sum + positions[item].realized, 0);
    const disposedCost = ASSETS.reduce((sum, item) => sum + positions[item].disposedCost, 0);
    const unrealized = currentValue - openCost;
    const totalGain = realized + unrealized;
    const measuredCost = openCost + disposedCost;
    return {
      currentValue,
      openCost,
      realized,
      unrealized,
      totalGain,
      totalPercent: measuredCost > 0 ? (totalGain / measuredCost) * 100 : 0,
    };
  }, [positions, effectivePrices]);

  const computedQuantity = Number(usdAmount) > 0 && Number(rate) > 0 ? Number(usdAmount) / Number(rate) : 0;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setTransactions(JSON.parse(saved));
      const savedPrices = localStorage.getItem(PRICE_KEY);
      if (savedPrices) setPrices({ ...JSON.parse(savedPrices), USDT: 1 });
    } catch {
      setToast("Saved data could not be read. Your tracker started empty.");
    }
    setReady(true);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  }, [transactions, ready]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(PRICE_KEY, JSON.stringify(prices));
  }, [prices, ready]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function openAdd(type: TransactionType) {
    setEditingId(null);
    setEntryType(type);
    setAsset("ETH");
    setUsdAmount("");
    setRate(effectivePrices.ETH ? String(effectivePrices.ETH) : "");
    const current = localDateParts();
    setDate(current.date);
    setTime(current.time);
    setNote("");
    setView("add");
  }

  function chooseAsset(nextAsset: Asset) {
    setAsset(nextAsset);
    if (!rate || asset === "USDT") setRate(nextAsset === "USDT" ? "1" : effectivePrices.ETH ? String(effectivePrices.ETH) : "");
  }

  function saveTransaction(event: FormEvent) {
    event.preventDefault();
    const amountNumber = Number(usdAmount);
    const rateNumber = Number(rate);
    if (!(amountNumber > 0) || !(rateNumber > 0)) {
      setToast("Enter a valid USD amount and execution rate.");
      return;
    }

    const nextTransaction: InvestmentTransaction = {
      id: editingId || crypto.randomUUID(),
      type: entryType,
      asset,
      usdAmount: amountNumber,
      rate: rateNumber,
      quantity: amountNumber / rateNumber,
      date,
      time,
      note: note.trim(),
      createdAt: editingId
        ? transactions.find((item) => item.id === editingId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
    };
    const candidate = editingId
      ? transactions.map((item) => (item.id === editingId ? nextTransaction : item))
      : [...transactions, nextTransaction];

    const running: Record<Asset, number> = { ETH: 0, USDT: 0 };
    const valid = [...candidate]
      .sort((a, b) => `${a.date}T${a.time}-${a.createdAt}`.localeCompare(`${b.date}T${b.time}-${b.createdAt}`))
      .every((item) => {
        running[item.asset] += item.type === "buy" ? item.quantity : -item.quantity;
        return running[item.asset] >= -1e-8;
      });
    if (!valid) {
      setToast(`That sale is larger than your available ${asset} at that point in the ledger.`);
      return;
    }

    setTransactions(candidate);
    setToast(editingId ? "Transaction updated." : `${asset} ${entryType} added.`);
    setEditingId(null);
    setView("ledger");
  }

  function editTransaction(item: InvestmentTransaction) {
    setEditingId(item.id);
    setEntryType(item.type);
    setAsset(item.asset);
    setUsdAmount(String(item.usdAmount));
    setRate(String(item.rate));
    setDate(item.date);
    setTime(item.time);
    setNote(item.note);
    setView("add");
  }

  function deleteTransaction() {
    if (!editingId || !confirm("Delete this transaction?")) return;
    setTransactions((items) => items.filter((item) => item.id !== editingId));
    setEditingId(null);
    setView("ledger");
    setToast("Transaction deleted.");
  }

  async function refreshEthPrice() {
    setPriceStatus("Updating…");
    try {
      const response = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT");
      if (!response.ok) throw new Error("Price unavailable");
      const data = (await response.json()) as { price?: string };
      const nextPrice = Number(data.price);
      if (!nextPrice) throw new Error("Invalid price");
      setPrices((current) => ({ ...current, ETH: nextPrice }));
      setPriceStatus(`Binance · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
      setToast("ETH price updated.");
    } catch {
      setPriceStatus("Could not reach Binance");
      setToast("Live price unavailable. You can enter it manually.");
    }
  }

  function exportCsv() {
    const header = ["Type", "Asset", "USD amount", "Rate USD", "Quantity", "Date", "Time", "Realized gain USD", "Realized gain %", "Note"];
    const rows = [...transactions]
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
      .map((item) => {
        const line = lineMap.get(item.id);
        return [item.type, item.asset, item.usdAmount, item.rate, item.quantity, item.date, item.time, line?.realizedGain ?? "", line?.realizedPercent ?? "", item.note];
      });
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    download("investment-ledger.csv", csv, "text/csv");
  }

  function exportBackup() {
    download(
      `investment-tracker-backup-${localDateParts().date}.json`,
      JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), transactions, prices }, null, 2),
      "application/json",
    );
  }

  function importBackup(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed.transactions)) throw new Error("Invalid backup");
        setTransactions(parsed.transactions);
        if (parsed.prices) setPrices({ ...parsed.prices, USDT: 1 });
        setToast("Backup restored.");
        setView("overview");
      } catch {
        setToast("That file is not a valid Investment Tracker backup.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("overview")} aria-label="Investment Tracker overview">
          <span className="brand-mark">IT</span>
          <span><b>Investment</b><small>TRACKER</small></span>
        </button>
        <span className="local-pill"><i /> Saved on this device</span>
      </header>

      {view === "overview" && (
        <div className="screen overview-screen">
          <section className="hero-card">
            <div className="hero-copy">
              <p className="eyebrow">TOTAL VALUE</p>
              <h1>{money.format(totals.currentValue)}</h1>
              <div className={`return-chip ${totals.totalGain >= 0 ? "positive" : "negative"}`}>
                {signedMoney(totals.totalGain)} <span>{percent(totals.totalPercent)}</span>
              </div>
              <p className="muted">Realized + open-position movement</p>
            </div>
            <div className="hero-orbit" aria-hidden="true"><span>Ξ</span></div>
          </section>

          <section className="metric-grid" aria-label="Performance summary">
            <article><span>Open cost</span><strong>{money.format(totals.openCost)}</strong></article>
            <article><span>Realized</span><strong className={totals.realized >= 0 ? "gain" : "loss"}>{signedMoney(totals.realized)}</strong></article>
            <article><span>Unrealized</span><strong className={totals.unrealized >= 0 ? "gain" : "loss"}>{signedMoney(totals.unrealized)}</strong></article>
          </section>

          <div className="section-heading">
            <div><p className="eyebrow">POSITIONS</p><h2>Your assets</h2></div>
            <button className="quiet-button" onClick={refreshEthPrice}>↻ Update prices</button>
          </div>

          <section className="asset-list">
            {ASSETS.map((item) => {
              const position = positions[item];
              const price = effectivePrices[item];
              const value = position.quantity * price;
              const assetGain = position.realized + value - position.cost;
              const denominator = position.cost + position.disposedCost;
              return (
                <article className="asset-card" key={item}>
                  <div className={`coin ${item.toLowerCase()}`}>{item === "ETH" ? "Ξ" : "₮"}</div>
                  <div className="asset-main">
                    <div><strong>{item}</strong><span>{item === "ETH" ? "Ethereum" : "Tether"}</span></div>
                    <small>{quantity(position.quantity, item)} · avg {money.format(position.quantity ? position.cost / position.quantity : 0)}</small>
                  </div>
                  <div className="asset-value">
                    <strong>{money.format(value)}</strong>
                    <span className={assetGain >= 0 ? "gain" : "loss"}>{percent(denominator ? (assetGain / denominator) * 100 : 0)}</span>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="price-panel">
            <div><span className="dot-live" /><div><strong>ETH reference price</strong><small>{priceStatus}</small></div></div>
            <label>$ <input type="number" min="0" step="any" value={prices.ETH || ""} placeholder={String(effectivePrices.ETH || "0")} onChange={(event) => { setPrices((current) => ({ ...current, ETH: Number(event.target.value) })); setPriceStatus("Manual price"); }} /></label>
          </section>

          <section className="recent-section">
            <div className="section-heading"><div><p className="eyebrow">ACTIVITY</p><h2>Recent movements</h2></div><button className="text-button" onClick={() => setView("ledger")}>View ledger →</button></div>
            {sortedTransactions.slice(0, 3).length ? sortedTransactions.slice(0, 3).map((item) => <TransactionRow item={item} line={lineMap.get(item.id)} key={item.id} onClick={() => editTransaction(item)} />) : <EmptyLedger onAdd={() => openAdd("buy")} />}
          </section>
        </div>
      )}

      {view === "add" && (
        <div className="screen entry-screen">
          <div className="entry-heading"><button className="back-button" onClick={() => setView("overview")}>←</button><div><p className="eyebrow">{editingId ? "EDIT MOVEMENT" : "NEW MOVEMENT"}</p><h1>{editingId ? "Update transaction" : "Log a transaction"}</h1></div></div>
          <form className="entry-card" onSubmit={saveTransaction}>
            <div className="segmented" aria-label="Transaction type">
              <button type="button" className={entryType === "buy" ? "selected buy" : ""} onClick={() => setEntryType("buy")}>Buy</button>
              <button type="button" className={entryType === "sell" ? "selected sell" : ""} onClick={() => setEntryType("sell")}>Sell</button>
            </div>

            <fieldset className="asset-picker"><legend>Asset</legend>{ASSETS.map((item) => <button type="button" key={item} className={asset === item ? "selected" : ""} onClick={() => chooseAsset(item)}><span className={`coin small ${item.toLowerCase()}`}>{item === "ETH" ? "Ξ" : "₮"}</span>{item}</button>)}</fieldset>

            <label className="amount-field"><span>USD amount</span><div><b>$</b><input autoFocus inputMode="decimal" type="number" min="0" step="any" placeholder="0.00" value={usdAmount} onChange={(event) => setUsdAmount(event.target.value)} required /></div></label>

            <label className="standard-field"><span>Execution rate <small>USD per {asset}</small></span><div className="prefix-input"><b>$</b><input inputMode="decimal" type="number" min="0" step="any" placeholder={asset === "USDT" ? "1.00" : "0.00"} value={rate} onChange={(event) => setRate(event.target.value)} required /></div></label>

            <div className="quantity-preview"><span>You {entryType === "buy" ? "receive" : "sold"}</span><strong>≈ {quantity(computedQuantity, asset)}</strong></div>

            <div className="date-grid">
              <label className="standard-field"><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
              <label className="standard-field"><span>Time</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></label>
            </div>
            <label className="standard-field"><span>Note <small>optional</small></span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Binance spot" maxLength={120} /></label>

            <button className={`primary-action ${entryType}`} type="submit">{editingId ? "Save changes" : `Add ${entryType}`} <span>→</span></button>
            {editingId && <button className="delete-button" type="button" onClick={deleteTransaction}>Delete transaction</button>}
          </form>
        </div>
      )}

      {view === "ledger" && (
        <div className="screen ledger-screen">
          <div className="page-heading"><p className="eyebrow">HISTORY</p><h1>Transaction ledger</h1><p>Every movement, with gains calculated using weighted-average cost.</p></div>
          <div className="filter-row">{(["ALL", "ETH", "USDT"] as const).map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item === "ALL" ? "All movements" : item}</button>)}</div>
          <section className="ledger-list">
            {sortedTransactions.length ? sortedTransactions.map((item) => <TransactionRow item={item} line={lineMap.get(item.id)} key={item.id} onClick={() => editTransaction(item)} />) : <EmptyLedger onAdd={() => openAdd("buy")} />}
          </section>
        </div>
      )}

      {view === "settings" && (
        <div className="screen settings-screen">
          <div className="page-heading"><p className="eyebrow">DATA</p><h1>Backup & export</h1><p>Your ledger stays in this browser. Keep a backup before clearing site data or changing phones.</p></div>
          <section className="settings-card">
            <button onClick={exportCsv}><span className="settings-icon">CSV</span><div><strong>Export spreadsheet</strong><small>All transactions and realized gains</small></div><b>↓</b></button>
            <button onClick={exportBackup}><span className="settings-icon">JSON</span><div><strong>Download backup</strong><small>Ledger and reference prices</small></div><b>↓</b></button>
            <button onClick={() => importRef.current?.click()}><span className="settings-icon">UP</span><div><strong>Restore backup</strong><small>Import a previous JSON backup</small></div><b>↑</b></button>
            <input ref={importRef} hidden type="file" accept="application/json" onChange={(event) => { importBackup(event.target.files?.[0]); event.target.value = ""; }} />
          </section>
          <aside className="privacy-note"><span>✓</span><div><strong>Private by default</strong><p>No Binance credentials are stored. Your transaction ledger remains on this device unless you export it.</p></div></aside>
        </div>
      )}

      <nav className="bottom-nav" aria-label="Main navigation">
        <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}><span>⌂</span>Overview</button>
        <button className={view === "ledger" ? "active" : ""} onClick={() => setView("ledger")}><span>≡</span>Ledger</button>
        <button className="add-nav" onClick={() => openAdd("buy")} aria-label="Add transaction"><span>＋</span></button>
        <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><span>↓</span>Data</button>
      </nav>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function TransactionRow({ item, line, onClick }: { item: InvestmentTransaction; line?: LedgerLine; onClick: () => void }) {
  return (
    <button className="transaction-row" onClick={onClick}>
      <span className={`movement-icon ${item.type}`}>{item.type === "buy" ? "↙" : "↗"}</span>
      <span className="transaction-main"><strong>{item.type === "buy" ? "Bought" : "Sold"} {item.asset}</strong><small>{new Date(`${item.date}T${item.time}`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {money.format(item.rate)} / {item.asset}</small></span>
      <span className="transaction-value"><strong>{item.type === "buy" ? "−" : "+"}{money.format(item.usdAmount)}</strong>{line?.realizedGain !== null && line?.realizedGain !== undefined ? <small className={line.realizedGain >= 0 ? "gain" : "loss"}>{signedMoney(line.realizedGain)} · {percent(line.realizedPercent || 0)}</small> : <small>{quantity(item.quantity, item.asset)}</small>}</span>
    </button>
  );
}

function EmptyLedger({ onAdd }: { onAdd: () => void }) {
  return <div className="empty-state"><span>↙</span><strong>Your first movement starts here</strong><p>Add an ETH or USDT buy to begin calculating your position.</p><button onClick={onAdd}>Add a buy</button></div>;
}
