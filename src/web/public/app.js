/**
 * SOL CLAW terminal — logos, sparklines, wallet connect, responsive table
 */

const state = {
  tab: 'trending',
  tf: '5m',
  view: 'discover',
  tokens: [],
  loading: false,
  wallet: null,
  buyPreset: Number(localStorage.getItem('buyPreset') || 0.1),
  watching: JSON.parse(localStorage.getItem('watching') || '[]'),
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

function fmtUsd(n) {
  if (n == null || Number.isNaN(n)) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(5)}`;
}
function fmtAge(min) {
  if (min == null) return '—';
  if (min < 60) return `${min}m`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}h`;
  return `${Math.floor(min / 1440)}d`;
}
function shortAddr(a) {
  if (!a || a.length < 8) return a || '—';
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function sparkSVG(pts, up) {
  if (!pts || pts.length < 2) {
    return `<svg class="spark" viewBox="0 0 72 28" aria-hidden="true"></svg>`;
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const w = 72;
  const h = 28;
  const pad = 2;
  const coords = pts.map((p, i) => {
    const x = pad + (i / (pts.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const color = up ? '#22c55e' : '#ef4444';
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <polyline fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" points="${coords.join(' ')}"/>
  </svg>`;
}

function logoHTML(t) {
  const letter = (t.symbol || '?').slice(0, 2).toUpperCase();
  if (t.image) {
    return `<img class="token-logo" src="${escapeAttr(t.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"
      onerror="this.outerHTML='<div class=\'token-logo fallback\'>${letter}</div>'" />`;
  }
  return `<div class="token-logo fallback">${letter}</div>`;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '"');
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>');
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
    </div>
  `).join('');
}

function rowHTML(t) {
  const up = (t.changePct ?? 0) >= 0;
  const ch = t.changePct != null
    ? `${up ? '+' : ''}${t.changePct.toFixed(1)}%`
    : '—';
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
  if (!tokens.length) {
    el.innerHTML = `<div class="empty">No tokens for this tab right now.<br/>Try refresh or another timeframe.</div>`;
    return;
  }
  el.innerHTML = tokens.map(rowHTML).join('');
}

async function loadTerminal() {
  const list = $('#token-list');
  const pulse = $('#pulse-list');
  state.loading = true;
  if (list) list.innerHTML = skeletons();
  if (pulse && state.view === 'pulse') pulse.innerHTML = skeletons();
  try {
    let url = `/api/terminal?tab=${encodeURIComponent(state.tab)}&tf=${state.tf}&limit=20`;
    if (state.tab === 'watching') url = `/api/terminal?tab=trending&limit=30`;
    const res = await fetch(url);
    const data = await res.json();
    let tokens = data.tokens || [];
    if (state.tab === 'watching') {
      tokens = tokens.filter((t) => state.watching.includes(t.mint));
    }
    if (state.tab === 'viewed') {
      const viewed = JSON.parse(localStorage.getItem('viewed') || '[]');
      tokens = tokens.sort(
        (a, b) => viewed.indexOf(b.mint) - viewed.indexOf(a.mint)
      );
    }
    state.tokens = tokens;
    if (list) renderList(list, tokens);
    if (pulse) renderList(pulse, tokens);
  } catch {
    if (list) list.innerHTML = `<div class="empty">Feed unavailable. Check connection.</div>`;
  } finally {
    state.loading = false;
  }
}

async function loadSol() {
  try {
    const res = await fetch('/api/sol-price');
    const d = await res.json();
    if (d.ok) {
      const sign = (d.change24h ?? 0) >= 0 ? '▲' : '▼';
      const cls = (d.change24h ?? 0) >= 0 ? 'up' : 'down';
      $('#sol-price').innerHTML = `◎ SOL $${Number(d.priceUsd).toFixed(2)} <span class="${cls}">${sign}${Math.abs(d.change24h || 0).toFixed(2)}%</span>`;
    }
  } catch {
    /* */
  }
}

function getProvider(name) {
  if (name === 'phantom') return window.solana?.isPhantom ? window.solana : window.phantom?.solana;
  if (name === 'solflare') return window.solflare;
  if (name === 'backpack') return window.backpack;
  return null;
}

async function connectWallet(name) {
  const provider = getProvider(name);
  if (!provider) {
    const urls = {
      phantom: 'https://phantom.app/',
      solflare: 'https://solflare.com/',
      backpack: 'https://backpack.app/',
    };
    window.open(urls[name] || '#', '_blank');
    return;
  }
  try {
    const resp = await provider.connect();
    const pk =
      resp?.publicKey?.toString?.() ||
      provider.publicKey?.toString?.() ||
      '';
    state.wallet = { name, publicKey: pk };
    localStorage.setItem('walletName', name);
    updateWalletUI();
    $('#wallet-menu').classList.add('hidden');
  } catch (e) {
    console.warn('connect failed', e);
  }
}

async function disconnectWallet() {
  try {
    const name = state.wallet?.name;
    const p = name && getProvider(name);
    if (p?.disconnect) await p.disconnect();
  } catch {
    /* */
  }
  state.wallet = null;
  updateWalletUI();
}

function updateWalletUI() {
  const btn = $('#btn-connect');
  if (state.wallet?.publicKey) {
    btn.textContent = shortAddr(state.wallet.publicKey);
    btn.classList.add('connected');
    $('#pf-addr').textContent = state.wallet.publicKey;
    $('#pf-sol').textContent = 'Connected';
  } else {
    btn.textContent = 'Connect';
    btn.classList.remove('connected');
    $('#pf-addr').textContent = '—';
    $('#pf-sol').textContent = '—';
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

function openSheet(t) {
  const viewed = JSON.parse(localStorage.getItem('viewed') || '[]');
  if (!viewed.includes(t.mint)) {
    viewed.unshift(t.mint);
    localStorage.setItem('viewed', JSON.stringify(viewed.slice(0, 40)));
  }
  const up = (t.changePct ?? 0) >= 0;
  $('#sheet-body').innerHTML = `
    <div class="main" style="margin-bottom:16px">
      ${logoHTML(t)}
      <div>
        <div class="token-title"><span class="sym">$${escapeHtml(t.symbol)}</span></div>
        <div class="muted sm">${escapeHtml(t.name)}</div>
        <div class="muted sm"><code>${escapeHtml(t.mint)}</code></div>
      </div>
    </div>
    ${sparkSVG(t.sparkline, up)}
    <div class="pf-grid">
      <div><span class="muted">Price</span><strong>${t.priceUsd != null ? '$' + Number(t.priceUsd).toPrecision(4) : '—'}</strong></div>
      <div><span class="muted">MC</span><strong>${fmtUsd(t.marketCap)}</strong></div>
      <div><span class="muted">Liq</span><strong>${fmtUsd(t.liquidity)}</strong></div>
      <div><span class="muted">Vol</span><strong>${fmtUsd(t.volume)}</strong></div>
    </div>
    <div class="row" style="margin-top:12px">
      <button type="button" class="btn primary grow" data-buy="${escapeAttr(t.mint)}">Buy ${state.buyPreset} SOL</button>
      <a class="btn ghost" href="${escapeAttr(t.url)}" target="_blank" rel="noopener">Open</a>
    </div>
  `;
  $('#sheet').classList.remove('hidden');
}
function closeSheet() {
  $('#sheet').classList.add('hidden');
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
    $('#wallet-menu').classList.toggle('hidden');
  });
  $('#wallet-menu')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-wallet]');
    if (b) connectWallet(b.dataset.wallet);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.topbar-right')) {
      $('#wallet-menu')?.classList.add('hidden');
    }
    const row = e.target.closest('.token-row');
    if (row && !e.target.closest('[data-buy]')) {
      const t = state.tokens.find((x) => x.mint === row.dataset.mint);
      if (t) openSheet(t);
    }
    if (e.target.matches('[data-close]') || e.target.closest('[data-close]')) {
      closeSheet();
    }
    const buy = e.target.closest('[data-buy]');
    if (buy) {
      e.stopPropagation();
      const mint = buy.dataset.buy;
      if (!state.wallet) {
        $('#wallet-menu').classList.remove('hidden');
        return;
      }
      const t = state.tokens.find((x) => x.mint === mint);
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
