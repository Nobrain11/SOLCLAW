/**
 * SOL CLAW terminal
 */
const state = (window.state = {
  tab: 'trending',
  tf: '5m',
  view: 'discover',
  tokens: [],
  loading: false,
  wallet: null,
  buyPreset: Number(localStorage.getItem('buyPreset') || 0.1),
  paper: true,
  hasWallet: false,
  busy: false,
  watching: JSON.parse(localStorage.getItem('watching') || '[]'),
});

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

function fmtUsd(n) {
  if (n == null || Number.isNaN(n)) return '—';
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (Math.abs(n) >= 1) return `$${n.toFixed(2)}`;
  return `$${Number(n).toPrecision(4)}`;
}
function fmtAge(min) {
  if (min == null) return '—';
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.floor(min / 60)}h`;
  return `${Math.floor(min / 1440)}d`;
}
function shortAddr(a) {
  if (!a || a.length < 8) return a || '—';
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}
function escapeAttr(s) {
  return String(s ?? '').replace(/&/g, '&').replace(/"/g, '"').replace(/</g, '<');
}
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>');
}

function sparkSVG(pts, up, w = 72, h = 28) {
  if (!pts || pts.length < 2) {
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const pad = 2;
  const coords = pts.map((p, i) => {
    const x = pad + (i / (pts.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const color = up ? '#22c55e' : '#ef4444';
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <polyline fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"
      stroke-linejoin="round" points="${coords.join(' ')}"/></svg>`;
}

function logoHTML(t) {
  const letter = (t.symbol || '?').slice(0, 2).toUpperCase();
  if (t.image) {
    return `<img class="token-logo" src="${escapeAttr(t.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"
      onerror="this.outerHTML='<div class=\\'token-logo fallback\\'>${letter}</div>'" />`;
  }
  return `<div class="token-logo fallback">${letter}</div>`;
}

function skeletons(n = 8) {
  return Array.from({ length: n }, () => `
    <div class="skel-row">
      <div class="skel skel-logo"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:8px">
        <div class="skel" style="width:40%"></div>
        <div class="skel" style="width:70%"></div>
      </div>
      <div class="skel" style="width:72px;height:28px"></div>
    </div>`).join('');
}

function rowHTML(t) {
  const up = (t.changePct ?? 0) >= 0;
  const ch = t.changePct != null ? `${up ? '+' : ''}${t.changePct.toFixed(1)}%` : '—';
  const buys = t.buys ?? 0;
  const sells = t.sells ?? 0;
  const risk = t.safety?.risk || 'med';
  const score = t.safety?.score ?? '—';
  return `
  <article class="token-row" data-mint="${escapeAttr(t.mint)}">
    <div class="main">
      ${logoHTML(t)}
      <div class="token-meta">
        <div class="token-title">
          <span class="sym">$${escapeHtml(t.symbol)}</span>
          <span class="name">${escapeHtml(t.name)}</span>
        </div>
        <div class="token-sub mobile-metrics">
          <span>MC <b>${fmtUsd(t.marketCap)}</b></span>
          <span>Liq <b>${fmtUsd(t.liquidity)}</b></span>
          <span class="${up ? 'up' : 'down'}">${ch}</span>
          <span>${fmtAge(t.ageMin)}</span>
        </div>
      </div>
    </div>
    <div class="cell desktop-metric muted">${fmtAge(t.ageMin)}</div>
    <div class="cell desktop-metric">${fmtUsd(t.marketCap)}</div>
    <div class="cell desktop-metric">${fmtUsd(t.liquidity)}</div>
    <div class="cell desktop-metric">${fmtUsd(t.volume)}</div>
    <div class="cell desktop-metric"><span class="up">${buys}</span>/<span class="down">${sells}</span></div>
    <div class="row-right">
      ${sparkSVG(t.sparkline, up)}
      <div class="badges cell">
        <span class="badge ${risk}">${score}%</span>
        ${t.safety?.paid ? '<span class="badge paid">PAID</span>' : '<span class="badge">UNPAID</span>'}
      </div>
      <button type="button" class="btn buy" data-buy="${escapeAttr(t.mint)}">Buy ${state.buyPreset}</button>
    </div>
  </article>`;
}

function renderList(el, tokens) {
  if (!el) return;
  if (!tokens.length) {
    el.innerHTML = `<div class="empty">No tokens right now. Tap ↻</div>`;
    return;
  }
  el.innerHTML = tokens.map(rowHTML).join('');
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  return res.json();
}

