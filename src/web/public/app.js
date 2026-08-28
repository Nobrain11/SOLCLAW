const state = {
  view: 'terminal',
  sol: null,
  trending: [],
  selectedMint: null,
  token: null,
  buySol: 0.05,
  ref: null,
  paper: true,
  hasWallet: false,
  config: { appUrl: '', trendingRefreshMs: 10000 },
  busy: false,
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function fmtUsd(n, d = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(d)}`;
  return `$${Number(n).toPrecision(4)}`;
}
function fmtPct(n) {
  if (n == null || Number.isNaN(n)) return '';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  return res.json();
}

async function loadConfig() {
  try {
    const j = await api('/api/config');
    if (j.ok) state.config = j;
  } catch {}
}

async function ensureSession() {
  try {
    const j = await api('/api/session', {
      method: 'POST',
      body: JSON.stringify({ ref: state.ref }),
    });
    if (j.ok) {
      state.paper = j.paper;
      state.hasWallet = j.hasWallet;
      state.buySol = j.buySize || state.buySol;
    }
  } catch {}
}

async function refreshPortfolio() {
  try {
    const j = await api('/api/portfolio');
    if (!j.ok) return;
    state.hasWallet = j.hasWallet;
    state.paper = j.paper;
    const bal = $('#portfolio-sol');
    if (bal) bal.textContent = `${(j.balanceSol ?? 0).toFixed(4)} SOL`;
    const oc = $('#open-count');
    if (oc) oc.textContent = String(j.openPositions ?? 0);
    const pnl = $('#pnl-total');
    if (pnl) {
      const v = j.realizedPnl ?? 0;
      pnl.textContent = `${v >= 0 ? '+' : ''}${v.toFixed(4)} SOL`;
      pnl.classList.toggle('pos', v >= 0);
      pnl.classList.toggle('neg', v < 0);
    }
    const ws = $('#wallet-status');
    if (ws) {
      if (j.address) {
        ws.innerHTML = `<p class="muted">Connected</p><p style="font-family:var(--mono);font-size:0.72rem;word-break:break-all">${escapeHtml(j.address)}</p>
          <p class="muted">${state.paper ? 'Paper mode ON' : 'Live mode'}</p>
          <button type="button" id="btn-toggle-paper" class="btn ghost">${state.paper ? 'Switch to LIVE' : 'Switch to PAPER'}</button>`;
        document.getElementById('btn-toggle-paper')?.addEventListener('click', togglePaper);
      } else {
        ws.innerHTML = `<p class="muted">No wallet</p>
          <button type="button" id="btn-create-wallet" class="btn primary">Create wallet</button>
          <button type="button" id="btn-import-wallet" class="btn ghost">Import key</button>`;
        document.getElementById('btn-create-wallet')?.addEventListener('click', createWallet);
        document.getElementById('btn-import-wallet')?.addEventListener('click', importWallet);
      }
    }
  } catch {}
}

async function togglePaper() {
  const next = !state.paper;
  await api('/api/settings', { method: 'POST', body: JSON.stringify({ paper: next }) });
  state.paper = next;
  await refreshPortfolio();
}

async function createWallet() {
  const st = $('#trade-status');
  if (st) st.textContent = 'Creating wallet…';
  const j = await api('/api/wallet/create', { method: 'POST', body: '{}' });
  if (j.ok) {
    if (st) st.textContent = j.existing ? 'Wallet already linked' : 'Wallet created — fund SOL for live trades';
    await refreshPortfolio();
  } else if (st) st.textContent = j.error || 'Create failed';
}

async function importWallet() {
  const secret = prompt('Paste private key (base58). Sent only to your server.');
  if (!secret) return;
  const j = await api('/api/wallet/import', {
    method: 'POST',
    body: JSON.stringify({ secret }),
  });
  const st = $('#trade-status');
  if (j.ok) {
    if (st) st.textContent = 'Wallet imported';
    await refreshPortfolio();
  } else if (st) st.textContent = j.error || 'Import failed';
}

async function refreshSolPrice() {
  try {
    const j = await api('/api/sol-price');
    if (!j.ok) return;
    const el = $('#sol-price');
    if (el) {
      el.textContent = j.header || '◎ SOL —';
      el.style.color = (j.change24h ?? 0) >= 0 ? 'var(--green)' : 'var(--red)';
    }
  } catch {}
}

async function refreshTrending(force = false) {
  const list = $('#trending-list');
  try {
    const j = await api(`/api/trending?limit=16${force ? '&refresh=1' : ''}`);
    if (!j.ok || !j.tokens?.length) {
      if (list) list.innerHTML = `<p class="muted">No live trending data right now.</p>`;
      return;
    }
    state.trending = j.tokens;
    list.innerHTML = j.tokens
      .map((t, i) => {
        const ch = t.change24h;
        const chClass = ch == null ? '' : ch >= 0 ? 'chg-up' : 'chg-down';
        return `<button type="button" class="trend-item" data-mint="${t.mint}">
          <div class="top"><span>${i + 1}. $${escapeHtml(t.symbol)} · ${escapeHtml(t.name)}</span>
          <span class="${chClass}">${fmtPct(ch) || fmtUsd(t.priceUsd, 6)}</span></div>
          <div class="meta">MC ${fmtUsd(t.marketCap)} · Liq ${fmtUsd(t.liquidity)} · Vol ${fmtUsd(t.volume24h)} · ${escapeHtml(t.dex || t.source)}</div>
        </button>`;
      })
      .join('');
    list.querySelectorAll('.trend-item').forEach((btn) =>
      btn.addEventListener('click', () => selectMint(btn.dataset.mint))
    );
    const clock = $('#trend-clock');
    if (clock) clock.textContent = `live · ${new Date().toLocaleTimeString()}`;
  } catch {
    if (list) list.innerHTML = `<p class="muted">Trending feed temporarily unavailable.</p>`;
  }
}

async function selectMint(mint) {
  if (!mint) return;
  state.selectedMint = mint;
  const input = $('#mint-input');
  if (input) input.value = mint;
  history.replaceState(
    null,
    '',
    `/trade/${mint}${state.ref ? `?ref=${encodeURIComponent(state.ref)}` : ''}`
  );
  await loadToken(mint);
}

async function loadToken(mint) {
  const card = $('#token-card');
  const controls = $('#trade-controls');
  const status = $('#trade-status');
  if (status) status.textContent = 'Loading live token data…';
  try {
    const j = await api(`/api/token/${encodeURIComponent(mint)}`);
    if (!j.ok) throw new Error(j.error || 'failed');
    state.token = j;
    card.classList.remove('hidden');
    card.innerHTML = `<div class="sym">$${escapeHtml(j.symbol)} · ${escapeHtml(j.name)}</div>
      <div class="ca">${escapeHtml(j.mint)}</div>
      <div class="stats">
        <div><span>Price</span><strong>${fmtUsd(j.priceUsd, 8)}</strong></div>
        <div><span>Market Cap</span><strong>${fmtUsd(j.marketCap)}</strong></div>
        <div><span>Liquidity</span><strong>${fmtUsd(j.liquidity)}</strong></div>
        <div><span>24h</span><strong>${fmtPct(j.change24h) || '—'}</strong></div>
        <div><span>Volume</span><strong>${fmtUsd(j.volume24h)}</strong></div>
        <div><span>Safety</span><strong>${escapeHtml(j.safetyLevel)}</strong></div>
      </div>`;
    controls?.classList.remove('hidden');
    if (status)
      status.textContent = `Updated ${new Date().toLocaleTimeString()} · ${state.paper ? 'PAPER' : 'LIVE'}`;
  } catch {
    card.classList.remove('hidden');
    card.innerHTML = `<p class="muted">Could not load token.</p>`;
    if (status) status.textContent = 'Scan failed';
  }
}

async function refreshPositionsView() {
  const el = $('#positions-list');
  if (!el) return;
  try {
    const j = await api('/api/positions');
    if (!j.positions?.length) {
      el.innerHTML = `<p class="muted">No open positions.</p>`;
      return;
    }
    el.innerHTML = j.positions
      .map((p) => {
        const sign = p.unrealizedPnl >= 0 ? '+' : '';
        return `<div class="token-card" style="margin-bottom:8px">
          <strong>$${escapeHtml(p.symbol)}</strong> [${p.mode}]
          <div style="font-family:var(--mono);font-size:0.75rem;color:var(--muted)">
            Entry ${fmtUsd(p.entryPrice, 8)} → ${fmtUsd(p.currentPrice, 8)}<br/>
            PnL ${sign}${Number(p.unrealizedPnl).toFixed(4)} SOL
          </div>
          <button type="button" class="btn sell pos-sell" data-mint="${p.mint}">SELL 100%</button>
        </div>`;
      })
      .join('');
    el.querySelectorAll('.pos-sell').forEach((b) =>
      b.addEventListener('click', () => runTrade('SELL', b.dataset.mint, 100))
    );
  } catch {
    el.innerHTML = `<p class="muted">Could not load positions.</p>`;
  }
}

async function runTrade(side, mint, percentage) {
  if (state.busy) return;
  mint = mint || state.selectedMint;
  const st = $('#trade-status');
  if (!mint) {
    if (st) st.textContent = 'Select a token first';
    return;
  }
  const amount = state.buySol;
  const mode = state.paper ? 'PAPER' : 'LIVE';
  const msg =
    side === 'BUY'
      ? `Confirm ${mode} BUY ${amount} SOL of ${state.token?.symbol || mint.slice(0, 6)}?`
      : `Confirm ${mode} SELL ${percentage ?? 100}%?`;
  if (!window.confirm(msg)) return;

  state.busy = true;
  if (st) st.textContent = 'PREPARING…';
  try {
    if (st) st.textContent = 'SUBMITTING…';
    const body = {
      mint,
      side,
      confirm: true,
      amountSol: side === 'BUY' ? amount : undefined,
      percentage: side === 'SELL' ? percentage ?? 100 : undefined,
    };
    const j = await api('/api/trade', { method: 'POST', body: JSON.stringify(body) });
    if (j.ok && j.state === 'CONFIRMED') {
      if (st) {
        st.textContent =
          `CONFIRMED ${j.mode}` +
          (j.signature ? ` · ${String(j.signature).slice(0, 16)}…` : '') +
          (j.fee?.line ? ` · ${j.fee.line}` : '');
      }
      await refreshPortfolio();
      await refreshPositionsView();
    } else {
      if (st) st.textContent = `${j.error || j.state || 'FAILED'}`;
    }
  } catch (e) {
    if (st) st.textContent = e.message || 'network error';
  } finally {
    state.busy = false;
  }
}

function setView(name) {
  state.view = name;
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'positions') refreshPositionsView();
  if (name === 'wallet') refreshPortfolio();
}

function captureRefFromUrl() {
  const u = new URL(window.location.href);
  const ref = u.searchParams.get('ref');
  if (ref) {
    state.ref = ref;
    fetch(`/api/ref/capture?ref=${encodeURIComponent(ref)}`).catch(() => {});
  }
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts[0] === 'trade' && parts[1]) selectMint(parts[1]);
}

function bindUi() {
  $$('.nav-btn').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#btn-scan')?.addEventListener('click', () => {
    const m = $('#mint-input')?.value?.trim();
    if (m) selectMint(m);
  });
  $('#btn-clear')?.addEventListener('click', () => {
    $('#mint-input').value = '';
    state.selectedMint = null;
    state.token = null;
    $('#token-card')?.classList.add('hidden');
    $('#trade-controls')?.classList.add('hidden');
    history.replaceState(null, '', '/');
  });
  $('#btn-refresh-token')?.addEventListener('click', () => {
    if (state.selectedMint) loadToken(state.selectedMint);
  });
  $$('.amt').forEach((b) =>
    b.addEventListener('click', () => {
      $$('.amt').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state.buySol = Number(b.dataset.sol);
      const c = $('#custom-sol');
      if (c) c.value = String(state.buySol);
    })
  );
  $('#custom-sol')?.addEventListener('change', (e) => {
    const v = Number(e.target.value);
    if (v > 0) state.buySol = v;
  });
  $('#btn-buy')?.addEventListener('click', () => runTrade('BUY'));
  $('#btn-sell')?.addEventListener('click', () => runTrade('SELL', state.selectedMint, 100));
  $('#btn-share')?.addEventListener('click', async () => {
    if (!state.selectedMint) return;
    const base = state.config.appUrl || window.location.origin;
    const ref = state.ref || localStorage.getItem('solclaw_uid') || 'guest';
    const url = `${base}/trade/${state.selectedMint}?ref=${encodeURIComponent(ref)}`;
    try {
      await navigator.clipboard.writeText(url);
      const st = $('#trade-status');
      if (st) st.textContent = 'Share link copied';
    } catch {
      prompt('Copy share link', url);
    }
  });
  $('#btn-copy-ref')?.addEventListener('click', async () => {
    const base = state.config.appUrl || window.location.origin;
    const id = localStorage.getItem('solclaw_uid') || crypto.randomUUID().slice(0, 8);
    localStorage.setItem('solclaw_uid', id);
    const url = `${base}/?ref=${encodeURIComponent(id)}`;
    try {
      await navigator.clipboard.writeText(url);
      alert('Referral link copied (optional)');
    } catch {
      prompt('Referral link', url);
    }
  });
  $('#btn-connect')?.addEventListener('click', () => setView('wallet'));
  $('#btn-wallet-refresh')?.addEventListener('click', () => refreshPortfolio());
}

async function boot() {
  captureRefFromUrl();
  bindUi();
  await loadConfig();
  await ensureSession();
  await refreshSolPrice();
  await refreshPortfolio();
  await refreshTrending(true);
  setInterval(refreshSolPrice, 15000);
  setInterval(() => refreshTrending(false), state.config.trendingRefreshMs || 10000);
  setInterval(refreshPortfolio, 30000);
  setInterval(() => {
    const el = $('#footer-clock');
    if (el) el.textContent = new Date().toLocaleString();
  }, 1000);
}

boot();
