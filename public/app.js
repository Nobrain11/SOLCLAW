const state = {
  view: 'discover',
  history: [],
  buySol: 0.1,
  paper: true,
  ref: null,
  selectedMint: null,
  token: null,
  config: { appUrl: '', trendingRefreshMs: 10000 },
  busy: false,
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function fmtUsd(n, d = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (Math.abs(n) >= 1) return `$${n.toFixed(d)}`;
  return `$${Number(n).toPrecision(4)}`;
}
function fmtPct(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  return res.json();
}

function showView(name, { push = true, title } = {}) {
  if (push && state.view && state.view !== name) {
    state.history.push(state.view);
    if (state.history.length > 20) state.history.shift();
  }
  state.view = name;
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  $$('.nav-item').forEach((b) => {
    const isToken = name === 'token';
    b.classList.toggle('active', !isToken && b.dataset.view === name);
  });
  const back = $('#btn-back');
  if (back) {
    const canBack = state.history.length > 0 || name === 'token';
    back.classList.toggle('hidden', !canBack);
  }
  const titles = {
    discover: 'SOL CLAW',
    pulse: 'Pulse',
    tracker: 'Tracker',
    portfolio: 'Portfolio',
    settings: 'Settings',
    token: title || state.token?.symbol || 'Token',
  };
  const tt = $('#top-title');
  if (tt) tt.textContent = titles[name] || 'SOL CLAW';
  if (name === 'portfolio') refreshPortfolio();
  if (name === 'discover') refreshTrending();
  if (name === 'pulse') refreshPulse();
}

function goBack() {
  if (state.view === 'token' && state.history.length === 0) {
    showView('discover', { push: false });
    history.replaceState(null, '', '/');
    return;
  }
  const prev = state.history.pop() || 'discover';
  showView(prev, { push: false });
  if (prev !== 'token') history.replaceState(null, '', '/');
}

async function ensureSession() {
  try {
    const j = await api('/api/session', {
      method: 'POST',
      body: JSON.stringify({ ref: state.ref }),
    });
    if (j.ok) {
      state.paper = j.paper;
      state.buySol = j.buySize || state.buySol;
    }
  } catch {}
}

async function refreshSolPrice() {
  try {
    const j = await api('/api/sol-price');
    if (!j.ok) return;
    const el = $('#sol-price');
    if (el) {
      el.textContent = j.header || '◎ —';
      el.style.color = (j.change24h ?? 0) >= 0 ? 'var(--green)' : 'var(--red)';
    }
  } catch {}
}

function renderTokenRows(listEl, tokens) {
  if (!listEl) return;
  if (!tokens?.length) {
    listEl.innerHTML = `<p class="muted center">No live Solana pairs right now.</p>`;
    return;
  }
  listEl.innerHTML = tokens
    .map((t) => {
      const ch = t.change24h;
      const up = ch == null ? '' : ch >= 0 ? 'up' : 'down';
      const ico = (t.symbol || '?').slice(0, 2).toUpperCase();
      return `<button type="button" class="token-row" data-mint="${t.mint}">
        <div class="tok-ico">${escapeHtml(ico)}</div>
        <div>
          <div class="tok-name">$${escapeHtml(t.symbol)} · ${escapeHtml(t.name)}</div>
          <div class="tok-meta">${escapeHtml(t.dex || t.source)} · Vol ${fmtUsd(t.volume24h)}</div>
        </div>
        <div class="tok-chg ${up}">${fmtPct(ch)}</div>
        <div class="tok-mc">${fmtUsd(t.marketCap)}<small>Liq ${fmtUsd(t.liquidity)}</small></div>
      </button>`;
    })
    .join('');
  listEl.querySelectorAll('.token-row').forEach((b) =>
    b.addEventListener('click', () => openToken(b.dataset.mint))
  );
}

async function refreshTrending() {
  try {
    const j = await api('/api/trending?limit=20&refresh=1');
    renderTokenRows($('#token-list'), j.tokens || []);
  } catch {
    const el = $('#token-list');
    if (el) el.innerHTML = `<p class="muted center">Trending unavailable</p>`;
  }
}

async function refreshPulse() {
  try {
    const j = await api('/api/trending?limit=24&refresh=1');
    const toks = (j.tokens || []).slice().sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
    renderTokenRows($('#pulse-list'), toks);
  } catch {
    const el = $('#pulse-list');
    if (el) el.innerHTML = `<p class="muted center">Pulse unavailable</p>`;
  }
}

async function openToken(mint) {
  if (!mint) return;
  state.selectedMint = mint;
  history.replaceState(null, '', `/trade/${mint}${state.ref ? `?ref=${encodeURIComponent(state.ref)}` : ''}`);
  showView('token', { push: true });
  const st = $('#trade-status');
  if (st) st.textContent = 'Loading…';
  try {
    const j = await api(`/api/token/${encodeURIComponent(mint)}`);
    if (!j.ok) throw new Error(j.error || 'failed');
    state.token = j;
    showView('token', { push: false, title: j.symbol });
    $('#token-header').innerHTML = `
      <div class="sym">$${escapeHtml(j.symbol)} · ${escapeHtml(j.name)}</div>
      <div class="ca">${escapeHtml(j.mint)}</div>
      <div class="muted" style="margin-top:4px">Safety: ${escapeHtml(j.safetyLevel)} · ${escapeHtml(j.dexId || 'Solana')}</div>`;
    $('#token-metrics').innerHTML = `
      <div class="metric-card"><span>Price</span><strong>${fmtUsd(j.priceUsd, 8)}</strong></div>
      <div class="metric-card"><span>Mkt Cap</span><strong>${fmtUsd(j.marketCap)}</strong></div>
      <div class="metric-card"><span>Liquidity</span><strong>${fmtUsd(j.liquidity)}</strong></div>
      <div class="metric-card"><span>24h</span><strong>${fmtPct(j.change24h)}</strong></div>
      <div class="metric-card"><span>Volume</span><strong>${fmtUsd(j.volume24h)}</strong></div>
      <div class="metric-card"><span>Mode</span><strong>${state.paper ? 'PAPER' : 'LIVE'}</strong></div>`;
    const frame = $('#chart-frame');
    if (frame) {
      frame.src = `https://dexscreener.com/solana/${mint}?embed=1&theme=dark&trades=0&info=0`;
    }
    if (st) st.textContent = '';
  } catch (e) {
    $('#token-header').innerHTML = `<p class="muted">Could not load token</p>`;
    if (st) st.textContent = e.message || 'failed';
  }
}

async function refreshPortfolio() {
  try {
    const j = await api('/api/portfolio');
    if (!j.ok) return;
    state.paper = j.paper;
    const sol = j.balanceSol ?? 0;
    $('#pf-sol').textContent = `${sol.toFixed(4)} SOL`;
    $('#pf-value').textContent = fmtUsd(sol * (state._solUsd || 0));
    $('#pf-r').textContent = `${(j.realizedPnl ?? 0) >= 0 ? '+' : ''}${(j.realizedPnl ?? 0).toFixed(4)} SOL`;
    $('#pf-open').textContent = String(j.openPositions ?? 0);
    $('#pf-addr').textContent = j.address || 'No wallet — create or import';
    const tp = $('#btn-toggle-paper');
    if (tp) tp.textContent = state.paper ? 'Paper ON' : 'Live ON';
    const pos = await api('/api/positions');
    const el = $('#positions-list');
    if (!pos.positions?.length) {
      el.innerHTML = `<p class="muted center">No open positions</p>`;
      return;
    }
    el.innerHTML = pos.positions
      .map(
        (p) => `<button type="button" class="token-row" data-mint="${p.mint}">
        <div class="tok-ico">${escapeHtml((p.symbol || '?').slice(0, 2))}</div>
        <div><div class="tok-name">$${escapeHtml(p.symbol)}</div>
        <div class="tok-meta">${p.mode}</div></div>
        <div class="tok-chg ${p.unrealizedPnl >= 0 ? 'up' : 'down'}">${p.unrealizedPnl >= 0 ? '+' : ''}${Number(p.unrealizedPnl).toFixed(4)}</div>
        <div class="tok-mc">${fmtUsd(p.currentPrice, 6)}</div>
      </button>`
      )
      .join('');
    el.querySelectorAll('.token-row').forEach((b) =>
      b.addEventListener('click', () => openToken(b.dataset.mint))
    );
  } catch {}
}

async function runTrade(side) {
  if (state.busy || !state.selectedMint) return;
  const mode = state.paper ? 'PAPER' : 'LIVE';
  if (!confirm(side === 'BUY' ? `Confirm ${mode} BUY ${state.buySol} SOL?` : `Confirm ${mode} SELL 100%?`)) return;
  state.busy = true;
  const st = $('#trade-status');
  if (st) st.textContent = 'SUBMITTING…';
  try {
    const j = await api('/api/trade', {
      method: 'POST',
      body: JSON.stringify({
        mint: state.selectedMint,
        side,
        confirm: true,
        amountSol: side === 'BUY' ? state.buySol : undefined,
        percentage: side === 'SELL' ? 100 : undefined,
      }),
    });
    if (j.ok && j.state === 'CONFIRMED') {
      st.textContent = `CONFIRMED ${j.mode}${j.signature ? ' · ' + String(j.signature).slice(0, 12) + '…' : ''}`;
      refreshPortfolio();
    } else st.textContent = j.error || j.state || 'FAILED';
  } catch (e) {
    st.textContent = e.message || 'error';
  } finally {
    state.busy = false;
  }
}

function bindUi() {
  $('#btn-back')?.addEventListener('click', goBack);
  $$('.nav-item').forEach((b) =>
    b.addEventListener('click', () => {
      state.history = [];
      showView(b.dataset.view, { push: false });
      history.replaceState(null, '', '/');
    })
  );
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
  $('#btn-sell')?.addEventListener('click', () => runTrade('SELL'));
  $('#btn-refresh-token')?.addEventListener('click', () => {
    if (state.selectedMint) openToken(state.selectedMint);
  });
  $('#btn-share')?.addEventListener('click', async () => {
    if (!state.selectedMint) return;
    const base = state.config.appUrl || location.origin;
    const url = `${base}/trade/${state.selectedMint}?ref=${encodeURIComponent(state.ref || 'guest')}`;
    try {
      await navigator.clipboard.writeText(url);
      $('#trade-status').textContent = 'Share link copied';
    } catch {
      prompt('Share', url);
    }
  });
  $('#btn-create-wallet')?.addEventListener('click', async () => {
    const j = await api('/api/wallet/create', { method: 'POST', body: '{}' });
    alert(j.ok ? `Wallet: ${j.publicKey}` : j.error || 'failed');
    refreshPortfolio();
  });
  $('#btn-import-wallet')?.addEventListener('click', async () => {
    const secret = prompt('Paste base58 private key (server-side only)');
    if (!secret) return;
    const j = await api('/api/wallet/import', {
      method: 'POST',
      body: JSON.stringify({ secret }),
    });
    alert(j.ok ? `Imported: ${j.publicKey}` : j.error || 'failed');
    refreshPortfolio();
  });
  $('#btn-toggle-paper')?.addEventListener('click', async () => {
    await api('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ paper: !state.paper }),
    });
    state.paper = !state.paper;
    refreshPortfolio();
  });
  $('#btn-deposit')?.addEventListener('click', () => showView('portfolio', { push: true }));
  $('#btn-save-set')?.addEventListener('click', async () => {
    const buy = Number($('#set-buy').value);
    if (buy > 0) {
      state.buySol = buy;
      await api('/api/settings', { method: 'POST', body: JSON.stringify({ buySize: buy }) });
    }
    alert('Saved');
  });
  $('#btn-copy-ref')?.addEventListener('click', async () => {
    const id = localStorage.getItem('solclaw_uid') || crypto.randomUUID().slice(0, 8);
    localStorage.setItem('solclaw_uid', id);
    const url = `${state.config.appUrl || location.origin}/?ref=${id}`;
    try {
      await navigator.clipboard.writeText(url);
      alert('Referral link copied');
    } catch {
      prompt('Ref', url);
    }
  });
  $('#btn-add-track')?.addEventListener('click', () => {
    const v = $('#track-input').value.trim();
    if (!v) return;
    const key = 'solclaw_tracks';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    if (!arr.includes(v)) arr.push(v);
    localStorage.setItem(key, JSON.stringify(arr));
    renderTracks();
  });
}