async function loadTerminal() {
  const list = $('#token-list');
  const pulse = $('#pulse-list');
  if (list) list.innerHTML = skeletons();
  try {
    let url = `/api/terminal?tab=${encodeURIComponent(state.tab)}&tf=${state.tf}&limit=20`;
    if (state.tab === 'watching') url = `/api/terminal?tab=trending&limit=30`;
    const data = await api(url);
    let tokens = data.tokens || [];
    if (state.tab === 'watching') {
      tokens = tokens.filter((t) => state.watching.includes(t.mint));
    }
    state.tokens = tokens;
    if (list) renderList(list, tokens);
    if (pulse) renderList(pulse, tokens);
  } catch {
    if (list) list.innerHTML = `<div class="empty">Feed unavailable</div>`;
  }
}

async function loadSol() {
  try {
    const d = await api('/api/sol-price');
    if (!d.ok) return;
    const sign = (d.change24h ?? 0) >= 0 ? '▲' : '▼';
    const cls = (d.change24h ?? 0) >= 0 ? 'up' : 'down';
    const el = $('#sol-price');
    if (el) {
      el.innerHTML = `◎ SOL $${Number(d.priceUsd).toFixed(2)} <span class="${cls}">${sign}${Math.abs(d.change24h || 0).toFixed(2)}%</span>`;
    }
  } catch { /* */ }
}

/* FULL TOKEN TERMINAL */
window.openSheet = function openSheet(t) {
  const viewed = JSON.parse(localStorage.getItem('viewed') || '[]');
  if (!viewed.includes(t.mint)) {
    viewed.unshift(t.mint);
    localStorage.setItem('viewed', JSON.stringify(viewed.slice(0, 40)));
  }
  const up = (t.changePct ?? 0) >= 0;
  const mode = state.paper ? 'PAPER' : 'LIVE';
  const risk = t.safety?.risk || 'med';
  const score = t.safety?.score;
  const sec =
    risk === 'low'
      ? `<div class="sec-ok">Security ✓${score != null ? ' · ' + score + '%' : ''}</div>`
      : `<div class="sec-warn">Security · ${String(risk).toUpperCase()}${score != null ? ' · ' + score + '%' : ''}</div>`;
  const buys = t.buys ?? 0;
  const sells = t.sells ?? 0;
  const mint = escapeAttr(t.mint);

  $('#sheet-body').innerHTML = `
  <div class="term" data-mint="${mint}">
    <div class="term-top">
      <div class="term-token">
        <div class="main" style="margin-bottom:8px">
          ${logoHTML(t)}
          <div>
            <div class="sym">$${escapeHtml(t.symbol)}</div>
            <div class="muted sm">${escapeHtml(t.name)}</div>
          </div>
        </div>
        <div class="price ${up ? 'up' : 'down'}">${t.priceUsd != null ? '$' + Number(t.priceUsd).toPrecision(4) : '—'}</div>
        <div class="muted sm ${up ? 'up' : 'down'}">${t.changePct != null ? (up ? '+' : '') + Number(t.changePct).toFixed(1) + '%' : ''}</div>
        <div class="metrics">
          <div><span>MC</span><b>${fmtUsd(t.marketCap)}</b></div>
          <div><span>Liq</span><b>${fmtUsd(t.liquidity)}</b></div>
          <div><span>Vol</span><b>${fmtUsd(t.volume)}</b></div>
          <div><span>Age</span><b>${fmtAge(t.ageMin)}</b></div>
        </div>
        ${sec}
        <div class="muted sm" style="margin-top:8px;word-break:break-all"><code>${escapeHtml(t.mint)}</code></div>
      </div>
      <div class="term-chart">
        <div class="label">LIVE TREND</div>
        ${sparkSVG(t.sparkline, up, 280, 100).replace('class="spark"', 'class="spark spark-lg"')}
        <div class="muted sm" style="margin-top:8px">Buys <span class="up">${buys}</span> · Sells <span class="down">${sells}</span> · <b>${mode}</b></div>
      </div>
      <div class="term-trade">
        <div class="side-label">Buy</div>
        <div class="amt-grid">
          <button type="button" class="btn ghost" data-quick-buy="0.1" data-mint="${mint}">0.1</button>
          <button type="button" class="btn ghost" data-quick-buy="0.25" data-mint="${mint}">0.25</button>
          <button type="button" class="btn ghost" data-quick-buy="0.5" data-mint="${mint}">0.5</button>
          <button type="button" class="btn ghost" data-quick-buy="1" data-mint="${mint}">1 SOL</button>
        </div>
        <button type="button" class="btn buy-full" data-exec-buy="${mint}">BUY ${state.buyPreset} SOL</button>
        <div class="side-label" style="margin-top:4px">Sell</div>
        <div class="sell-pct">
          <button type="button" class="btn ghost" data-exec-sell-pct="25" data-mint="${mint}">25%</button>
          <button type="button" class="btn ghost" data-exec-sell-pct="50" data-mint="${mint}">50%</button>
          <button type="button" class="btn ghost" data-exec-sell-pct="75" data-mint="${mint}">75%</button>
          <button type="button" class="btn ghost" data-exec-sell-pct="100" data-mint="${mint}">100%</button>
        </div>
        <button type="button" class="btn sell-full" data-exec-sell="${mint}">SELL 100%</button>
        <p id="trade-status" class="term-status muted"></p>
      </div>
    </div>
    <div class="term-tabs">
      <button type="button" class="active">TRADES</button>
      <button type="button">ACTIVITY</button>
      <button type="button">HOLDERS</button>
      <button type="button">LIQUIDITY</button>
    </div>
    <div class="term-feed">
      <div class="feed-row"><span class="type-buy">BUY</span><span>${buys}</span><span>txns</span><span>${fmtUsd(t.volume)}</span><span class="muted">vol</span></div>
      <div class="feed-row"><span class="type-sell">SELL</span><span>${sells}</span><span>txns</span><span>${fmtUsd(t.liquidity)}</span><span class="muted">liq</span></div>
    </div>
    <div class="term-pos">
      <div class="muted sm">Position controls after fill</div>
      <div class="pos-actions" style="margin-top:8px">
        <button type="button" class="btn ghost" data-exec-sell-pct="25" data-mint="${mint}">SELL 25%</button>
        <button type="button" class="btn ghost" data-exec-sell-pct="50" data-mint="${mint}">SELL 50%</button>
        <button type="button" class="btn ghost" data-exec-sell-pct="100" data-mint="${mint}">SELL 100%</button>
        <a class="btn ghost" href="${escapeAttr(t.url || 'https://pump.fun/' + t.mint)}" target="_blank" rel="noopener">Open pump</a>
      </div>
    </div>
  </div>`;
  $('#sheet')?.classList.remove('hidden');
};

