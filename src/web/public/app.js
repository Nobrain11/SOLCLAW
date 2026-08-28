const state = { view: 'terminal', sol: null, trending: [], selectedMint: null, token: null, buySol: 0.05, ref: null, config: { appUrl: '', trendingRefreshMs: 10000 } };
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
async function api(path) {
  const res = await fetch(path, { credentials: 'same-origin' });
  return res.json();
}
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
async function loadConfig() {
  try { const j = await api('/api/config'); if (j.ok) state.config = j; } catch {}
}
async function refreshSolPrice() {
  try {
    const j = await api('/api/sol-price');
    if (!j.ok) return;
    const el = $('#sol-price');
    if (el) { el.textContent = j.header || '◎ SOL —'; el.style.color = (j.change24h ?? 0) >= 0 ? 'var(--green)' : 'var(--red)'; }
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
    list.innerHTML = j.tokens.map((t, i) => {
      const ch = t.change24h;
      const chClass = ch == null ? '' : ch >= 0 ? 'chg-up' : 'chg-down';
      return `<button type="button" class="trend-item" data-mint="${t.mint}">
        <div class="top"><span>${i+1}. $${escapeHtml(t.symbol)} · ${escapeHtml(t.name)}</span>
        <span class="${chClass}">${fmtPct(ch) || fmtUsd(t.priceUsd, 6)}</span></div>
        <div class="meta">MC ${fmtUsd(t.marketCap)} · Liq ${fmtUsd(t.liquidity)} · Vol ${fmtUsd(t.volume24h)} · ${escapeHtml(t.dex || t.source)}</div>
      </button>`;
    }).join('');
    list.querySelectorAll('.trend-item').forEach((btn) => btn.addEventListener('click', () => selectMint(btn.dataset.mint)));
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
  history.replaceState(null, '', `/trade/${mint}${state.ref ? `?ref=${encodeURIComponent(state.ref)}` : ''}`);
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
    if (status) status.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    card.classList.remove('hidden');
    card.innerHTML = `<p class="muted">Could not load token.</p>`;
    if (status) status.textContent = 'Scan failed';
  }
}
function setView(name) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
}
function captureRefFromUrl() {
  const u = new URL(window.location.href);
  const ref = u.searchParams.get('ref');
  if (ref) { state.ref = ref; fetch(`/api/ref/capture?ref=${encodeURIComponent(ref)}`).catch(() => {}); }
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts[0] === 'trade' && parts[1]) selectMint(parts[1]);
}
function bindUi() {
  $$('.nav-btn').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#btn-scan')?.addEventListener('click', () => { const m = $('#mint-input')?.value?.trim(); if (m) selectMint(m); });
  $('#btn-clear')?.addEventListener('click', () => {
    $('#mint-input').value = ''; state.selectedMint = null; state.token = null;
    $('#token-card')?.classList.add('hidden'); $('#trade-controls')?.classList.add('hidden');
    history.replaceState(null, '', '/');
  });
  $('#btn-refresh-token')?.addEventListener('click', () => { if (state.selectedMint) loadToken(state.selectedMint); });
  $$('.amt').forEach((b) => b.addEventListener('click', () => {
    $$('.amt').forEach((x) => x.classList.remove('active')); b.classList.add('active');
    state.buySol = Number(b.dataset.sol); const c = $('#custom-sol'); if (c) c.value = String(state.buySol);
  }));
  $('#custom-sol')?.addEventListener('change', (e) => { const v = Number(e.target.value); if (v > 0) state.buySol = v; });
  $('#btn-buy')?.addEventListener('click', () => {
    const st = $('#trade-status');
    if (!state.selectedMint) { if (st) st.textContent = 'Select a token first'; return; }
    if (st) st.textContent = `BUY ${state.buySol} SOL — connect wallet to submit on-chain (Telegram trading is live; web signer next).`;
  });
  $('#btn-sell')?.addEventListener('click', () => {
    const st = $('#trade-status'); if (st) st.textContent = 'SELL requires open position + wallet.';
  });
  $('#btn-share')?.addEventListener('click', async () => {
    if (!state.selectedMint) return;
    const base = state.config.appUrl || window.location.origin;
    const ref = state.ref || localStorage.getItem('solclaw_uid') || 'guest';
    const url = `${base}/trade/${state.selectedMint}?ref=${encodeURIComponent(ref)}`;
    try { await navigator.clipboard.writeText(url); const st = $('#trade-status'); if (st) st.textContent = 'Share link copied'; }
    catch { prompt('Copy share link', url); }
  });
  $('#btn-copy-ref')?.addEventListener('click', async () => {
    const base = state.config.appUrl || window.location.origin;
    const id = localStorage.getItem('solclaw_uid') || crypto.randomUUID().slice(0, 8);
    localStorage.setItem('solclaw_uid', id);
    const url = `${base}/?ref=${encodeURIComponent(id)}`;
    try { await navigator.clipboard.writeText(url); alert('Referral link copied (optional)'); } catch { prompt('Referral link', url); }
  });
  $('#btn-connect')?.addEventListener('click', () => setView('wallet'));
}
async function boot() {
  bindUi(); captureRefFromUrl(); await loadConfig();
  await refreshSolPrice(); await refreshTrending(true);
  setInterval(refreshSolPrice, 15000);
  setInterval(() => refreshTrending(false), state.config.trendingRefreshMs || 10000);
  setInterval(() => { const el = $('#footer-clock'); if (el) el.textContent = new Date().toLocaleString(); }, 1000);
}
boot();
