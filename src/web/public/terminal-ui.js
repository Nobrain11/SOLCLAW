/**
 * Token terminal overlay — TOKEN | CHART | TRADE + feed + position
 */
(function () {
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }
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

  function bigSpark(pts, up) {
    if (!pts || pts.length < 2) {
      return `<svg class="spark spark-lg" viewBox="0 0 280 100"></svg>`;
    }
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = max - min || 1;
    const coords = pts.map((p, i) => {
      const x = 4 + (i / (pts.length - 1)) * 272;
      const y = 96 - ((p - min) / span) * 88;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const color = up ? '#22c55e' : '#ef4444';
    return `<svg class="spark spark-lg" viewBox="0 0 280 100" aria-hidden="true">
      <polyline fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round" points="${coords.join(' ')}"/></svg>`;
  }

  function logo(t) {
    const letter = (t.symbol || '?').slice(0, 2).toUpperCase();
    if (t.image) {
      return `<img class="token-logo" src="${esc(t.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"
        onerror="this.outerHTML='<div class=\'token-logo fallback\'>${letter}</div>'" />`;
    }
    return `<div class="token-logo fallback">${letter}</div>`;
  }

  window.openTerminal = function openTerminal(t, opts) {
    opts = opts || {};
    const buyPreset = opts.buyPreset != null ? opts.buyPreset : (window.state && window.state.buyPreset) || 0.1;
    const paper = opts.paper != null ? opts.paper : !(window.state && window.state.paper === false);
    const mode = paper ? 'PAPER' : 'LIVE';
    const up = (t.changePct || 0) >= 0;
    const risk = (t.safety && t.safety.risk) || 'med';
    const score = t.safety && t.safety.score;
    const sec =
      risk === 'low'
        ? `<div class="sec-ok">Security ✓${score != null ? ' · ' + score + '%' : ''}</div>`
        : `<div class="sec-warn">Security · ${String(risk).toUpperCase()}${score != null ? ' · ' + score + '%' : ''}</div>`;
    const buys = t.buys || 0;
    const sells = t.sells || 0;
    const body = document.querySelector('#sheet-body');
    if (!body) return;

    body.innerHTML =
      '<div class="term" data-mint="' +
      esc(t.mint) +
      '">' +
      '<div class="term-top">' +
      '<div class="term-token">' +
      '<div class="main" style="margin-bottom:8px">' +
      logo(t) +
      '<div><div class="sym">$' +
      esc(t.symbol) +
      '</div><div class="muted sm">' +
      esc(t.name) +
      '</div></div></div>' +
      '<div class="price ' +
      (up ? 'up' : 'down') +
      '">' +
      (t.priceUsd != null ? '$' + Number(t.priceUsd).toPrecision(4) : '—') +
      '</div>' +
      '<div class="muted sm ' +
      (up ? 'up' : 'down') +
      '">' +
      (t.changePct != null ? (up ? '+' : '') + Number(t.changePct).toFixed(1) + '%' : '') +
      '</div>' +
      '<div class="metrics">' +
      '<div><span>MC</span><b>' +
      fmtUsd(t.marketCap) +
      '</b></div>' +
      '<div><span>Liq</span><b>' +
      fmtUsd(t.liquidity) +
      '</b></div>' +
      '<div><span>Vol</span><b>' +
      fmtUsd(t.volume) +
      '</b></div>' +
      '<div><span>Age</span><b>' +
      fmtAge(t.ageMin) +
      '</b></div></div>' +
      sec +
      '<div class="muted sm" style="margin-top:8px;word-break:break-all"><code>' +
      esc(t.mint) +
      '</code></div></div>' +
      '<div class="term-chart"><div class="label">LIVE TREND</div>' +
      bigSpark(t.sparkline, up) +
      '<div class="muted sm" style="margin-top:8px">Buys <span class="up">' +
      buys +
      '</span> · Sells <span class="down">' +
      sells +
      '</span> · <b>' +
      mode +
      '</b></div></div>' +
      '<div class="term-trade">' +
      '<div class="side-label">Buy</div>' +
      '<div class="amt-grid">' +
      '<button type="button" class="btn ghost" data-quick-buy="0.1" data-mint="' +
      esc(t.mint) +
      '">0.1</button>' +
      '<button type="button" class="btn ghost" data-quick-buy="0.25" data-mint="' +
      esc(t.mint) +
      '">0.25</button>' +
      '<button type="button" class="btn ghost" data-quick-buy="0.5" data-mint="' +
      esc(t.mint) +
      '">0.5</button>' +
      '<button type="button" class="btn ghost" data-quick-buy="1" data-mint="' +
      esc(t.mint) +
      '">1 SOL</button></div>' +
      '<button type="button" class="btn buy-full" data-exec-buy="' +
      esc(t.mint) +
      '">BUY ' +
      buyPreset +
      ' SOL</button>' +
      '<div class="side-label" style="margin-top:4px">Sell</div>' +
      '<div class="sell-pct">' +
      '<button type="button" class="btn ghost" data-exec-sell-pct="25" data-mint="' +
      esc(t.mint) +
      '">25%</button>' +
      '<button type="button" class="btn ghost" data-exec-sell-pct="50" data-mint="' +
      esc(t.mint) +
      '">50%</button>' +
      '<button type="button" class="btn ghost" data-exec-sell-pct="75" data-mint="' +
      esc(t.mint) +
      '">75%</button>' +
      '<button type="button" class="btn ghost" data-exec-sell-pct="100" data-mint="' +
      esc(t.mint) +
      '">100%</button></div>' +
      '<button type="button" class="btn sell-full" data-exec-sell="' +
      esc(t.mint) +
      '">SELL 100%</button>' +
      '<p id="trade-status" class="term-status muted"></p></div></div>' +
      '<div class="term-tabs">' +
      '<button type="button" class="active" data-term-tab="trades">TRADES</button>' +
      '<button type="button" data-term-tab="activity">ACTIVITY</button>' +
      '<button type="button" data-term-tab="holders">HOLDERS</button>' +
      '<button type="button" data-term-tab="liquidity">LIQUIDITY</button></div>' +
      '<div class="term-feed" id="term-feed">' +
      '<div class="feed-row"><span class="type-buy">BUY</span><span>' +
      buys +
      '</span><span>txns</span><span>' +
      fmtUsd(t.volume) +
      '</span><span class="muted">vol</span></div>' +
      '<div class="feed-row"><span class="type-sell">SELL</span><span>' +
      sells +
      '</span><span>txns</span><span>' +
      fmtUsd(t.liquidity) +
      '</span><span class="muted">liq</span></div></div>' +
      '<div class="term-pos"><div class="muted sm">Position controls after fill</div>' +
      '<div class="pos-actions" style="margin-top:8px">' +
      '<button type="button" class="btn ghost" data-exec-sell-pct="25" data-mint="' +
      esc(t.mint) +
      '">SELL 25%</button>' +
      '<button type="button" class="btn ghost" data-exec-sell-pct="50" data-mint="' +
      esc(t.mint) +
      '">SELL 50%</button>' +
      '<button type="button" class="btn ghost" data-exec-sell-pct="100" data-mint="' +
      esc(t.mint) +
      '">SELL 100%</button>' +
      '<a class="btn ghost" href="' +
      esc(t.url || '#') +
      '" target="_blank" rel="noopener">Open pump</a></div></div></div>';

    document.querySelector('#sheet') && document.querySelector('#sheet').classList.remove('hidden');
  };

  document.addEventListener(
    'click',
    function (e) {
      var row = e.target.closest && e.target.closest('.token-row');
      if (!row || (e.target.closest && e.target.closest('[data-buy],[data-exec-buy]'))) return;
      var mint = row.dataset.mint;
      setTimeout(function () {
        var tokens = (window.state && window.state.tokens) || [];
        var t = tokens.find(function (x) {
          return x.mint === mint;
        });
        if (t && document.querySelector('#sheet:not(.hidden)') && !document.querySelector('.term')) {
          window.openTerminal(t, {
            buyPreset: window.state && window.state.buyPreset,
            paper: window.state && window.state.paper,
          });
        }
      }, 40);
    },
    true
  );

  document.addEventListener('click', function (e) {
    var qb = e.target.closest && e.target.closest('[data-quick-buy]');
    if (qb) {
      e.preventDefault();
      e.stopPropagation();
      var amt = Number(qb.dataset.quickBuy);
      if (window.state) window.state.buyPreset = amt;
      var mint = qb.dataset.mint;
      var btn = document.querySelector('[data-exec-buy="' + mint + '"]');
      if (btn) btn.click();
      return;
    }
    var sp = e.target.closest && e.target.closest('[data-exec-sell-pct]');
    if (sp) {
      e.preventDefault();
      e.stopPropagation();
      var pct = Number(sp.dataset.execSellPct);
      var mint2 = sp.dataset.mint;
      if (!confirm('Confirm SELL ' + pct + '%?')) return;
      fetch('/api/trade', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mint: mint2, side: 'SELL', confirm: true, percentage: pct }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (j) {
          var st = document.querySelector('#trade-status');
          if (st)
            st.textContent = j.ok
              ? 'CONFIRMED ' + (j.mode || '') + (j.signature ? ' · ' + String(j.signature).slice(0, 12) + '…' : '')
              : j.error || j.state || 'FAILED';
        })
        .catch(function (err) {
          var st = document.querySelector('#trade-status');
          if (st) st.textContent = err.message || 'error';
        });
    }
  });
})();
