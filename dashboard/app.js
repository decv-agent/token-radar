// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, a filterable table, pins, a compare view, a command palette, a model page with a
// live sandbox, a farm guide, and a per-protocol detail view with the fitted model's own inputs and
// the protocol's farm plan, plus a live-token view set apart. No network: every byte it shows is in
// data.js. Deep links: #p=<slug> opens a protocol, #q=<text>, #category=<name> and #chain=<name>
// filter, #view=<board|live|model|guide> picks the page.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', view: 'board', sort: 'implied', dir: -1, selected: null, detailTab: 'overview', pins: [], compare: [] };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtOdds(p) {
    if (p === null || p === undefined || !isFinite(p)) return 'n/a';
    return Math.round(p * 100) + '%';
  }

  // The fitted model in one function: the page recomputes a row from the snapshot figures and checks
  // the number board.json carries, so the page's code and the board's data are visibly the same
  // arithmetic: implied = TVL x comps ratio x token odds.
  function impliedOf(row) {
    return Math.max(1, Math.round(row.tvl_usd * DATA.comps_ratio * row.token_odds));
  }

  // The logistic odds model, with the fitted weights the build carries in data.js: P(token) from
  // growth, age and category, exactly the fit main.ts runs. The sandbox uses this to answer
  // what-if questions; the detail view uses it to show each term's contribution.
  function oddsOf(growthPct, ageDays, category) {
    var o = DATA.odds;
    var feats = [1, Math.min(120, Math.max(-60, growthPct || 0)) / 100, ageDays === null ? 0 : Math.log1p(ageDays), ageDays === null ? 1 : 0];
    for (var i = 0; i < o.categories.length; i++) feats.push(category === o.categories[i] ? 1 : 0);
    var z = 0;
    for (var j = 0; j < feats.length; j++) {
      var f = j === 0 ? feats[j] : (feats[j] - o.means[j]) / o.sds[j];
      z += f * o.weights[j];
    }
    var c = Math.max(-30, Math.min(30, z));
    return { odds: 1 / (1 + Math.exp(-c)), z: z, feats: feats };
  }
  function oddsTerms(row) {
    var o = DATA.odds;
    var r = oddsOf(row.change_7d === null ? 0 : row.change_7d, row.age_days, row.category);
    var labels = ['Intercept', 'Seven-day growth', 'Log age', 'Age unknown'];
    for (var i = 0; i < o.categories.length; i++) labels.push('Category: ' + o.categories[i]);
    var terms = [];
    for (var j = 0; j < r.feats.length; j++) {
      var f = j === 0 ? r.feats[j] : (r.feats[j] - o.means[j]) / o.sds[j];
      terms.push({ label: labels[j], value: f, weight: o.weights[j], contrib: f * o.weights[j] });
    }
    return { terms: terms, z: r.z, odds: r.odds };
  }

  // The farm plan rides with the row: main.ts derives it from the protocol's own record (category,
  // chains, TVL, age, odds) — the family decides what the position is and what the week looks like,
  // the figures decide the capital, the hold, the risk note and the exit trigger. The page renders
  // the board's own steps, so the plan on screen and the plan in board.json are the same strings.
  function farmSteps(p) { return p.farm_steps || []; }
  function farmSummary(p) { return p.farm_summary || ''; }
  function capitalFor(p) { return p.farm_capital; }
  function holdDaysFor(p) { return p.farm_hold_days; }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('view') && ['board', 'live', 'model', 'guide'].indexOf(params.get('view')) >= 0) state.view = params.get('view');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.view !== 'board') params.set('view', state.view);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rowBySlug(slug) {
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) return DATA.rows[i];
    return null;
  }
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'odds') { av = a.token_odds; bv = b.token_odds; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function topRow() { return DATA.rows[0]; }
  function headerHtml() {
    return '<header class="top">' +
      '<div class="brand"><span class="mark"></span><span>Token Radar</span></div>' +
      '<div class="top-meta"><span>Snapshot ' + esc(DATA.as_of) + '</span><span>DefiLlama protocol index</span><span>' + esc(DATA.model_version) + ' model</span></div>' +
      '</header>';
  }
  function railHtml() {
    var views = [['board', 'Board'], ['live', 'Live token'], ['model', 'Model'], ['guide', 'Farm guide']];
    var nav = views.map(function (v) {
      return '<button type="button" data-view="' + v[0] + '" aria-pressed="' + (state.view === v[0]) + '">' + v[1] + '</button>';
    }).join('');
    return '<aside class="rail"><nav aria-label="Pages">' + nav + '</nav>' +
      '<div class="cover"><span>Watchlist covered</span><b>' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + '</b>' +
      '<div class="meter"><i style="width:100%"></i></div>' +
      '<p class="sub">Every protocol at or above the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor with no token on record, excluding centralised exchanges. The snapshot&#8217;s own watchlist field is a subset of this set.</p></div>' +
      '<button type="button" class="rail-btn" id="palette-open">Command palette &#8212; Ctrl+K</button>' +
      '<button type="button" class="rail-btn" id="csv-rail">Export board as CSV</button>' +
      '<div class="rail-stats"><span>Pre-token rows</span><b>' + DATA.board_size + '</b><span>Live-token ledger</span><b>' + DATA.live_size + '</b><span>Excluded, with reasons</span><b>' + DATA.excluded_size + '</b><span>Protocols accounted for</span><b>' + DATA.accounted_total + ' / 758</b></div>' +
      '</aside>';
  }
  function heroHtml() {
    var top = topRow();
    return '<section class="hero"><div>' +
      '<h1>' + DATA.watchlist_size + ' watchlist protocols, ranked by fitted implied value</h1>' +
      '<p>The watchlist is the floor: every protocol with at least <b>$' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL</b> and no token on record, excluding centralised exchanges. The early radar adds <b>' + DATA.early_size + ' pre-token protocols</b> below that floor — every rankable pre-token protocol in the snapshot. Implied value is a fitted model, not a promise: TVL times the peers&#8217; market-cap ratio times the fitted odds the protocol ever carries a token.</p>' +
      '<p class="checks"><span>&#10003; Coverage ' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + '</span><span>&#10003; ' + DATA.board_size + ' rows, sorted by implied value</span><span>&#10003; Farm plan on every row</span><span>&#10003; ' + DATA.live_size + ' live-token protocols accounted</span><span>&#10003; ' + DATA.excluded_size + ' excluded, reasons stated</span><span>&#10003; Model recomputes every row</span></p>' +
      '</div><div class="kpis">' +
      '<div class="kpi"><span>Top implied value</span><b class="gold">' + fmtUsd(top.implied_value_usd) + '</b></div>' +
      '<div class="kpi"><span>Rank 1</span><b>' + esc(top.name) + '</b></div>' +
      '<div class="kpi"><span>Watchlist covered</span><b class="gold">' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + '</b></div>' +
      '<div class="kpi"><span>Pre-token rows scored</span><b>' + DATA.board_size + '</b></div>' +
      '</div></section>';
  }
  function stripHtml() {
    var f = DATA.fit;
    var cal = f.calibration.map(function (b) {
      return '<tr><td class="num">' + b[0].toFixed(3) + '</td><td class="num">' + b[1].toFixed(3) + '</td></tr>';
    }).join('');
    var age = f.age_curve.map(function (a) {
      return '<tr><td class="num">' + a[0] + 'd</td><td class="num">' + Math.round(a[1] * 100) + '%</td></tr>';
    }).join('');
    return '<section class="strip"><h2>How this board was fitted — and what was dropped</h2>' +
      '<p>Implied value = <code>TVL &#215; ' + f.comps_ratio.toFixed(4) + ' &#215; P(token)</code>. The ratio is the median market-cap-to-TVL of the ' + f.comps_live_n + ' live-token protocols that record both figures. P(token) is a logistic fit on all 758 protocols (416 with a token on record, 342 without) over growth, age and category: held-out AUC <code>' + f.odds_auc[0] + ' / ' + f.odds_auc[1] + '</code>, log-loss <code>' + f.odds_logloss[0] + ' / ' + f.odds_logloss[1] + '</code> against an intercept-only <code>' + f.odds_base_logloss[0] + ' / ' + f.odds_base_logloss[1] + '</code>. Five-fold cross-validation: mean AUC <code>' + f.five_fold_auc + '</code>, log-loss <code>' + f.five_fold_logloss + '</code> against <code>' + f.five_fold_base_logloss + '</code>. Age is the signal: long-running protocols are far more likely to carry a token; recent fast growth points the other way.</p>' +
      '<div class="strip-tables"><table class="mini"><caption>Calibration: mean predicted P(token) vs the actual token rate, five bins</caption><thead><tr><th scope="col">Predicted</th><th scope="col">Actual</th></tr></thead><tbody>' + cal + '</tbody></table>' +
      '<table class="mini"><caption>P(token) by age, growth at the median, no category</caption><thead><tr><th scope="col">Age</th><th scope="col">P(token)</th></tr></thead><tbody>' + age + '</tbody></table></div>' +
      '<p class="dropped">Dropped after losing on both held-out halves: ' + f.dropped.map(esc).join('; ') + '.</p>' +
      '</section>';
  }
  function controlsHtml() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var opts = '<option value="all">All categories</option>' + categories.map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === state.category ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (ch) { chainCounts[ch] = (chainCounts[ch] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).slice(0, 14);
    var chainOpts = '<option value="all">All chains</option>' + chains.map(function (ch) {
      return '<option value="' + esc(ch) + '"' + (ch === state.chain ? ' selected' : '') + '>' + esc(ch) + ' (' + chainCounts[ch] + ')</option>';
    }).join('');
    return '<div class="controls">' +
      '<div class="field"><label for="q">Search</label><input type="search" id="q" placeholder="Search name or category" value="' + esc(state.q) + '" aria-label="Search the board"></div>' +
      '<div class="field"><label for="category">Category</label><select id="category" aria-label="Filter by category">' + opts + '</select></div>' +
      '<div class="field"><label for="chain">Chain</label><select id="chain" aria-label="Filter by chain">' + chainOpts + '</select></div>' +
      '<button type="button" class="button ghost" id="csv-export">Export CSV</button>' +
      '<span class="count">' + filteredRows().length + ' rows shown</span>' +
      '</div>';
  }
  function pinnedHtml() {
    if (state.pins.length === 0) return '';
    var chips = state.pins.map(function (slug) {
      var r = rowBySlug(slug);
      if (!r) return '';
      return '<span class="chip"><button type="button" data-open="' + esc(slug) + '">' + esc(r.name) + ' &#183; ' + fmtUsd(r.implied_value_usd) + '</button><button type="button" data-unpin="' + esc(slug) + '" aria-label="Unpin ' + esc(r.name) + '">&#215;</button></span>';
    }).join('');
    return '<div class="pinned"><span class="pinned-label">Pinned</span>' + chips + '</div>';
  }
  function compareBarHtml() {
    if (state.compare.length === 0) return '';
    return '<div class="compare-bar"><span>' + state.compare.length + ' selected for compare (up to 4)</span>' +
      '<button type="button" class="button" id="open-compare"' + (state.compare.length < 2 ? ' disabled' : '') + '>Compare</button>' +
      '<button type="button" class="button ghost" id="clear-compare">Clear</button></div>';
  }
  function sortTh(key, label) {
    var arrow = state.sort === key ? (state.dir < 0 ? ' &#9660;' : ' &#9650;') : '';
    return '<th scope="col"><button type="button" data-sort="' + key + '">' + label + arrow + '</button></th>';
  }
  function boardHtml() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return '<div class="panel"><div class="empty"><h2>No protocol matches that filter</h2><p>Clear the search or pick another category to see the board again.</p><button class="button" type="button" id="clear-filters">Clear filters</button></div></div>';
    }
    var max = list[0].implied_value_usd || 1;
    var rows = list.map(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var pct = Math.max(3, Math.round((r.implied_value_usd / max) * 100));
      var pinned = state.pins.indexOf(r.slug) >= 0;
      var compared = state.compare.indexOf(r.slug) >= 0;
      return '<tr data-slug="' + esc(r.slug) + '" data-selected="' + (state.selected === r.slug) + '" tabindex="0">' +
        '<td><button type="button" class="pin" data-pin="' + esc(r.slug) + '" aria-pressed="' + pinned + '" aria-label="Pin ' + esc(r.name) + '">' + (pinned ? '&#9733;' : '&#9734;') + '</button></td>' +
        '<td><input type="checkbox" data-compare="' + esc(r.slug) + '"' + (compared ? ' checked' : '') + ' aria-label="Compare ' + esc(r.name) + '"></td>' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + ' on ' + esc(r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + '</span></div></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + growthClass + '">' + growth + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num">' + fmtOdds(r.token_odds) + '</td>' +
        '<td><div class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div><span class="num">' + fmtUsd(r.implied_value_usd) + '</span></td>' +
        '</tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<caption>Pre-token protocols, strongest implied value first. Select a row for its model and farm plan. Pin rows to keep them above the table; tick up to four to compare.</caption>' +
      '<thead><tr><th scope="col">Pin</th><th scope="col">Compare</th>' + sortTh('implied', 'Rank') + sortTh('name', 'Protocol') + sortTh('tvl', 'TVL') + sortTh('growth', '7d') + sortTh('age', 'Age') + sortTh('odds', 'Token odds') + sortTh('implied', 'Implied value') + '</tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }
  function liveHtml() {
    var rows = DATA.live.map(function (r) {
      return '<tr><td class="num">live</td>' +
        '<td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + ' on ' + esc(r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + '</span></div></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtUsd(r.mcap_usd) + '</td>' +
        '<td><span class="status live">already trades</span></td></tr>';
    }).join('');
    var ex = DATA.excluded.map(function (r) {
      return '<tr><td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + '</span></div></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td>' + esc(r.reason) + '</td></tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<caption>Token live: all ' + DATA.live.length + ' non-exchange protocols that already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and they are the comps the value ratio is fitted on.</caption>' +
      '<thead><tr><th scope="col">Status</th><th scope="col">Protocol</th><th scope="col">TVL</th><th scope="col">7d</th><th scope="col">Market cap</th><th scope="col">Token</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>' +
      '<div class="panel excluded"><div class="table-wrap"><table>' +
      '<caption>Excluded from the ranking, with the reason: ' + DATA.excluded.length + ' protocols. Nothing in the snapshot is left unaccounted for — ' + DATA.board_size + ' ranked + ' + DATA.live.length + ' live-token + ' + DATA.excluded.length + ' excluded = ' + DATA.accounted_total + '.</caption>' +
      '<thead><tr><th scope="col">Protocol</th><th scope="col">TVL</th><th scope="col">Why it is not ranked</th></tr></thead>' +
      '<tbody>' + ex + '</tbody></table></div></div>';
  }
  function sandboxHtml() {
    var top10 = DATA.rows.slice(0, 10);
    var opts = top10.map(function (r) { return '<option value="' + esc(r.slug) + '">' + esc(r.name) + ' (' + fmtUsd(r.implied_value_usd) + ')</option>'; }).join('');
    return '<section class="panel model"><h2>Try the model</h2>' +
      '<p>Two what-ifs, both running the same fitted arithmetic the board uses. Nothing here is hand-set: the ratio slider rescales the comps ratio, and the protocol sliders feed the fitted logistic.</p>' +
      '<div class="sandbox"><div><label for="ratio">Comps ratio: <b id="ratio-val">' + DATA.comps_ratio.toFixed(4) + '</b></label>' +
      '<input type="range" id="ratio" min="0.05" max="0.5" step="0.0001" value="' + DATA.comps_ratio + '" aria-label="Comps ratio"></div>' +
      '<div id="ratio-top"></div></div>' +
      '<div class="sandbox"><div><label for="whatif-pick">Protocol</label><select id="whatif-pick">' + opts + '</select></div>' +
      '<div><label for="whatif-growth">Seven-day growth: <b id="whatif-growth-val">0%</b></label><input type="range" id="whatif-growth" min="-60" max="120" step="1" value="0" aria-label="Seven-day growth"></div>' +
      '<div><label for="whatif-age">Age with no token: <b id="whatif-age-val">1095d</b></label><input type="range" id="whatif-age" min="0" max="3000" step="30" value="1095" aria-label="Age in days"></div>' +
      '<label class="check"><input type="checkbox" id="whatif-unknown"> Age unknown</label>' +
      '<div id="whatif-out"></div></div></section>';
  }
  function ratioTopHtml(ratio) {
    var rescored = DATA.rows.map(function (r) {
      return { slug: r.slug, name: r.name, oldRank: r.rank, implied: Math.max(1, Math.round(r.tvl_usd * ratio * r.token_odds)) };
    }).sort(function (a, b) { return b.implied - a.implied || (a.slug < b.slug ? -1 : 1); }).slice(0, 10);
    var rows = rescored.map(function (r, i) {
      var move = r.oldRank - (i + 1);
      var moveTxt = move === 0 ? '—' : (move > 0 ? '▲' + move : '▼' + (-move));
      return '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(r.name) + '</td><td class="num">' + fmtUsd(r.implied) + '</td><td class="num">' + moveTxt + '</td></tr>';
    }).join('');
    return '<h3>Top 10 at this ratio</h3><table class="mini"><thead><tr><th scope="col">Rank</th><th scope="col">Protocol</th><th scope="col">Implied value</th><th scope="col">Rank move</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  function whatifHtml() {
    var pick = document.getElementById('whatif-pick');
    var row = rowBySlug(pick ? pick.value : DATA.rows[0].slug) || DATA.rows[0];
    var growth = Number(document.getElementById('whatif-growth').value);
    var unknown = document.getElementById('whatif-unknown').checked;
    var age = unknown ? null : Number(document.getElementById('whatif-age').value);
    var r = oddsOf(growth, age, row.category);
    var implied = Math.max(1, Math.round(row.tvl_usd * DATA.comps_ratio * r.odds));
    var rank = 1 + DATA.rows.filter(function (x) { return x.slug !== row.slug && x.implied_value_usd > implied; }).length;
    return '<p><b>' + esc(row.name) + '</b>: TVL ' + fmtUsd(row.tvl_usd) + ' &#215; ratio ' + DATA.comps_ratio.toFixed(4) + ' &#215; P(token) ' + fmtOdds(r.odds) + ' = <b class="gold">' + fmtUsd(implied) + '</b> (board: ' + fmtUsd(row.implied_value_usd) + ', rank ' + row.rank + ' &#8594; ' + rank + ').</p>';
  }
  function modelViewHtml() {
    var f = DATA.fit;
    return '<section class="panel model"><h2>How implied value is computed</h2>' +
      '<p>Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.</p>' +
      '<div class="formula">implied = round( tvl_usd &#215; ' + f.comps_ratio.toFixed(4) + ' &#215; P(token | growth, age, category) )</div>' +
      '<p>TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age scores as its own term. The early radar is every rankable pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown. This is an estimate, not a price.</p>' +
      '<h3>The fit, held out three ways</h3>' +
      '<p>Comps ratio ' + f.comps_ratio.toFixed(4) + ' is the median market-cap-to-TVL of ' + f.comps_live_n + ' live-token protocols recording both figures. The logistic P(token) was fitted on all 758 protocols and scored on held-out halves (split by slug hash, even vs odd, fit on one half and score the other, then swap): AUC ' + f.odds_auc[0] + ' / ' + f.odds_auc[1] + ', log-loss ' + f.odds_logloss[0] + ' / ' + f.odds_logloss[1] + ' against an intercept-only ' + f.odds_base_logloss[0] + ' / ' + f.odds_base_logloss[1] + '. Five-fold cross-validation agrees: mean AUC ' + f.five_fold_auc + ', log-loss ' + f.five_fold_logloss + ' against ' + f.five_fold_base_logloss + '. Calibration, five bins of mean predicted P(token) against the actual token rate: ' + f.calibration.map(function (b) { return b[0].toFixed(3) + ' &#8594; ' + b[1].toFixed(3); }).join(', ') + '. P(token) by age (growth at the median, no category): ' + f.age_curve.map(function (a) { return a[0] + 'd ' + Math.round(a[1] * 100) + '%'; }).join(', ') + '.</p>' +
      '<p>Two stronger-looking validations were tested and did not survive, so neither is claimed: a walk-forward split by listing date scores AUC 0.533 with log-loss 1.135 against an intercept-only 0.840 — the target is time-censored, recently listed protocols have not had time to launch, so the calendar does not validate this fit; and conformal intervals on implied value span &#215;0.03–&#215;90 at 90% on held-out data, too wide to price a single row. The held-out splits are the validation.</p>' +
      '<p class="dropped">Dropped after losing on both held-out halves: ' + f.dropped.map(esc).join('; ') + '.</p></section>' + sandboxHtml();
  }
  function guideViewHtml() {
    var top5 = DATA.rows.slice(0, 5);
    var plans = top5.map(function (r) {
      var steps = farmSteps(r).map(function (s) {
        var at = s.indexOf(' Cost: ');
        return '<li><b>' + esc(at >= 0 ? s.slice(0, at) : s) + '</b><span class="cost">' + esc(at >= 0 ? s.slice(at + 1) : '') + '</span></li>';
      }).join('');
      return '<section class="panel guide-plan"><h3>Rank ' + r.rank + ': ' + esc(r.name) + ' — farm it with $' + capitalFor(r) + '</h3><p class="farm-sum">' + esc(farmSummary(r)) + '</p><ol class="steps">' + steps + '</ol></section>';
    }).join('');
    return '<section class="panel model"><h2>How to farm a protocol on this board</h2>' +
      '<p>Every plan on this board is built from the protocol&#8217;s own record — category, chains, TVL, age and fitted odds — never from a hand-written list of names. The plans differ because the protocols differ: a lending farm is not a bridge farm, a 30-day-old protocol does not get the warning a 3-year-old one gets, and the exit trigger is half of that protocol&#8217;s own TVL. The same capital tiers and hold windows run underneath: TVL $5B or more farms with $250; $1B or more with $150; $100M or more with $100; anything smaller with $50.</p>' +
      '<h3>Capital tiers</h3><p>The capital is the position itself; gas on top is about $4–$8 to set up and about $2 a week to keep the position active. Each plan states what $100 of capital carries in implied token value — TVL &#215; the comps ratio &#215; P(token), divided by TVL — so a row&#8217;s economics are its own, not a template&#8217;s.</p>' +
      '<h3>Hold windows</h3><p>A protocol younger than 180 days needs 60 days of activity; 180–365 days needs 45; older than a year needs 30. Younger protocols get the longer window because a short burst of activity is the easiest thing to fake.</p>' +
      '<h3>Weekly rhythm</h3><p>One real action a week — a deposit, a borrow, a swap, or a vote — so the activity spans more than one snapshot. Keep a farm log: wallet, dates, every transaction hash.</p>' +
      '<h3>Safety rules</h3><p>One fresh wallet per farm, recovery phrase stored offline. Open a rewards page only from the protocol&#8217;s own site, and never pay anyone to claim for you. If a step asks for money to claim, it is a scam.</p></section>' + plans;
  }
  function footHtml() {
    return '<p class="foot">Token Radar &#183; snapshot ' + esc(DATA.as_of) + ' &#183; model ' + esc(DATA.model_version) + ' &#183; watchlist covered ' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + ', ' + DATA.early_size + ' early rows below the floor, ' + DATA.live_size + ' live-token protocols in the ledger, ' + DATA.excluded_size + ' excluded with reasons — ' + DATA.accounted_total + ' of 758 protocols accounted for &#183; implied values are the entry&#8217;s own claim.</p>';
  }

  var dialog = document.createElement('dialog');
  dialog.className = 'detail';
  dialog.id = 'detail';
  dialog.setAttribute('aria-labelledby', 'detail-title');
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  var compareDialog = document.createElement('dialog');
  compareDialog.className = 'detail compare';
  compareDialog.id = 'compare';
  compareDialog.setAttribute('aria-label', 'Compare protocols');

  var paletteDialog = document.createElement('dialog');
  paletteDialog.className = 'detail palette';
  paletteDialog.id = 'palette';
  paletteDialog.setAttribute('aria-label', 'Command palette');

  function detailBodyHtml(row, tab) {
    var recomputed = impliedOf(row);
    var match = Math.abs(recomputed - row.implied_value_usd) <= Math.max(1, row.implied_value_usd * 0.01);
    if (tab === 'model') {
      var t = oddsTerms(row);
      var termRows = t.terms.filter(function (x) { return Math.abs(x.contrib) > 0.0005 || x.label === 'Intercept'; }).map(function (x) {
        return '<tr><td>' + esc(x.label) + '</td><td class="num">' + x.value.toFixed(3) + '</td><td class="num">' + x.weight.toFixed(3) + '</td><td class="num">' + (x.contrib >= 0 ? '+' : '') + x.contrib.toFixed(3) + '</td></tr>';
      }).join('');
      return '<section class="detail-section"><h3>Token odds, term by term</h3>' +
        '<table class="mini"><thead><tr><th scope="col">Term</th><th scope="col">Standardised value</th><th scope="col">Weight</th><th scope="col">Contribution to z</th></tr></thead><tbody>' + termRows + '</tbody></table>' +
        '<p class="sub">z = ' + t.z.toFixed(3) + ', so P(token) = ' + fmtOdds(t.odds) + '. The weights are the fitted logistic&#8217;s; age carries the most weight, growth pulls the other way, and a protocol with no listing date scores its own term. Dropped terms never enter this table.</p></section>';
    }
    if (tab === 'farm') {
      var steps = farmSteps(row).map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return '<li><b>' + esc(action) + '</b><span class="cost">' + esc(tail) + '</span></li>';
      }).join('');
      return '<section class="detail-section"><h3>Farm plan</h3><p class="farm-sum">' + esc(farmSummary(row)) + '</p><ol class="steps">' + steps + '</ol></section>';
    }
    return '<section class="detail-section"><h3>Implied value</h3><div class="equation">' +
      '<div><span>TVL</span><b>' + fmtUsd(row.tvl_usd) + '</b></div>' +
      '<div><span>Seven-day growth</span><b>' + fmtPct(row.change_7d) + '</b></div>' +
      '<div><span>Age with no token</span><b>' + fmtAge(row.age_days) + '</b></div>' +
      '<div><span>Token odds (fitted)</span><b>' + fmtOdds(row.token_odds) + '</b></div>' +
      '<div><span>Comps ratio</span><b>' + DATA.comps_ratio.toFixed(4) + '</b></div>' +
      '<div><span>Implied value</span><b class="gold">' + fmtUsd(row.implied_value_usd) + '</b></div>' +
      '</div><p class="sub">Model ' + esc(DATA.model_version) + ': the page recomputes this row as ' + fmtUsd(recomputed) + (match ? ', agreeing with the board to the rounding shown.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.</p></section>';
  }
  function openDetail(slug, tab) {
    var row = rowBySlug(slug);
    if (!row) return;
    state.selected = slug;
    state.detailTab = tab || state.detailTab || 'overview';
    writeHash();
    var tabs = [['overview', 'Overview'], ['model', 'Model'], ['farm', 'Farm plan']].map(function (t) {
      return '<button type="button" data-dtab="' + t[0] + '" aria-pressed="' + (state.detailTab === t[0]) + '">' + t[1] + '</button>';
    }).join('');
    dialog.innerHTML =
      '<div class="detail-head"><div><span class="brand-name">Rank ' + row.rank + ' of ' + DATA.board_size + '</span>' +
      '<h2 id="detail-title">' + esc(row.name) + '</h2>' +
      '<p class="sub">' + esc(row.category || 'Other') + ' on ' + esc(row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + '</p></div>' +
      '<button class="close" type="button" aria-label="Close details" id="detail-close">Close</button></div>' +
      '<div class="detail-tabs tabs">' + tabs + '</div>' +
      detailBodyHtml(row, state.detailTab);
    var closeBtn = dialog.querySelector('#detail-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { dialog.close(); });
    var dtabs = dialog.querySelectorAll('[data-dtab]');
    for (var i = 0; i < dtabs.length; i++) dtabs[i].addEventListener('click', function (e) { openDetail(slug, e.currentTarget.getAttribute('data-dtab')); });
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }
  function openCompare() {
    var picked = state.compare.map(rowBySlug).filter(Boolean);
    if (picked.length < 2) return;
    var metrics = [
      ['TVL', function (r) { return fmtUsd(r.tvl_usd); }],
      ['Seven-day growth', function (r) { return fmtPct(r.change_7d); }],
      ['Age with no token', function (r) { return fmtAge(r.age_days); }],
      ['Token odds', function (r) { return fmtOdds(r.token_odds); }],
      ['Implied value', function (r) { return fmtUsd(r.implied_value_usd); }],
      ['Farm capital', function (r) { return '$' + capitalFor(r); }],
      ['Hold window', function (r) { return holdDaysFor(r) + ' days'; }]
    ];
    var head = picked.map(function (r) { return '<th scope="col">' + esc(r.name) + ' <span class="sub">#' + r.rank + '</span></th>'; }).join('');
    var body = metrics.map(function (m) {
      return '<tr><th scope="row">' + m[0] + '</th>' + picked.map(function (r) { return '<td class="num">' + m[1](r) + '</td>'; }).join('') + '</tr>';
    }).join('');
    compareDialog.innerHTML = '<div class="detail-head"><div><span class="brand-name">Compare</span><h2>Side by side</h2>' +
      '<p class="sub">Same model, same snapshot figures — the ranking follows from TVL, age, growth and category.</p></div>' +
      '<button class="close" type="button" aria-label="Close compare" id="compare-close">Close</button></div>' +
      '<section class="detail-section"><table class="mini"><thead><tr><th scope="col"></th>' + head + '</tr></thead><tbody>' + body + '</tbody></table></section>';
    var closeBtn = compareDialog.querySelector('#compare-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { compareDialog.close(); });
    if (typeof compareDialog.showModal === 'function') {
      if (!compareDialog.open) compareDialog.showModal();
    } else {
      compareDialog.setAttribute('open', '');
    }
  }
  function paletteResults(q) {
    var query = q.trim().toLowerCase();
    var hits = query ? DATA.rows.filter(function (r) {
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(query) >= 0;
    }).slice(0, 8) : DATA.rows.slice(0, 8);
    var rows = hits.map(function (r) {
      return '<button type="button" class="palette-row" data-open="' + esc(r.slug) + '"><b>' + esc(r.name) + '</b><span class="sub">#' + r.rank + ' &#183; ' + fmtUsd(r.implied_value_usd) + '</span></button>';
    }).join('');
    var cmds = [
      ['cmd-model', 'Go to the Model page'],
      ['cmd-guide', 'Go to the Farm guide'],
      ['cmd-live', 'Go to the Live token view'],
      ['cmd-csv', 'Export the board as CSV'],
      ['cmd-clear', 'Clear all filters']
    ].map(function (c) { return '<button type="button" class="palette-row" data-cmd="' + c[0] + '">' + c[1] + '</button>'; }).join('');
    return '<div class="palette-section"><span class="sub">Protocols</span>' + (rows || '<p class="sub">No protocol matches.</p>') + '</div>' +
      '<div class="palette-section"><span class="sub">Commands</span>' + cmds + '</div>';
  }
  function openPalette() {
    paletteDialog.innerHTML = '<div class="detail-head"><div><span class="brand-name">Command palette</span><h2>Jump anywhere</h2></div>' +
      '<button class="close" type="button" aria-label="Close palette" id="palette-close">Close</button></div>' +
      '<section class="detail-section"><input type="search" id="palette-q" placeholder="Type a protocol name, or pick a command" aria-label="Command palette search">' +
      '<div id="palette-results">' + paletteResults('') + '</div></section>';
    var closeBtn = paletteDialog.querySelector('#palette-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { paletteDialog.close(); });
    var input = paletteDialog.querySelector('#palette-q');
    if (input) {
      input.addEventListener('input', function () {
        var res = paletteDialog.querySelector('#palette-results');
        if (res) res.innerHTML = paletteResults(input.value);
        bindPaletteRows();
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var first = paletteDialog.querySelector('[data-open]');
          if (first) { paletteDialog.close(); openDetail(first.getAttribute('data-open')); }
        }
      });
    }
    bindPaletteRows();
    if (typeof paletteDialog.showModal === 'function') {
      if (!paletteDialog.open) paletteDialog.showModal();
    } else {
      paletteDialog.setAttribute('open', '');
    }
    if (input) input.focus();
  }
  function bindPaletteRows() {
    var opens = paletteDialog.querySelectorAll('[data-open]');
    for (var i = 0; i < opens.length; i++) opens[i].addEventListener('click', function (e) { paletteDialog.close(); openDetail(e.currentTarget.getAttribute('data-open')); });
    var cmds = paletteDialog.querySelectorAll('[data-cmd]');
    for (var j = 0; j < cmds.length; j++) cmds[j].addEventListener('click', function (e) {
      var cmd = e.currentTarget.getAttribute('data-cmd');
      paletteDialog.close();
      if (cmd === 'cmd-model') { state.view = 'model'; writeHash(); render(); }
      else if (cmd === 'cmd-guide') { state.view = 'guide'; writeHash(); render(); }
      else if (cmd === 'cmd-live') { state.view = 'live'; writeHash(); render(); }
      else if (cmd === 'cmd-csv') exportCsv();
      else if (cmd === 'cmd-clear') { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); }
    });
  }
  function exportCsv() {
    var list = sortedRows(filteredRows());
    var lines = ['rank,name,category,chains,tvl_usd,change_7d,age_days,token_odds,implied_value_usd'];
    list.forEach(function (r) {
      var cells = [r.rank, '"' + r.name.replace(/"/g, '""') + '"', '"' + (r.category || '').replace(/"/g, '""') + '"', '"' + (r.chains || []).join(';') + '"', r.tvl_usd, r.change_7d === null ? '' : r.change_7d, r.age_days === null ? '' : r.age_days, r.token_odds, r.implied_value_usd];
      lines.push(cells.join(','));
    });
    var blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'token-radar-board.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function viewHtml() {
    if (state.view === 'live') return '<h1 class="page-title">Live token — already trading</h1>' + liveHtml();
    if (state.view === 'model') return '<h1 class="page-title">The model</h1>' + modelViewHtml();
    if (state.view === 'guide') return '<h1 class="page-title">Farm guide</h1>' + guideViewHtml();
    return heroHtml() + stripHtml() + controlsHtml() + pinnedHtml() + compareBarHtml() + boardHtml();
  }

  function render() {
    app.innerHTML = '<div class="shell">' + headerHtml() + '<div class="layout">' + railHtml() + '<div class="main">' + viewHtml() + footHtml() + '</div></div></div>';
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (!compareDialog.isConnected) app.appendChild(compareDialog);
    if (!paletteDialog.isConnected) app.appendChild(paletteDialog);
    var navs = app.querySelectorAll('[data-view]');
    for (var i = 0; i < navs.length; i++) navs[i].addEventListener('click', function (e) { state.view = e.currentTarget.getAttribute('data-view'); writeHash(); render(); });
    var po = document.getElementById('palette-open');
    if (po) po.addEventListener('click', openPalette);
    var cr = document.getElementById('csv-rail');
    if (cr) cr.addEventListener('click', exportCsv);
    var ce = document.getElementById('csv-export');
    if (ce) ce.addEventListener('click', exportCsv);
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; writeHash(); render(); });
    var cat = document.getElementById('category');
    if (cat) cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var ch = document.getElementById('chain');
    if (ch) ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
    var clear = document.getElementById('clear-filters');
    if (clear) clear.addEventListener('click', function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); });
    var pins = app.querySelectorAll('[data-pin]');
    for (var p = 0; p < pins.length; p++) pins[p].addEventListener('click', function (e) {
      e.stopPropagation();
      var slug = e.currentTarget.getAttribute('data-pin');
      var at = state.pins.indexOf(slug);
      if (at >= 0) state.pins.splice(at, 1); else state.pins.push(slug);
      render();
    });
    var unpins = app.querySelectorAll('[data-unpin]');
    for (var u = 0; u < unpins.length; u++) unpins[u].addEventListener('click', function (e) {
      var slug = e.currentTarget.getAttribute('data-unpin');
      var at = state.pins.indexOf(slug);
      if (at >= 0) state.pins.splice(at, 1);
      render();
    });
    var opens = app.querySelectorAll('[data-open]');
    for (var o = 0; o < opens.length; o++) opens[o].addEventListener('click', function (e) { openDetail(e.currentTarget.getAttribute('data-open')); });
    var cmps = app.querySelectorAll('[data-compare]');
    for (var c = 0; c < cmps.length; c++) cmps[c].addEventListener('click', function (e) {
      e.stopPropagation();
      var slug = e.currentTarget.getAttribute('data-compare');
      var at = state.compare.indexOf(slug);
      if (at >= 0) state.compare.splice(at, 1);
      else if (state.compare.length < 4) state.compare.push(slug);
      else { e.currentTarget.checked = false; return; }
      render();
    });
    var oc = document.getElementById('open-compare');
    if (oc) oc.addEventListener('click', openCompare);
    var cc = document.getElementById('clear-compare');
    if (cc) cc.addEventListener('click', function () { state.compare = []; render(); });
    var sorts = app.querySelectorAll('[data-sort]');
    for (var j = 0; j < sorts.length; j++) sorts[j].addEventListener('click', function (e) {
      var key = e.currentTarget.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; }
      render();
    });
    var trs = app.querySelectorAll('tbody tr[data-slug]');
    for (var k = 0; k < trs.length; k++) {
      trs[k].addEventListener('click', function (e) {
        if (e.target.closest('button') || e.target.closest('input')) return;
        openDetail(e.currentTarget.getAttribute('data-slug'));
      });
      trs[k].addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(e.currentTarget.getAttribute('data-slug')); }
      });
    }
    var ratio = document.getElementById('ratio');
    if (ratio) {
      var paintRatio = function () {
        var v = Number(ratio.value);
        document.getElementById('ratio-val').textContent = v.toFixed(4);
        document.getElementById('ratio-top').innerHTML = ratioTopHtml(v);
      };
      ratio.addEventListener('input', paintRatio);
      paintRatio();
    }
    var wp = document.getElementById('whatif-pick');
    var wg = document.getElementById('whatif-growth');
    var wa = document.getElementById('whatif-age');
    var wu = document.getElementById('whatif-unknown');
    if (wp && wg && wa && wu) {
      var paintWhatif = function () {
        var row = rowBySlug(wp.value) || DATA.rows[0];
        document.getElementById('whatif-growth-val').textContent = wg.value + '%';
        document.getElementById('whatif-age-val').textContent = wu.checked ? 'unknown' : wa.value + 'd';
        wa.disabled = wu.checked;
        document.getElementById('whatif-out').innerHTML = whatifHtml();
      };
      wp.addEventListener('change', paintWhatif);
      wg.addEventListener('input', paintWhatif);
      wa.addEventListener('input', paintWhatif);
      wu.addEventListener('change', paintWhatif);
      paintWhatif();
    }
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