function closeSheet() {
  $('#sheet')?.classList.add('hidden');
}

window.runTrade = async function runTrade(side, mint, percentage) {
  if (state.busy || !mint) return;
  const mode = state.paper ? 'PAPER' : 'LIVE';
  if (!state.hasWallet && !state.paper) {
    alert('Create a wallet in Portfolio first (or keep Paper ON).');
    return;
  }
  const label =
    side === 'BUY'
      ? `Confirm ${mode} BUY ${state.buyPreset} SOL?`
      : `Confirm ${mode} SELL ${percentage ?? 100}%?`;
  if (!confirm(label)) return;
  state.busy = true;
  const st = $('#trade-status');
  if (st) st.textContent = 'SUBMITTING…';
  try {
    const body = {
      mint,
      side,
      confirm: true,
      amountSol: side === 'BUY' ? state.buyPreset : undefined,
      percentage: side === 'SELL' ? percentage ?? 100 : undefined,
    };
    const j = await api('/api/trade', { method: 'POST', body: JSON.stringify(body) });
    if (j.ok && (j.state === 'CONFIRMED' || j.state === 'FILLED')) {
      if (st) {
        st.textContent = `CONFIRMED ${j.mode || mode}${j.signature ? ' · ' + String(j.signature).slice(0, 12) + '…' : ''}`;
      }
    } else if (st) {
      st.textContent = j.error || j.state || 'FAILED';
    }
  } catch (e) {
    if (st) st.textContent = e.message || 'error';
  } finally {
    state.busy = false;
  }
};

