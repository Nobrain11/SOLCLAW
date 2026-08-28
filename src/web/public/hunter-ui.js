/** Auto-Hunter dashboard client */

async function hunterApi(path, body) {
  const opts = body
    ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'same-origin',
      }
    : { credentials: 'same-origin' };
  const res = await fetch(path, opts);
  return res.json();
}

function h$(s) {
  return document.querySelector(s);
}

function fmtSol(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(3)} SOL`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHunter(d) {
  if (!d) return;
  const line = h$('#hunter-status-line');
  if (!line) return;
  const st = d.status || 'OFF';
  const map = {
    HUNTING: 'HUNTING ●',
    LOCKED: 'LOCKED · daily cap',
    OFF: 'OFF',
    PAUSED: 'PAUSED',
    KILLED: 'KILLED',
  };
  line.textContent = map[st] || st;
  line.className =
    'hunter-status ' +
    (st === 'HUNTING' ? 'on' : st === 'LOCKED' || st === 'KILLED' ? 'locked' : 'muted');

  const btn = h$('#btn-hunter-toggle');
  if (btn) {
    if (st === 'HUNTING') {
      btn.textContent = 'Pause';
      btn.classList.remove('primary');
      btn.classList.add('ghost');
      btn.disabled = false;
    } else {
      btn.textContent = st === 'LOCKED' ? 'Locked' : 'Enable';
      btn.classList.add('primary');
      btn.classList.remove('ghost');
      btn.disabled = st === 'LOCKED';
    }
  }

  const pnl = d.dailyPnlSol ?? 0;
  const hp = h$('#h-pnl');
  if (hp) {
    hp.textContent = fmtSol(pnl);
    hp.className = pnl >= 0 ? 'up' : 'down';
  }
  const hc = h$('#h-cap');
  if (hc)
    hc.textContent = `${Number(d.dailyLossSol || 0).toFixed(2)} / ${Number(d.dailyLossCap || 0.5).toFixed(2)} SOL`;
  const hh = h$('#h-hour');
  if (hh) hh.textContent = `${d.entriesHour ?? 0} / ${d.maxEntriesHour ?? 3}`;
  const hd = h$('#h-day');
  if (hd) hd.textContent = `${d.entriesToday ?? 0} / ${d.maxEntriesDay ?? 10}`;
  const ho = h$('#h-open');
  if (ho) ho.textContent = String(d.openAutoPositions ?? 0);
  const hr = h$('#h-regime');
  if (hr) {
    const reg = d.marketRegime || 'UNKNOWN';
    const regPct =
      d.regimeSuccessPct != null ? ` ${Number(d.regimeSuccessPct).toFixed(0)}%` : '';
    hr.textContent = `${reg}${regPct}`;
  }

  const list = h$('#hunt-list');
  if (list) {
    const cands = d.candidates || [];
    if (!cands.length) {
      list.innerHTML = `<div class="muted sm">${
        st === 'HUNTING' ? 'Scanning pump.fun…' : 'Arm hunter to stream candidates.'
      }</div>`;
    } else {
      list.innerHTML = cands
        .map(
          (c) =>
            `<div class="hunt-row" data-mint="${esc(c.mint)}">
          <span><b>$${esc(c.ticker)}</b> ${c.ageSec != null ? c.ageSec + 's' : ''}</span>
          <span class="st-${esc(c.status)}">${esc(c.status)}</span>
        </div>`
        )
        .join('');
    }
  }

  const logs = h$('#hunt-logs');
  if (logs) {
    const ls = d.logs || [];
    if (!ls.length) {
      logs.innerHTML = `<div class="muted sm">No decisions yet.</div>`;
    } else {
      logs.innerHTML = ls
        .map((l) => `<div class="hunt-log">${esc(l.message)}</div>`)
        .join('');
    }
  }
}

async function refreshHunter() {
  try {
    const d = await hunterApi('/api/hunter/status');
    if (d.ok) renderHunter(d);
  } catch {
    /* */
  }
}

function bindHunterUi() {
  h$('#btn-hunter-toggle')?.addEventListener('click', async () => {
    const d = await hunterApi('/api/hunter/status');
    if (d.status === 'HUNTING') {
      await hunterApi('/api/hunter/pause', {});
      await refreshHunter();
      return;
    }
    if (!d.walletConnected) {
      alert('Create a wallet in Portfolio before enabling Auto-Hunter.');
      return;
    }
    h$('#hunter-modal')?.classList.remove('hidden');
  });

  h$('#btn-hunter-confirm')?.addEventListener('click', async () => {
    h$('#hunter-modal')?.classList.add('hidden');
    const r = await hunterApi('/api/hunter/enable', { confirm: true });
    if (!r.ok) alert(r.message || r.error || 'Enable failed');
    await refreshHunter();
  });

  h$('#btn-hunter-kill')?.addEventListener('click', async () => {
    if (!confirm('Kill Auto-Hunter? No new automated trades until re-enabled.')) return;
    await hunterApi('/api/hunter/kill', {});
    await refreshHunter();
  });

  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-close-hunter]') || e.target.closest?.('[data-close-hunter]')) {
      h$('#hunter-modal')?.classList.add('hidden');
    }
  });

  h$('#btn-create-wallet')?.addEventListener('click', async () => {
    try {
      const r = await fetch('/api/wallet/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: '{}',
      });
      const j = await r.json();
      alert(j.ok ? `Wallet created: ${j.publicKey}` : j.error || 'failed');
      await refreshHunter();
    } catch {
      alert('Create failed');
    }
  });

  h$('#btn-import-wallet')?.addEventListener('click', async () => {
    const secret = prompt('Paste base58 private key (server-side only)');
    if (!secret) return;
    try {
      const r = await fetch('/api/wallet/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ secret }),
      });
      const j = await r.json();
      alert(j.ok ? `Imported: ${j.publicKey}` : j.error || 'failed');
      await refreshHunter();
    } catch {
      alert('Import failed');
    }
  });
}

bindHunterUi();
refreshHunter();
setInterval(refreshHunter, 12_000);
