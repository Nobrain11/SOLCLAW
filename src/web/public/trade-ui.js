/** Trade + portfolio layer on top of app.js */

const tradeState = {
  paper: true,
  hasWallet: false,
  buyPreset: Number(localStorage.getItem('buyPreset') || 0.1),
  busy: false,
};

async function tApi(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  return res.json();
}

async function bootTradeSession() {
  try {
    const j = await tApi('/api/session', { method: 'POST', body: '{}' });
    if (j.ok) {
      tradeState.paper = j.paper !== false;
      tradeState.hasWallet = !!j.hasWallet;
      if (j.buySize) tradeState.buyPreset = j.buySize;
    }
  } catch {
    /* */
  }
  const b = document.querySelector('#btn-toggle-paper');
  if (b) b.textContent = tradeState.paper ? 'Paper ON' : 'Live ON';
}

async function refreshPf() {
  try {
    const j = await tApi('/api/portfolio');
    if (!j.ok) return;
    tradeState.hasWallet = !!j.hasWallet;
    tradeState.paper = j.paper !== false;
    const addr = document.querySelector('#pf-addr');
    const sol = document.querySelector('#pf-sol');
    if (addr) addr.textContent = j.address || 'No wallet — create one';
    if (sol)
      sol.textContent = j.address
        ? `${Number(j.balanceSol || 0).toFixed(4)} SOL`
        : '—';

    const pos = await tApi('/api/positions');
    const el = document.querySelector('#positions-list');
    if (!el) return;
    if (!pos.positions?.length) {
      el.innerHTML = `<p class="muted center">No open positions</p>`;
      return;
    }
    el.innerHTML = pos.positions
      .map((p) => {
        const pnl = Number(p.unrealizedPnl || 0);
        const cls = pnl >= 0 ? 'up' : 'down';
        const sym = String(p.symbol || '?');
        return `<div class="token-row" data-mint="${p.mint}">
          <div class="main">
            <div class="token-logo fallback">${sym.slice(0, 2)}</div>
            <div class="token-meta">
              <div class="token-title"><span class="sym">$${sym}</span></div>
              <div class="token-sub"><span>${p.mode || ''}</span></div>
            </div>
          </div>
          <div class="row-right"><span class="${cls}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(4)}</span></div>
        </div>`;
      })
      .join('');
  } catch {
    /* */
  }
}

async function execTrade(side, mint) {
  if (tradeState.busy || !mint) return;
  if (!tradeState.hasWallet && !tradeState.paper) {
    alert('Create a wallet in Portfolio first (or keep Paper ON).');
    return;
  }
  const mode = tradeState.paper ? 'PAPER' : 'LIVE';
  const msg =
    side === 'BUY'
      ? `Confirm ${mode} BUY ${tradeState.buyPreset} SOL?`
      : `Confirm ${mode} SELL 100%?`;
  if (!confirm(msg)) return;

  tradeState.busy = true;
  let st = document.querySelector('#trade-status');
  if (!st) {
    st = document.createElement('p');
    st.id = 'trade-status';
    st.className = 'muted sm';
    document.querySelector('#sheet-body')?.appendChild(st);
  }
  st.textContent = 'SUBMITTING…';
  try {
    const j = await tApi('/api/trade', {
      method: 'POST',
      body: JSON.stringify({
        mint,
        side,
        confirm: true,
        amountSol: side === 'BUY' ? tradeState.buyPreset : undefined,
        percentage: side === 'SELL' ? 100 : undefined,
      }),
    });
    if (j.ok && (j.state === 'CONFIRMED' || j.state === 'FILLED')) {
      st.textContent = `CONFIRMED ${j.mode || mode}${
        j.signature ? ' · ' + String(j.signature).slice(0, 12) + '…' : ''
      }`;
      refreshPf();
    } else {
      st.textContent = j.error || j.state || 'FAILED';
    }
  } catch (e) {
    st.textContent = e.message || 'error';
  } finally {
    tradeState.busy = false;
  }
}

document.addEventListener('click', (e) => {
  const buyBtn = e.target.closest?.('[data-exec-buy]');
  if (buyBtn) {
    e.preventDefault();
    e.stopPropagation();
    execTrade('BUY', buyBtn.dataset.execBuy);
    return;
  }
  const sellBtn = e.target.closest?.('[data-exec-sell]');
  if (sellBtn) {
    e.preventDefault();
    e.stopPropagation();
    execTrade('SELL', sellBtn.dataset.execSell);
    return;
  }
});

const sheetObs = new MutationObserver(() => {
  const body = document.querySelector('#sheet-body');
  if (!body || body.dataset.tradeWired === '1') return;
  const buy = body.querySelector('[data-buy]');
  if (!buy) return;
  body.dataset.tradeWired = '1';
  const mint = buy.dataset.buy;
  const row = document.createElement('div');
  row.className = 'row';
  row.style.marginTop = '12px';
  row.style.gap = '8px';
  row.innerHTML = `
    <button type="button" class="btn primary grow" data-exec-buy="${mint}">Buy ${tradeState.buyPreset} SOL</button>
    <button type="button" class="btn ghost grow" data-exec-sell="${mint}">Sell 100%</button>`;
  buy.parentElement?.replaceWith(row);
  const mode = document.createElement('p');
  mode.className = 'muted sm';
  mode.style.marginTop = '8px';
  mode.textContent = `Mode: ${tradeState.paper ? 'PAPER' : 'LIVE'}`;
  row.after(mode);
  const st = document.createElement('p');
  st.id = 'trade-status';
  st.className = 'muted sm';
  mode.after(st);
});
const sheet = document.querySelector('#sheet-body');
if (sheet) sheetObs.observe(sheet, { childList: true, subtree: true });

document.querySelector('#btn-toggle-paper')?.addEventListener('click', async () => {
  tradeState.paper = !tradeState.paper;
  await tApi('/api/settings', {
    method: 'POST',
    body: JSON.stringify({ paper: tradeState.paper }),
  });
  const b = document.querySelector('#btn-toggle-paper');
  if (b) b.textContent = tradeState.paper ? 'Paper ON' : 'Live ON';
  alert(tradeState.paper ? 'Paper ON — simulated fills' : 'LIVE — real Solana txs');
});

document.querySelector('#buy-preset')?.addEventListener('change', (e) => {
  tradeState.buyPreset = Number(e.target.value);
  localStorage.setItem('buyPreset', String(tradeState.buyPreset));
  tApi('/api/settings', {
    method: 'POST',
    body: JSON.stringify({ buySize: tradeState.buyPreset }),
  }).catch(() => {});
});

document.querySelectorAll('.main-tab').forEach((b) => {
  b.addEventListener('click', () => {
    if (b.dataset.view === 'portfolio') refreshPf();
  });
});

bootTradeSession().then(refreshPf);
setInterval(refreshPf, 25_000);