function renderTracks() {
  const arr = JSON.parse(localStorage.getItem('solclaw_tracks') || '[]');
  const el = $('#track-list');
  if (!el) return;
  if (!arr.length) {
    el.innerHTML = `<p class="muted center">No wallets tracked yet</p>`;
    return;
  }
  el.innerHTML = arr
    .map(
      (a) => `<div class="token-row"><div class="tok-ico">◎</div>
      <div><div class="tok-name">Tracked</div><div class="tok-meta">${escapeHtml(a)}</div></div></div>`
    )
    .join('');
}

function captureRoute() {
  const u = new URL(location.href);
  const ref = u.searchParams.get('ref');
  if (ref) state.ref = ref;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts[0] === 'trade' && parts[1]) openToken(parts[1]);
}

async function boot() {
  bindUi();
  captureRoute();
  try {
    const c = await api('/api/config');
    if (c.ok) state.config = c;
  } catch {}
  await ensureSession();
  await refreshSolPrice();
  try {
    const sp = await api('/api/sol-price');
    if (sp.ok) state._solUsd = sp.priceUsd;
  } catch {}
  if (state.view === 'discover') await refreshTrending();
  renderTracks();
  setInterval(refreshSolPrice, 15000);
  setInterval(() => {
    if (state.view === 'discover') refreshTrending();
    if (state.view === 'pulse') refreshPulse();
  }, 10000);
}

boot();
