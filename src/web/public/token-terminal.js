/**
 * Live token terminal — chart, trades, holders, liquidity
 */
(function () {
  function $(s, el) {
    return (el || document).querySelector(s);
  }
  function fmtUsd(n) {
    if (n == null || Number.isNaN(n)) return '—';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    if (Math.abs(n) >= 1) return '$' + n.toFixed(2);
    return '$' + Number(n).toPrecision(4);
  }
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }
  function spark(pts, up, w, h) {
    w = w || 280;
    h = h || 100;
    if (!pts || pts.length < 2)
      return '<svg class="spark spark-lg" viewBox="0 0 ' + w + ' ' + h + '"></svg>';
    var min = Math.min.apply(null, pts);
    var max = Math.max.apply(null, pts);
    var span = max - min || 1;
    var pad = 2;
    var coords = pts.map(function (p, i) {
      var x = pad + (i / (pts.length - 1)) * (w - pad * 2);
      var y = h - pad - ((p - min) / span) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    var color = up ? '#22c55e' : '#ef4444';
    return (
      '<svg class="spark spark-lg" viewBox="0 0 ' +
      w +
      ' ' +
      h +
      '"><polyline fill="none" stroke="' +
      color +
      '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" points="' +
      coords.join(' ') +
      '"/></svg>'
    );
  }

  window.openSheet = async function (t) {
    var body = $('#sheet-body');
    var sheet = $('#sheet');
    if (!body) return;
    body.innerHTML =
      '<div class="muted sm" style="padding:12px">Loading terminal…</div>';
    if (sheet) sheet.classList.remove('hidden');

    var d = Object.assign({}, t);
    try {
      var res = await fetch('/api/token/' + encodeURIComponent(t.mint), {
        credentials: 'same-origin',
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        var j = await res.json();
        if (j.ok) {
          d = Object.assign({}, t, j, {
            sparkline:
              j.sparkline && j.sparkline.length > 1
                ? j.sparkline
                : t.sparkline || [],
            trades: j.trades || [],
            holders: j.holders || [],
            volume: j.volume24h != null ? j.volume24h : t.volume,
            changePct: j.change24h != null ? j.change24h : t.changePct,
          });
        }
      }
    } catch (e) {
      console.warn(e);
    }

    var up = (d.changePct || 0) >= 0;
    var state = window.state || { paper: true, buyPreset: 0.1 };
    var mode = state.paper ? 'PAPER' : 'LIVE';
    var buys = d.buys || 0;
    var sells = d.sells || 0;
    var mint = esc(d.mint);
    var liq = fmtUsd(d.liquidity);
    var vol = fmtUsd(d.volume || d.volume24h);

    var tradeRows =
      (d.trades || [])
        .slice(0, 20)
        .map(function (tr) {
          var cls = tr.type === 'BUY' ? 'type-buy' : 'type-sell';
          var sol = tr.sol != null ? Number(tr.sol).toFixed(3) : '—';
          var ago =
            tr.ts != null
              ? Math.max(0, Math.floor((Date.now() - tr.ts) / 1000))
              : null;
          var agoS =
            ago == null ? '' : ago < 60 ? ago + 's' : Math.floor(ago / 60) + 'm';
          return (
            '<div class="feed-row"><span class="' +
            cls +
            '">' +
            tr.type +
            '</span><span>' +
            sol +
            ' SOL</span><span>' +
            (tr.price != null ? '$' + Number(tr.price).toPrecision(4) : '—') +
            '</span><span>' +
            (tr.wallet || '—') +
            '</span><span class="muted">' +
            agoS +
            '</span></div>'
          );
        })
        .join('') ||
      '<div class="muted sm">No live trades yet</div>';

    var holderRows =
      (d.holders || [])
        .slice(0, 10)
        .map(function (h) {
          return (
            '<div class="feed-row"><span>' +
            esc(h.address) +
            '</span><span>' +
            (h.pct != null ? h.pct.toFixed(1) + '%' : '—') +
            '</span></div>'
          );
        })
        .join('') ||
      (d.holderCount != null
        ? '<div class="muted sm">Holders: <b>' + d.holderCount + '</b></div>'
        : '<div class="muted sm">Holders unavailable</div>');

    var letter = String(d.symbol || '?').slice(0, 2).toUpperCase();
    var logo = d.image
      ? '<img class="token-logo" src="' +
        esc(d.image) +
        '" alt="" loading="lazy" referrerpolicy="no-referrer"/>'
      : '<div class="token-logo fallback">' + letter + '</div>';

    body.innerHTML =
      '<div class="term" data-mint="' +
      mint +
      '"><div class="term-top">' +
      '<div class="term-token"><div class="main" style="margin-bottom:8px">' +
      logo +
      '<div><div class="sym">$' +
      esc(d.symbol) +
      '</div><div class="muted sm">' +
      esc(d.name) +
      '</div></div></div>' +
      '<div class="price ' +
      (up ? 'up' : 'down') +
      '">' +
      (d.priceUsd != null ? '$' + Number(d.priceUsd).toPrecision(4) : '—') +
      '</div>' +
      '<div class="metrics"><div><span>MC</span><b>' +
      fmtUsd(d.marketCap) +
      '</b></div><div><span>Liq</span><b>' +
      liq +
      '</b></div><div><span>Vol</span><b>' +
      vol +
      '</b></div><div><span>Holders</span><b>' +
      (d.holderCount != null ? d.holderCount : '—') +
      '</b></div></div>' +
      '<div class="muted sm" style="margin-top:8px;word-break:break-all"><code>' +
      esc(d.mint) +
      '</code></div></div>' +
      '<div class="term-chart"><div class="label">LIVE TREND</div>' +
      spark(d.sparkline, up) +
      '<div class="muted sm" style="margin-top:8px">Buys <span class="up">' +
      buys +
      '</span> · Sells <span class="down">' +
      sells +
      '</span> · <b>' +
      mode +
      '</b>' +
      (d.onCurve ? ' · curve' : '') +
      '</div></div>' +
      '<div class="term-trade"><div class="side-label">Buy</div><div class="amt-grid">' +
      '<button type="button" class="btn ghost" data-quick-buy="0.1" data-mint="' +
      mint +
      '">0.1</button>' +
      '<button type="button" class="btn ghost" data-quick-buy="0.25" data-mint="' +
      mint +
      '">0.25</button>' +
      '<button type="button" class="btn ghost" data-quick-buy="0.5" data-mint="' +
      mint +
      '">0.5</button>' +
      '<button type="button" class="btn ghost" data-quick-buy="1" data-mint="' +
      mint +
      '">1 SOL</button></div>' +
      '<button type="button" class="btn buy-full" data-exec-buy="' +
      mint +
      '">BUY ' +
      (state.buyPreset || 0.1) +
      ' SOL</button>' +
      '<div class="side-label" style="margin-top:4px">Sell</div><div class="sell-pct">' +
      '<button type="button" class="btn ghost" data-exec-sell-pct="25" data-mint="' +
      mint +
      '">25%</button>' +
      '<button type="button" class="btn ghost" data-exec-sell-pct="50" data-mint="' +
      mint +
      '">50%</button>' +
      '<button type="button" class="btn ghost" data-exec-sell-pct="100" data-mint="' +
      mint +
      '">100%</button></div>' +
      '<button type="button" class="btn sell-full" data-exec-sell="' +
      mint +
      '">SELL 100%</button>' +
      '<p id="trade-status" class="term-status muted"></p></div></div>' +
      '<div class="term-tabs" id="term-tabs">' +
      '<button type="button" class="active" data-panel="trades">TRADES</button>' +
      '<button type="button" data-panel="holders">HOLDERS</button>' +
      '<button type="button" data-panel="liquidity">LIQUIDITY</button>' +
      '<button type="button" data-panel="activity">ACTIVITY</button></div>' +
      '<div class="term-feed" id="term-panel-trades">' +
      tradeRows +
      '</div>' +
      '<div class="term-feed hidden" id="term-panel-holders">' +
      holderRows +
      '</div>' +
      '<div class="term-feed hidden" id="term-panel-liquidity">' +
      '<div class="feed-row"><span class="muted">Liquidity</span><b>' +
      liq +
      '</b></div>' +
      '<div class="feed-row"><span class="muted">Vol 24h</span><b>' +
      vol +
      '</b></div>' +
      '<div class="feed-row"><span class="muted">Vol 1h</span><b>' +
      fmtUsd(d.volume1h) +
      '</b></div>' +
      '<div class="feed-row"><span class="muted">Buys/Sells</span><span class="up">' +
      buys +
      '</span>/<span class="down">' +
      sells +
      '</span></div></div>' +
      '<div class="term-feed hidden" id="term-panel-activity">' +
      '<div class="feed-row"><span class="type-buy">BUY</span><span>' +
      buys +
      '</span><span>txns</span></div>' +
      '<div class="feed-row"><span class="type-sell">SELL</span><span>' +
      sells +
      '</span><span>txns</span></div></div></div>';

    var tabs = document.getElementById('term-tabs');
    if (tabs) {
      tabs.onclick = function (e) {
        var b = e.target.closest('[data-panel]');
        if (!b) return;
        tabs.querySelectorAll('button').forEach(function (x) {
          x.classList.remove('active');
        });
        b.classList.add('active');
        ['trades', 'holders', 'liquidity', 'activity'].forEach(function (id) {
          var el = document.getElementById('term-panel-' + id);
          if (el) el.classList.toggle('hidden', id !== b.dataset.panel);
        });
      };
    }
  };
})();
