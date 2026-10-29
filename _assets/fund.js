/* ===========================================================
   单只基金深度页引擎
   用法：页面里先设 window.FUND = { code: '501018' }
   依赖：data.js → chart.js → anim.js
   =========================================================== */
(function () {
  'use strict';
  var D = window.DATA, U = window.UI, C2 = window.Chart2;
  if (!D || !U) return;
  var CFG = window.FUND || {};
  var CODE = CFG.code;
  function $(id) { return document.getElementById(id); }
  function tone(v) { return v > 0.0001 ? 'up' : (v < -0.0001 ? 'down' : 'mute'); }

  var F = null;
  for (var i = 0; i < D.funds.length; i++) if (D.funds[i].code === CODE) { F = D.funds[i]; break; }
  if (!F) { console.error('未找到基金', CODE); return; }

  /* 同板块全部基金（用于排名与对比） */
  var PEERS = D.funds.filter(function (x) { return x.sec === F.sec; })
    .sort(function (a, b) { return b.ret250 - a.ret250; });
  var PEER_RANK = PEERS.indexOf(F) + 1;

  /* 全 40 只排名 */
  var ALL = D.funds.slice().sort(function (a, b) { return b.ret250 - a.ret250; });
  var GLOBAL_RANK = ALL.indexOf(F) + 1;

  var SECTOR = null;
  D.sectors.forEach(function (s) { if (s.sec === F.sec) SECTOR = s; });

  var axis = D.axis || [];
  var N = axis.length;

  function trendName(t) { return { up: '上升', down: '下降', flat: '横盘' }[t] || '—'; }
  function grpName(g) {
    return { fund: '基金·稳健型', stock: '股票·权益型', commodity: '商品型' }[g] || g;
  }

  /* =====================================================
     1. 面包屑 & Hero
     ===================================================== */
  (function () {
    var el = $('fCrumb');
    if (el) {
      el.innerHTML = '<a href="../总览.html">首页</a> <span>/</span> ' +
        '<a href="../' + ({ fund: '基金', stock: '股票', commodity: '商品' }[F.grp] || '总览') +
        '.html">' + grpName(F.grp) + '</a> <span>/</span> ' +
        '<a href="../板块/' + F.secName + '.html">' + F.secName + '</a> <span>/</span> ' +
        '<span style="color:#e8eef8">' + U.esc(F.name) + '</span>';
    }

    var t = $('fName');
    if (t) t.textContent = F.name;
    var c = $('fCode');
    if (c) c.textContent = F.code + ' · ' + (F.ftype || '') + ' · ' + F.secName;
    var r = $('fRet');
    if (r) {
      r.textContent = U.fmt(F.ret250);
      r.className = 'big-num ' + tone(F.ret250);
    }
    var sub = $('fRetSub');
    if (sub) sub.textContent = '近 250 个交易日';

    /* 标签行 */
    /* 加入自选按钮 */
    var wl = $('fWatch');
    if (wl) {
      var KEY = 'fundboard_watchlist';
      function getList() {
        try {
          var a = JSON.parse(localStorage.getItem(KEY) || '[]');
          return Array.isArray(a) ? a : [];
        } catch (e) { return []; }
      }
      function paint() {
        var has = getList().indexOf(F.code) >= 0;
        wl.innerHTML = has
          ? '<button class="btn on watch-btn" id="watchToggle">★ 已加入自选</button>'
          : '<button class="btn watch-btn" id="watchToggle">☆ 加入自选</button>';
        var b = $('watchToggle');
        if (b) b.addEventListener('click', function () {
          var arr = getList();
          var i = arr.indexOf(F.code);
          if (i >= 0) arr.splice(i, 1); else arr.push(F.code);
          try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) {}
          paint();
        });
      }
      paint();
    }

    var tags = $('fTags');
    if (tags) {
      var list = [];
      list.push('<span class="tag">' + grpName(F.grp) + '</span>');
      list.push('<span class="tag">' + F.secName + '</span>');
      if (F.star) list.push('<span class="tag gold">' + '★'.repeat(Math.min(5, F.star)) +
        '☆'.repeat(Math.max(0, 5 - F.star)) + '</span>');
      if (F.rankPct !== null && F.rankPct !== undefined) {
        list.push('<span class="tag ' +
          (F.rankPct >= 75 ? 'ok' : (F.rankPct <= 25 ? 'danger' : '')) +
          '">同类超越 ' + F.rankPct.toFixed(1) + '%</span>');
      }
      if (F.hasDiv) list.push('<span class="tag warn">分过红</span>');
      F.warns.slice(0, 2).forEach(function (w) {
        list.push('<span class="tag risk">' + U.esc(w) + '</span>');
      });
      tags.innerHTML = list.join('');
    }
  })();

  /* =====================================================
     2. KPI 六格
     ===================================================== */
  (function () {
    var host = $('fKpi');
    if (!host) return;
    var items = [
      { v: F.ret250, d: 2, suf: '%', lbl: '近250日收益', sub: '累计净值·含分红再投',
        color: U.sigCol(F.ret250) },
      { v: F.vol, d: 2, suf: '%', lbl: '年化波动率', sub: F.riskTag || '',
        color: '#3d8bfd', sign: false },
      { v: F.mdd250, d: 2, suf: '%', lbl: '近250日最深', sub: '这一年最惨的时候',
        color: '#e8a93c', sign: false },
      { v: F.mddAll, d: 2, suf: '%', lbl: '全历史最深', sub: '1万最坏剩 ' +
        U.comma(U.worstLeft(F.mddAll)) + ' 元', color: '#ff8a5c', sign: false },
      { v: F.sharpe, d: 2, suf: '', lbl: '夏普比率', sub: '每担1份风险换多少超额',
        color: U.sigCol(F.sharpe), sign: false },
      { v: PEER_RANK, d: 0, suf: '/' + PEERS.length, lbl: '板块内排名', sub: F.secName + ' 里第 ' +
        PEER_RANK + ' 名', color: PEER_RANK === 1 ? '#ff4d5e' : '#7b8fb0', sign: false }
    ];
    host.innerHTML = items.map(function (it, i) {
      return '<div class="kpi reveal d' + Math.min(i, 4) + '" style="--kc:' + it.color + '">' +
        '<div class="k-lbl">' + it.lbl + '</div>' +
        '<div class="k-val" style="color:' + it.color + '" data-count="' + it.v +
          '" data-dec="' + it.d + '" data-suffix="' + it.suf + '"' +
          (it.sign === false ? ' data-sign="false"' : '') + '>' +
          U.countText(it.v, it.d, it.suf, it.sign !== false) + '</div>' +
        '<div class="k-sub">' + it.sub + '</div></div>';
    }).join('');
  })();

  /* =====================================================
     3. 走势图（vs 板块平均 vs 全市场平均）
     ===================================================== */
  (function () {
    var host = $('fChart');
    if (!host || !C2 || !F.seq) return;

    var series = [{
      name: F.name, short: '本基金', data: F.seq,
      color: F.ret250 > 0 ? '#ff4d5e' : '#00c58e', width: 2.8
    }];

    /* 板块平均线 */
    if (SECTOR && SECTOR.seq) {
      series.push({
        name: F.secName + ' 板块平均', short: '板块平均', data: SECTOR.seq,
        color: '#f5b942', width: 1.6, dash: true
      });
    }
    /* 全市场平均 */
    var avg = [];
    for (var t = 0; t < N; t++) {
      var sum = 0, cnt = 0;
      D.sectors.forEach(function (s) {
        if (s.seq && s.seq.length > t) { sum += s.seq[t]; cnt++; }
      });
      avg.push(cnt ? sum / cnt : 100);
    }
    series.push({
      name: '九大板块平均', short: '全市场平均', data: avg,
      color: '#7b8fb0', width: 1.3, dash: true
    });

    C2.line(host, {
      axis: axis, series: series, base: 100, height: 340,
      legendEl: $('fChartLegend')
    });
  })();

  /* =====================================================
     4. 五周期收益 + 回撤对比
     ===================================================== */
  (function () {
    var host = $('fPeriod');
    if (!host) return;
    var P = [
      ['近5日', F.ret5], ['近20日', F.ret20], ['近60日', F.ret60],
      ['近120日', F.ret120], ['近250日', F.ret250]
    ];
    host.innerHTML = P.map(function (p) {
      if (p[1] === null || p[1] === undefined) {
        return '<div class="fp-cell"><span>' + p[0] + '</span><b class="mute">—</b></div>';
      }
      return '<div class="fp-cell"><span>' + p[0] + '</span>' +
        '<b class="' + tone(p[1]) + '">' + U.fmt(p[1]) + '</b></div>';
    }).join('');

    /* 回撤对比条 */
    var d = $('fMdd');
    if (d) {
      var maxAbs = Math.max(Math.abs(F.mdd250), Math.abs(F.mddAll)) || 1;
      d.innerHTML =
        '<div class="mdd-row"><span class="mdd-lbl">近250日最深</span>' +
          '<div class="mdd-track"><i style="width:' + (Math.abs(F.mdd250) / maxAbs * 100) +
          '%;background:#e8a93c"></i></div>' +
          '<b class="mdd-val up">' + U.fmt(F.mdd250) + '</b></div>' +
        '<div class="mdd-row"><span class="mdd-lbl">全历史最深</span>' +
          '<div class="mdd-track"><i style="width:' + (Math.abs(F.mddAll) / maxAbs * 100) +
          '%;background:#ff8a5c"></i></div>' +
          '<b class="mdd-val up">' + U.fmt(F.mddAll) + '</b></div>' +
        '<div class="mdd-note">全历史最深是近250日的 <b class="n">' +
          (F.mdd250 ? (Math.abs(F.mddAll) / Math.abs(F.mdd250)).toFixed(1) : '—') +
          '</b> 倍 —— 只看近一年会低估真实痛苦</div>';
    }
  })();

  /* =====================================================
     5. 技术面仪表（RSI / 趋势 / 52周位置）
     ===================================================== */
  (function () {
    var host = $('fTech');
    if (!host) return;

    /* 52 周位置条 */
    var pos = F.pos52 === null || F.pos52 === undefined ? 50 : F.pos52;
    var posColor = pos > 80 ? '#ff4d5e' : (pos < 20 ? '#00c58e' : '#e8a93c');
    var posNote = pos > 80 ? '接近一年最高位' : (pos < 20 ? '接近一年最低位' : '在区间中部');

    /* RSI 仪表 */
    var rsi = F.rsi === null || F.rsi === undefined ? 50 : F.rsi;
    var rsiColor = rsi > 70 ? '#ff4d5e' : (rsi < 30 ? '#00c58e' : '#7b8fb0');
    var rsiNote = rsi > 70 ? '超买（涨太快）' : (rsi < 30 ? '超卖（跌太狠）' : '中性');

    host.innerHTML =
      '<div class="tech-grid">' +
        '<div class="tech-item">' +
          '<div class="tech-lbl">52 周价格位置</div>' +
          '<div class="tech-big" style="color:' + posColor + '">' + pos.toFixed(0) + '%</div>' +
          '<div class="tech-bar"><i style="width:' + pos + '%;background:' + posColor + '"></i></div>' +
          '<div class="tech-note">' + posNote + '　距高点 <b class="down">' +
            U.fmtNum(F.fromHigh, 1) + '%</b></div>' +
        '</div>' +
        '<div class="tech-item">' +
          '<div class="tech-lbl">RSI14（相对强弱）</div>' +
          '<div class="tech-big" style="color:' + rsiColor + '">' + rsi.toFixed(1) + '</div>' +
          '<div class="tech-bar"><i style="width:' + Math.min(100, rsi) +
            '%;background:' + rsiColor + '"></i></div>' +
          '<div class="tech-note">' + rsiNote + '</div>' +
        '</div>' +
        '<div class="tech-item">' +
          '<div class="tech-lbl">趋势 · 均线偏离</div>' +
          '<div class="tech-big ' + tone(F.trend === 'up' ? 1 : (F.trend === 'down' ? -1 : 0)) +
            '" style="font-size:19px">' +
            ({ up: '↑ 上升', down: '↓ 下降', flat: '→ 横盘' }[F.trend] || '—') + '</div>' +
          '<div class="tech-kv"><span>偏离 MA20</span><b class="' +
            tone(F.devMa20) + '">' + U.fmtNum(F.devMa20, 2) + '%</b></div>' +
          '<div class="tech-kv"><span>偏离 MA60</span><b class="' +
            tone(F.devMa60) + '">' + U.fmtNum(F.devMa60, 2) + '%</b></div>' +
          '<div class="tech-note">均线上方=近期强势，下方=近期弱势</div>' +
        '</div>' +
      '</div>';
  })();

  /* =====================================================
     6. 全字段明细表
     ===================================================== */
  (function () {
    var host = $('fDetail');
    if (!host) return;

    function row(label, val, cls, note) {
      return '<div class="fd-row"><span class="fd-lbl">' + label + '</span>' +
        '<b class="fd-val ' + (cls || '') + '">' + val + '</b>' +
        (note ? '<span class="fd-note">' + note + '</span>' : '') + '</div>';
    }
    function g(label, rows) {
      return '<div class="fd-group"><div class="fd-gh">' + label + '</div>' + rows + '</div>';
    }

    var isEtf = (F.rate === null || F.rate === undefined) &&
                (F.minsg === null || F.minsg === undefined);

    var html = '';
    html += g('基本信息',
      row('基金全称', U.esc(F.name)) +
      row('基金代码', F.code) +
      row('基金类型', U.esc(F.ftype || '—')) +
      row('所属板块', F.secName) +
      row('资产大类', grpName(F.grp)) +
      row('基金经理', U.esc(F.manager || '—')) +
      row('东财评级', F.star ? '★'.repeat(F.star) + '☆'.repeat(5 - F.star) : '—', 'gold') +
      row('最新净值日', F.last || '—')
    );

    html += g('收益（累计净值口径）',
      row('近 5 日', U.fmt(F.ret5), tone(F.ret5)) +
      row('近 20 日', U.fmt(F.ret20), tone(F.ret20)) +
      row('近 60 日', U.fmt(F.ret60), tone(F.ret60)) +
      row('近 120 日', U.fmt(F.ret120), tone(F.ret120)) +
      row('近 250 日', U.fmt(F.ret250), tone(F.ret250)) +
      row('近250日·单位净值口径', U.fmt(F.ret250nav), tone(F.ret250nav),
        F.divGap ? '与复权口径差 ' + U.fmtNum(Math.abs(F.divGap), 2) + 'pp' : '')
    );

    html += g('净值',
      row('单位净值', U.fmtNum(F.nav, 4)) +
      row('累计净值', U.fmtNum(F.acnav, 4)) +
      row('分红口径差', F.hasDiv ? U.fmtNum(Math.abs(F.divGap), 2) + ' pp' : '0（未分红）',
        F.divGap && Math.abs(F.divGap) > 2 ? 'warn' : '', F.hasDiv ? '分红导致两口径偏离' : '')
    );

    html += g('风险指标',
      row('年化波动率', U.fmtNum(F.vol, 2) + '%', '', F.riskTag || '') +
      row('近250日最大回撤', U.fmt(F.mdd250), 'up') +
      row('全历史最大回撤', U.fmt(F.mddAll), 'up',
        '1万最坏剩 ' + U.comma(U.worstLeft(F.mddAll)) + ' 元') +
      row('夏普比率', U.fmtNum(F.sharpe, 2), tone(F.sharpe)) +
      row('卡玛比率', U.fmtNum(F.calmar, 2), tone(F.calmar), '收益÷最大回撤，越高越划算')
    );

    html += g('胜率（历史统计）',
      row('持有 20 天胜率', F.hold20 === null ? '—' : U.fmtNum(F.hold20, 1) + '%',
        F.hold20 >= 50 ? 'up' : 'down') +
      row('持有 250 天胜率', F.hold250 === null ? '—' : U.fmtNum(F.hold250, 1) + '%',
        F.hold250 >= 50 ? 'up' : 'down',
        '样本 n=' + (F.n250 || '—')) +
      row('同类排名', F.rankPct === null ? '—' :
        '超越 ' + U.fmtNum(F.rankPct, 1) + '% 的同类',
        F.rankPct >= 75 ? 'up' : (F.rankPct <= 25 ? 'down' : ''))
    );

    html += g('规模与费率',
      row('基金规模', U.fmtNum(F.scale, 2) + ' 亿元') +
      row('管理费率', isEtf ? '场内按佣金' : U.fmtNum(F.rate, 2) + '%', isEtf ? 'blue' : '') +
      row('起购金额', isEtf ? '场内按手' : U.fmtNum(F.minsg, 0) + ' 元', isEtf ? 'blue' : '')
    );

    html += g('机构持有',
      row('最新机构占比', F.inst && F.inst.length
        ? U.fmtNum(F.inst[F.inst.length - 1], 2) + '%' : '—') +
      row('四期变化', F.instDelta === null ? '—' :
        (F.instDelta > 0 ? '+' : '') + U.fmtNum(F.instDelta, 2) + ' pp',
        tone(F.instDelta)) +
      (F.inst && F.inst.length >= 2
        ? row('四期明细', F.inst.map(function (x) { return U.fmtNum(x, 1) + '%'; }).join(' → '))
        : '')
    );

    host.innerHTML = html;
  })();

  /* =====================================================
     7. 机构持有四期图
     ===================================================== */
  (function () {
    var host = $('fInstChart');
    if (!host || !C2 || !F.inst || F.inst.length < 2) {
      var box = $('fInstBox');
      if (box) box.style.display = 'none';
      return;
    }
    var labels = ['第1期', '第2期', '第3期', '第4期'];
    C2.line(host, {
      axis: labels.slice(0, F.inst.length),
      series: [{ name: F.name, short: '机构占比', data: F.inst, color: '#a78bfa', width: 2.4 }],
      height: 260,
      yFmt: function (v) { return v.toFixed(0) + '%'; },
      vFmt: function (v) { return v.toFixed(2) + '%'; }
    });
  })();

  /* =====================================================
     8. 同板块对比表
     ===================================================== */
  (function () {
    var host = $('fPeers');
    if (!host) return;
    var h = '<thead><tr><th class="left">#</th><th class="left">名称</th>' +
      '<th>近250日</th><th>波动</th><th>全历史最深</th><th>夏普</th><th>同类排名</th></tr></thead><tbody>';
    PEERS.forEach(function (f, i) {
      var me = f.code === F.code;
      h += '<tr' + (me ? ' class="me"' : '') + '>' +
        '<td class="left">' + (i + 1) + '</td>' +
        '<td class="left"><a class="peer-link" href="' + f.code + '.html">' +
          U.esc(f.name) + '</a>' + (me ? ' <span class="tag gold">当前</span>' : '') + '</td>' +
        '<td class="' + tone(f.ret250) + '">' + U.fmt(f.ret250) + '</td>' +
        '<td>' + f.vol.toFixed(2) + '%</td>' +
        '<td class="down">' + U.fmt(f.mddAll) + '</td>' +
        '<td class="' + tone(f.sharpe) + '">' + U.fmtNum(f.sharpe, 2) + '</td>' +
        '<td>' + (f.rankPct === null ? '—' : U.fmtNum(f.rankPct, 1) + '%') + '</td>' +
        '</tr>';
    });
    host.innerHTML = h + '</tbody>';
  })();

  /* =====================================================
     9. 买入须知
     ===================================================== */
  (function () {
    var host = $('fBuy');
    if (!host) return;
    var isEtf = (F.rate === null || F.rate === undefined);
    var notes = [];

    notes.push({
      t: '这只基金的历史最坏情况',
      d: '全历史最深 <b class="up">' + U.fmt(F.mddAll) + '</b>，1 万块最坏剩 <b class="up">' +
        U.comma(U.worstLeft(F.mddAll)) + ' 元</b>。这是真实发生过的，不是假设。'
    });

    if (F.vol > 25) {
      notes.push({
        t: '它的波动很大，仓位要小',
        d: '年化波动 <b>' + U.fmtNum(F.vol, 2) + '%</b>，属于「' + (F.riskTag || '高波动') +
          '」。<b style="color:#ff8a5c">建议不超过总仓位的 10%</b>，否则你会在最难受的时候卖在最低点。'
      });
    } else if (F.vol < 3) {
      notes.push({
        t: '它是稳健型，可以多配',
        d: '年化波动只有 <b>' + U.fmtNum(F.vol, 2) + '%</b>，近250日最深仅 <b>' +
          U.fmt(F.mdd250) + '</b>。<b style="color:#4ecfa4">适合作为组合的地基</b>，可以放到 50% 以上。'
      });
    }

    if (F.rankPct !== null && F.rankPct < 25) {
      notes.push({
        t: '同类排名靠后',
        d: '只超越了 <b class="down">' + U.fmtNum(F.rankPct, 1) + '%</b> 的同类基金。' +
          '<b>这不等于它一定会跌</b>，但说明同类里有人做得更好。'
      });
    }

    if (F.hold250 !== null && F.hold250 < 50) {
      notes.push({
        t: '长期持有也不赚钱',
        d: '持有 250 天胜率仅 <b class="down">' + U.fmtNum(F.hold250, 1) + '%</b>（样本 ' +
          (F.n250 || '—') + ' 个）——<b>历史上随便哪天买，拿满一年有一半以上是亏的</b>。' +
          '这类品种只适合做波段，不适合"买了不管"。'
      });
    }

    if (F.hasDiv && F.divGap && Math.abs(F.divGap) > 2) {
      notes.push({
        t: '两个口径差很多，别看错',
        d: '单位净值口径 <b>' + U.fmt(F.ret250nav) + '</b>，复权口径 <b>' + U.fmt(F.ret250) +
          '</b>，差 <b class="n">' + U.fmtNum(Math.abs(F.divGap), 2) + 'pp</b>。' +
          '<b style="color:#f5b942">判断赚没赚要看复权口径。</b>'
      });
    }

    if (F.instDelta !== null && F.instDelta <= -10) {
      notes.push({
        t: '机构在撤',
        d: '机构持有四期从 <b>' + U.fmtNum(F.inst[0], 1) + '%</b> 降到 <b>' +
          U.fmtNum(F.inst[F.inst.length - 1], 1) + '%</b>（' + U.fmtNum(F.instDelta, 1) +
          'pp）。<b>这不代表要跌，但专业资金在减仓，值得警惕。</b>'
      });
    } else if (F.instDelta !== null && F.instDelta >= 10) {
      notes.push({
        t: '机构在加仓',
        d: '机构持有四期从 <b>' + U.fmtNum(F.inst[0], 1) + '%</b> 升到 <b>' +
          U.fmtNum(F.inst[F.inst.length - 1], 1) + '%</b>（+' + U.fmtNum(F.instDelta, 1) +
          'pp）。<b>但注意：占比上升也可能是散户赎回导致的被动上升，无申赎明细无法区分。</b>'
      });
    }

    if (isEtf) {
      notes.push({
        t: '这是场内基金',
        d: '需要在<b>股票账户</b>里像买股票一样买卖（按手，100 份起），' +
          '<b>没有申购费，但有券商佣金</b>。不能在支付宝/天天基金直接买。'
      });
    }

    host.innerHTML = notes.map(function (n) {
      return '<div class="buy-note"><div class="bn-t">' + n.t + '</div>' +
        '<div class="bn-d">' + n.d + '</div></div>';
    }).join('');
  })();

  /* =====================================================
     10. 相关推荐
     ===================================================== */
  (function () {
    var host = $('fRelated');
    if (!host) return;

    /* 同板块里收益最接近的两只 + 相关性最互补的板块 */
    var others = PEERS.filter(function (x) { return x.code !== F.code; });
    var similar = others.slice()
      .sort(function (a, b) {
        return Math.abs(a.ret250 - F.ret250) - Math.abs(b.ret250 - F.ret250);
      }).slice(0, 2);

    var C = D.correlations;
    var relSec = [];
    if (C) {
      var idx = C.secs.indexOf(F.sec);
      if (idx >= 0) {
        var arr = [];
        for (var i = 0; i < C.secs.length; i++) {
          if (i === idx) continue;
          arr.push({ id: C.secs[i], name: C.names[i], v: C.matrix[idx][i] });
        }
        arr.sort(function (a, b) { return a.v - b.v; });
        relSec = arr.slice(0, 2);
      }
    }

    var html = '';
    if (similar.length) {
      html += '<div class="rel-group"><div class="rel-h">🔁 同板块、收益最接近的</div>' +
        '<div class="rel-row">' + similar.map(function (f) {
          return '<a class="rel-card" href="' + f.code + '.html">' +
            '<div class="rel-top"><span class="rel-name">' + U.esc(f.name.slice(0, 16)) + '</span>' +
            '<span class="rel-v ' + tone(f.ret250) + '">' + U.fmt(f.ret250) + '</span></div>' +
            '<div class="rel-meta">' + f.code + ' · 波动 ' + f.vol.toFixed(1) + '%</div>' +
            '<div class="rel-desc">全历史最深 <b>' + U.fmt(f.mddAll) + '</b></div></a>';
        }).join('') + '</div></div>';
    }
    if (relSec.length) {
      html += '<div class="rel-group"><div class="rel-h">🔀 相关性最互补的板块（分散价值高）</div>' +
        '<div class="rel-row">' + relSec.map(function (p) {
          var s = null;
          D.sectors.forEach(function (x) { if (x.sec === p.id) s = x; });
          return '<a class="rel-card" href="../板块/' + p.name + '.html">' +
            '<div class="rel-top"><span class="rel-name">' + p.name + '</span>' +
            '<span class="rel-v ' + (p.v > 0 ? 'up' : 'down') + '">' + p.v.toFixed(2) + '</span></div>' +
            '<div class="rel-meta">相关 ' + p.v.toFixed(2) + ' · 近一年 ' +
            (s ? U.fmt(s.arith) : '—') + '</div>' +
            '<div class="rel-desc">' + (p.v < -0.05 ? '负相关，能压低组合波动'
              : (p.v > 0.4 ? '高度同涨同跌，分散无效' : '基本无关，分散有效')) + '</div></a>';
        }).join('') + '</div></div>';
    }
    host.innerHTML = html;
  })();

  U.boot();
})();