function getProvider(name) {
  if (name === 'phantom') return window.solana?.isPhantom ? window.solana : window.phantom?.solana;
  if (name === 'solflare') return window.solflare;
  if (name === 'backpack') return window.backpack;
  return null;
}
async function connectWallet(name) {
  const provider = getProvider(name);
  if (!provider) {
    window.open(
      { phantom: 'https://phantom.app/', solflare: 'https://solflare.com/', backpack: 'https://backpack.app/' }[name] || '#',
      '_blank'
    );
    return;
  }
  try {
    const resp = await provider.connect();
    const pk = resp?.publicKey?.toString?.() || provider.publicKey?.toString?.() || '';
    state.wallet = { name, publicKey: pk };
    localStorage.setItem('walletName', name);
    updateWalletUI();
    $('#wallet-menu')?.classList.add('hidden');
  } catch (e) {
    console.warn(e);
  }
}
async function disconnectWallet() {
  try {
    const p = state.wallet?.name && getProvider(state.wallet.name);
    if (p?.disconnect) await p.disconnect();
  } catch { /* */ }
  state.wallet = null;
  updateWalletUI();
}
function updateWalletUI() {
  const btn = $('#btn-connect');
  if (!btn) return;
  if (state.wallet?.publicKey) {
    btn.textContent = shortAddr(state.wallet.publicKey);
    btn.classList.add('connected');
  } else {
    btn.textContent = 'Connect';
    btn.classList.remove('connected');
  }
}
async function tryReconnect() {
  const name = localStorage.getItem('walletName');
  if (!name) return;
  const p = getProvider(name);
  if (p?.publicKey) {
    state.wallet = { name, publicKey: p.publicKey.toString() };
    updateWalletUI();
  }
}

function bind() {
  $$('.main-tab').forEach((b) =>
    b.addEventListener('click', () => {
      $$('.main-tab').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state.view = b.dataset.view;
      $$('.view').forEach((v) => v.classList.remove('active'));
      $(`#view-${state.view}`)?.classList.add('active');
      if (state.view === 'discover' || state.view === 'pulse') loadTerminal();
    })
  );

  $('#feed-tabs')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    $$('#feed-tabs .seg-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    state.tab = b.dataset.tab;
    loadTerminal();
  });

  $('#tf-tabs')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tf]');
    if (!b) return;
    $$('#tf-tabs .seg-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    state.tf = b.dataset.tf;
    loadTerminal();
  });

  $('#btn-refresh')?.addEventListener('click', () => loadTerminal());
  $('#btn-refresh-pulse')?.addEventListener('click', () => loadTerminal());

  $('#btn-connect')?.addEventListener('click', () => {
    if (state.wallet) {
      disconnectWallet();
      return;
    }
    $('#wallet-menu')?.classList.toggle('hidden');
  });
  $('#wallet-menu')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-wallet]');
    if (b) connectWallet(b.dataset.wallet);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.topbar-right')) {
      $('#wallet-menu')?.classList.add('hidden');
    }
    if (e.target.matches('[data-close]') || e.target.closest('[data-close]')) {
      closeSheet();
      return;
    }
    const qb = e.target.closest('[data-quick-buy]');
    if (qb) {
      e.preventDefault();
      e.stopPropagation();
      state.buyPreset = Number(qb.dataset.quickBuy);
      runTrade('BUY', qb.dataset.mint);
      return;
    }
    const eb = e.target.closest('[data-exec-buy]');
    if (eb) {
      e.preventDefault();
      e.stopPropagation();
      runTrade('BUY', eb.dataset.execBuy);
      return;
    }
    const es = e.target.closest('[data-exec-sell]');
    if (es) {
      e.preventDefault();
      e.stopPropagation();
      runTrade('SELL', es.dataset.execSell, 100);
      return;
    }
    const sp = e.target.closest('[data-exec-sell-pct]');
    if (sp) {
      e.preventDefault();
      e.stopPropagation();
      runTrade('SELL', sp.dataset.mint, Number(sp.dataset.execSellPct));
      return;
    }
    const buy = e.target.closest('[data-buy]');
    if (buy) {
      e.stopPropagation();
      const t = state.tokens.find((x) => x.mint === buy.dataset.buy);
      if (t) openSheet(t);
      return;
    }
    const row = e.target.closest('.token-row');
    if (row) {
      const t = state.tokens.find((x) => x.mint === row.dataset.mint);
      if (t) openSheet(t);
    }
  });

  $('#buy-preset')?.addEventListener('change', (e) => {
    state.buyPreset = Number(e.target.value);
    localStorage.setItem('buyPreset', String(state.buyPreset));
    loadTerminal();
  });
}

bind();
tryReconnect();
loadSol();
loadTerminal();
setInterval(loadSol, 15_000);
setInterval(() => {
  if (state.view === 'discover' || state.view === 'pulse') loadTerminal();
}, 45_000);
