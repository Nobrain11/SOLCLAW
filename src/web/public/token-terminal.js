/** SOL CLAW denser token terminal — chart embed + live txs + safety */
(function () {
  function $(s, el) { return (el || document).querySelector(s); }
  function fmtUsd(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    n = Number(n);
    if (n < 0 || n > 5e9) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    if (n >= 1) return '$' + n.toFixed(2);
    if (n >= 0.0001) return '$' + n.toFixed(6);
    return '$' + n.toPrecision(3);
  }
  function fmtPct(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    n = Number(n);
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function ago(ts) {
    if (!ts) return '';
    var s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    return Math.floor(s / 3600) + 'h';
  }
  function spark(pts, up, w, h) {
    w = w || 300; h = h || 110;
    if (!pts || pts.length < 2) return '<svg class="spark spark-lg" viewBox="0 0 '+w+' '+h+'"></svg>';
    var min = Math.min.apply(null, pts), max = Math.max.apply(null, pts), span = max - min || 1, pad = 3;
    var coords = pts.map(function (p, i) {
      var x = pad + (i / (pts.length - 1)) * (w - pad * 2);
      var y = h - pad - ((p - min) / span) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    var color = up ? '#22c55e' : '#ef4444';
    var area = coords[0] + ' ' + coords.join(' ') + ' ' + (w - pad).toFixed(1) + ',' + (h - pad) + ' ' + pad + ',' + (h - pad);
    return '<svg class="spark spark-lg" viewBox="0 0 '+w+' '+h+'"><polygon fill="'+color+'22" points="'+area+'"/><polyline fill="none" stroke="'+color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="'+coords.join(' ')+'"/></svg>';
  }

  window.openSheet = async function openSheet(t) {
    var body = $('#sheet-body'), sheet = $('#sheet');
    if (!body) return;
    body.innerHTML = '<div class="muted sm" style="padding:16px;text-align:center">Loading terminal…</div>';
    if (sheet) sheet.classList.remove('hidden');

    var d = Object.assign({}, t);
    try {
      var res = await fetch('/api/token/' + encodeURIComponent(t.mint), {
        credentials: 'same-origin',
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        var j = await res.json();
        if (j && j.ok !== false) {
          d = Object.assign({}, t, j, {
            sparkline: j.sparkline && j.sparkline.length > 1 ? j.sparkline : (t.sparkline || []),
            trades: Array.isArray(j.trades) ? j.trades : [],
            holders: Array.isArray(j.holders) ? j.holders : [],
            safety: j.safety || {},
            chartEmbedUrl: j.chartEmbedUrl || null,
            volume: j.volume24h != null ? j.volume24h : t.volume,
            changePct: j.change24h != null ? j.change24h : t.changePct,
            liquidity: (j.liquidity != null && j.liquidity < 1e9) ? j.liquidity : ((t.liquidity != null && t.liquidity < 1e9) ? t.liquidity : null)
          });
        }
      }
    } catch (e) { console.warn('[terminal]', e); }

    var chg = d.changePct != null ? Number(d.changePct) : (d.change24h != null ? Number(d.change24h) : 0);
    var up = chg >= 0;
    var state = window.state || { paper: true, buyPreset: 0.1 };
    var mode = state.paper ? 'PAPER' : 'LIVE';
    var buys = d.buys != null ? d.buys : 0, sells = d.sells != null ? d.sells : 0;
    var mint = esc(d.mint);
    var letter = String(d.symbol || '?').slice(0, 2).toUpperCase();
    var logo = d.image
      ? '<img class="token-logo" src="'+esc(d.image)+'" alt="" loading="lazy" referrerpolicy="no-referrer"/>'
      : '<div class="token-logo fallback">'+letter+'</div>';

    var tradeRows = '';
    if (d.trades && d.trades.length) {
      tradeRows = d.trades.slice(0, 40).map(function (tr) {
        var isBuy = tr.type === 'BUY';
        var amt = tr.usd != null ? fmtUsd(tr.usd) : (tr.sol != null ? Number(tr.sol).toFixed(3)+' SOL' : '—');
        return '<div class="tx-row"><span class="'+(isBuy?'up':'down')+'">'+amt+'</span><span class="muted">'+(tr.price!=null?fmtUsd(tr.price):'—')+'</span><span>'+esc(tr.wallet||'—')+'</span><span class="muted">'+ago(tr.ts)+'</span></div>';
      }).join('');
    } else {
      tradeRows = '<div class="muted sm" style="padding:8px 0">No live trades yet. Buys '+buys+' · Sells '+sells+'</div>';
    }

    var holderRows = (d.holders||[]).slice(0,12).map(function(h){
      return '<div class="tx-row"><span>'+esc(h.address)+'</span><span>'+(h.pct!=null?h.pct.toFixed(1)+'%':'—')+'</span></div>';
    }).join('') || (d.holderCount != null ? '<div class="muted sm">Holders: <b>'+d.holderCount+'</b></div>' : '<div class="muted sm">Holders unavailable</div>');

    var sf = d.safety || {};
    function sVal(v) { return v == null ? '—' : (Number(v).toFixed(1) + '%'); }
    var safetyGrid =
      '<div class="safety-grid">' +
      '<div class="safety-box"><b>'+sVal(sf.top10HolderPct)+'</b><span>Top 10 H.</span></div>' +
      '<div class="safety-box"><b>'+sVal(sf.devHoldPct)+'</b><span>Dev H.</span></div>' +
      '<div class="safety-box"><b>'+sVal(sf.snipersHoldPct)+'</b><span>Snipers</span></div>' +
      '<div class="safety-box"><b>'+sVal(sf.insidersPct)+'</b><span>Insiders</span></div>' +
      '<div class="safety-box"><b>'+sVal(sf.bundlersPct)+'</b><span>Bundlers</span></div>' +
      '<div class="safety-box"><b>'+sVal(sf.lpBurnedPct)+'</b><span>LP Burned</span></div></div>';

    var changeRow =
      '<div class="change-row">' +
      '<div class="change-btn"><span class="muted">5m</span><b class="'+(Number(d.change5m||0)>=0?'up':'down')+'">'+fmtPct(d.change5m)+'</b></div>' +
      '<div class="change-btn"><span class="muted">1h</span><b class="'+(Number(d.change1h||0)>=0?'up':'down')+'">'+fmtPct(d.change1h)+'</b></div>' +
      '<div class="change-btn"><span class="muted">6h</span><b class="'+(Number(d.change6h||0)>=0?'up':'down')+'">'+fmtPct(d.change6h)+'</b></div>' +
      '<div class="change-btn"><span class="muted">24h</span><b class="'+(up?'up':'down')+'">'+fmtPct(chg)+'</b></div></div>';

    var chartBlock = d.chartEmbedUrl
      ? '<div class="term-chart embed"><iframe title="chart" src="'+esc(d.chartEmbedUrl)+'" loading="lazy" referrerpolicy="no-referrer"></iframe></div>'
      : '<div class="term-chart">'+spark(d.sparkline, up)+'</div>';

    var buyBar = buys + sells > 0 ? Math.round((buys / (buys + sells)) * 100) : 50;

    body.innerHTML =
      '<div class="term denser" data-mint="'+mint+'">' +
      '<div class="term-head">'+logo+'<div class="term-head-meta"><div class="sym">$'+esc(d.symbol)+' <span class="muted sm">'+esc(d.name)+'</span></div>' +
      '<div class="price '+(up?'up':'down')+'">'+(d.priceUsd!=null?fmtUsd(d.priceUsd):'—')+' <span class="sm">'+fmtPct(chg)+'</span></div></div></div>' +
      chartBlock +
      '<div class="stat-grid">' +
      '<div class="stat"><span class="muted">Mkt Cap</span><b>'+fmtUsd(d.marketCap)+'</b></div>' +
      '<div class="stat"><span class="muted">Liquidity</span><b>'+fmtUsd(d.liquidity)+'</b></div>' +
      '<div class="stat"><span class="muted">Price</span><b>'+(d.priceUsd!=null?fmtUsd(d.priceUsd):'—')+'</b></div>' +
      '<div class="stat"><span class="muted">24h Vol</span><b>'+fmtUsd(d.volume||d.volume24h)+'</b></div>' +
      '<div class="stat"><span class="muted">Buys</span><b class="up">'+buys+'</b></div>' +
      '<div class="stat"><span class="muted">Sells</span><b class="down">'+sells+'</b></div>' +
      '<div class="stat"><span class="muted">Holders</span><b>'+(d.holderCount!=null?d.holderCount:'—')+'</b></div>' +
      '<div class="stat"><span class="muted">Mode</span><b>'+mode+(d.onCurve?' · curve':'')+'</b></div></div>' +
      changeRow +
      '<div class="pressure"><div class="pressure-buy" style="width:'+buyBar+'%"></div></div>' +
      safetyGrid +
      '<div class="term-trade"><div class="side-label">Buy</div><div class="amt-grid">' +
      '<button type="button" class="btn ghost" data-quick-buy="0.1" data-mint="'+mint+'">0.1</button>' +
      '<button type="button" class="btn ghost" data-quick-buy="0.25" data-mint="'+mint+'">0.25</button>' +
      '<button type="button" class="btn ghost" data-quick-buy="0.5" data-mint="'+mint+'">0.5</button>' +
      '<button type="button" class="btn ghost" data-quick-buy="1" data-mint="'+mint+'">1 SOL</button></div>' +
      '<button type="button" class="btn buy-full" data-exec-buy="'+mint+'">BUY '+(state.buyPreset||0.1)+' SOL</button>' +
      '<div class="side-label" style="margin-top:6px">Sell</div><div class="sell-pct">' +
      '<button type="button" class="btn ghost" data-exec-sell-pct="25" data-mint="'+mint+'">25%</button>' +
      '<button type="button" class="btn ghost" data-exec-sell-pct="50" data-mint="'+mint+'">50%</button>' +
      '<button type="button" class="btn ghost" data-exec-sell-pct="75" data-mint="'+mint+'">75%</button>' +
      '<button type="button" class="btn ghost" data-exec-sell-pct="100" data-mint="'+mint+'">100%</button></div>' +
      '<button type="button" class="btn sell-full" data-exec-sell="'+mint+'">SELL 100%</button>' +
      '<p id="trade-status" class="term-status muted"></p></div>' +
      '<div class="term-tabs" id="term-tabs">' +
      '<button type="button" class="active" data-panel="trades">Transactions</button>' +
      '<button type="button" data-panel="holders">Holders</button>' +
      '<button type="button" data-panel="liquidity">Liquidity</button></div>' +
      '<div class="tx-head"><span>Amount</span><span>Price</span><span>Trader</span><span>Age</span></div>' +
      '<div class="term-feed tx-feed" id="term-panel-trades">'+tradeRows+'</div>' +
      '<div class="term-feed hidden" id="term-panel-holders">'+holderRows+'</div>' +
      '<div class="term-feed hidden" id="term-panel-liquidity">' +
      '<div class="tx-row"><span class="muted">Liquidity</span><b>'+fmtUsd(d.liquidity)+'</b></div>' +
      '<div class="tx-row"><span class="muted">Vol 24h</span><b>'+fmtUsd(d.volume||d.volume24h)+'</b></div>' +
      '<div class="tx-row"><span class="muted">Vol 1h</span><b>'+fmtUsd(d.volume1h)+'</b></div></div>' +
      '<div class="muted sm" style="margin-top:10px;word-break:break-all"><code>'+esc(d.mint)+'</code></div></div>';

    var tabs = document.getElementById('term-tabs');
    if (tabs) {
      tabs.onclick = function (e) {
        var b = e.target.closest('[data-panel]');
        if (!b) return;
        tabs.querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        ['trades','holders','liquidity'].forEach(function (id) {
          var el = document.getElementById('term-panel-' + id);
          if (el) el.classList.toggle('hidden', id !== b.dataset.panel);
        });
        var head = body.querySelector('.tx-head');
        if (head) head.style.display = b.dataset.panel === 'trades' ? '' : 'none';
      };
    }
  };
})();
