/* ===========================================================
   板块详情页共享渲染引擎
   用法：页面里先设 window.SECTOR = { id:'gold' }
   依赖：data.js → chart.js → anim.js → sector.js
   =========================================================== */
(function () {
  'use strict';

  var D = window.DATA;
  var U = window.UI;
  var C2 = window.Chart2;
  if (!D || !U) return;

  var CFG = window.SECTOR || {};
  var SEC_ID = CFG.id;

  /* ---------- 取数据 ---------- */
  var S = null;
  for (var i = 0; i < D.sectors.length; i++) {
    if (D.sectors[i].sec === SEC_ID) { S = D.sectors[i]; break; }
  }
  if (!S) {
    console.error('未找到板块:', SEC_ID);
    return;
  }

  var FUNDS = D.funds.filter(function (f) { return f.sec === SEC_ID; })
    .sort(function (a, b) { return b.ret250 - a.ret250; });

  /* 九大板块排名（按收益） */
  var RANKED = D.sectors.slice().sort(function (a, b) { return b.arith - a.arith; });
  var RANK = RANKED.indexOf(S) + 1;
  var ALL_AVG = D.sectors.reduce(function (a, b) { return a + b.arith; }, 0) / D.sectors.length;

  /* 每只基金在"全 40 只"里的收益排名 */
  var ALL40 = D.funds.slice().sort(function (a, b) { return b.ret250 - a.ret250; });
  function globalRank(code) {
    for (var k = 0; k < ALL40.length; k++) if (ALL40[k].code === code) return k + 1;
    return null;
  }

  var SEC_COLOR = {
    gold: '#f5b942', silver: '#c0c8d4', oil: '#ff4d5e', metal: '#a78bfa',
    overseas: '#6aacff', hk: '#ff8a5c', ashare: '#22d3ee', sector: '#a78bfa', bond: '#3d8bfd'
  };
  var MAIN = SEC_COLOR[SEC_ID] || '#3d8bfd';

  function tone(v) { return v > 0 ? 'up' : (v < 0 ? 'down' : 'mute'); }

  /* =====================================================
     1. 顶部 Hero 数字
     ===================================================== */
  (function () {
    var el = document.getElementById('sHeroVal');
    if (el) el.textContent = U.fmt(S.arith);
    var nm = document.getElementById('sHeroNote');
    if (nm) {
      nm.innerHTML = S.n + ' 只基金 · 九大板块里排第 <b class="n">' + RANK + '</b> 名 · ' +
        '全市场平均 <b class="n">' + U.fmt(ALL_AVG) + '</b>';
    }
  })();

  /* =====================================================
     2. KPI 六格
     ===================================================== */
  (function () {
    var host = document.getElementById('sKpi');
    if (!host) return;

    var best = FUNDS[0];
    var worst = FUNDS[FUNDS.length - 1];
    var items = [
      { v: S.arith, d: 2, suf: '%', lbl: '板块平均收益', note: '等权买入持有',
        color: U.sigCol(S.arith) },
      { v: S.vol, d: 2, suf: '%', lbl: '平均波动率', note: '越大越颠',
        color: '#3d8bfd', sign: false },
      { v: S.spread, d: 2, suf: '', lbl: '内部极差', note: '越大越不能看平均',
        color: S.spread < 2 ? '#00c58e' : (S.spread < 10 ? '#e8a93c' : '#ff8a5c'), sign: false },
      { v: S.mddCombo, d: 2, suf: '%', lbl: '买齐一篮子的回撤', note: '分散后的结果',
        color: '#00c58e', sign: false },
      { v: S.mddWorst, d: 2, suf: '%', lbl: '板块内最惨个基', note: '真买一只能有多惨',
        color: '#ff8a5c', sign: false },
      { v: RANK, d: 0, suf: '/9', lbl: '收益排名', note: RANK <= 3 ? '前列' : (RANK >= 7 ? '靠后' : '中游'),
        color: RANK <= 3 ? '#ff4d5e' : (RANK >= 7 ? '#00c58e' : '#e8a93c'), sign: false }
    ];

    host.innerHTML = items.map(function (it, i) {
      var txt = U.countText(it.v, it.d, it.suf, it.sign !== false);
      return '<div class="kpi reveal d' + Math.min(i, 4) + '" style="--kc:' + it.color + '">' +
        '<div class="k-lbl">' + it.lbl + '</div>' +
        '<div class="k-val" style="color:' + it.color + '" data-count="' + it.v +
          '" data-dec="' + it.d + '" data-suffix="' + it.suf + '"' +
          (it.sign === false ? ' data-sign="false"' : '') + '>' + txt + '</div>' +
        '<div class="k-sub">' + it.note + '</div></div>';
    }).join('');
  })();

  /* =====================================================
     3. 走势：本板块 vs 九大板块平均
     ===================================================== */
  (function () {
    var host = document.getElementById('sChart');
    if (!host || !C2) return;

    /* 九大板块平均线（等权） */
    var axis = D.axis;
    var avgLine = [];
    for (var t = 0; t < axis.length; t++) {
      var sum = 0, cnt = 0;
      D.sectors.forEach(function (s2) {
        if (s2.seq && s2.seq.length > t) { sum += s2.seq[t]; cnt++; }
      });
      avgLine.push(cnt ? sum / cnt : 100);
    }

    C2.line(host, {
      axis: axis, height: 340, base: 100,
      series: [
        { name: S.name + '（本板块）', short: S.name, data: S.seq, color: MAIN, width: 2.8 },
        { name: '九大板块平均', short: '全市场平均', data: avgLine, color: '#7b8fb0',
          width: 1.6, dash: true, area: false }
      ],
      legendEl: document.getElementById('sChartLegend')
    });
  })();

  /* =====================================================
     4. 板块内散点
     ===================================================== */
  (function () {
    var host = document.getElementById('sScatter');
    if (!host || !C2) return;

    var pts = FUNDS.map(function (f) {
      return {
        x: f.vol, y: f.ret250, color: MAIN,
        r: Math.max(5, Math.min(10, f.vol / 5)),
        label: f.name,
        sub: f.code + ' · ' + f.ftype,
        extra: '全历史最深 ' + U.fmt(f.mddAll, 1) + '｜夏普 ' + (f.sharpe === null ? '—' : f.sharpe.toFixed(2))
      };
    });

    C2.scatter(host, {
      points: pts, height: 420,
      xLabel: '年化波动率 →（越往右越颠簸）',
      yLabel: '近一年收益率 →（越往上越赚）'
    });
  })();

  /* =====================================================
     5. 内部分化：能不能看"平均"
     ===================================================== */
  (function () {
    var host = document.getElementById('sSpread');
    if (!host) return;

    var trust = S.spread < 2 ? { t: '可信', c: '#00c58e', d: '板块内几只基金表现几乎一样' }
      : (S.spread < 10 ? { t: '一般', c: '#e8a93c', d: '板块内有一定差异，平均数参考着看' }
        : { t: '不可信', c: '#ff8a5c', d: '板块内差异极大，平均数会骗你' });

    var worstFund = FUNDS[FUNDS.length - 1];
    var bestFund = FUNDS[0];

    host.innerHTML =
      '<div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:16px">' +
        '<span class="tag" style="background:' + trust.c + '22;color:' + trust.c +
          ';border-color:' + trust.c + '55;font-size:13px;padding:4px 12px">' + trust.t + '</span>' +
        '<span style="font-size:13px;color:#96a8c2">' + trust.d + '</span>' +
      '</div>' +
      /* 条形：最好 vs 最差，视觉化极差 */
      '<div style="margin-bottom:10px">' +
        '<div style="display:flex;justify-content:space-between;font-size:12px;color:#7b8fb0;margin-bottom:6px">' +
          '<span>内部最差 <b class="' + tone(worstFund.ret250) + '">' + U.fmt(worstFund.ret250) + '</b>' +
            ' <span style="color:#657a99">' + U.esc(worstFund.name.slice(0, 14)) + '</span></span>' +
          '<span><span style="color:#657a99">' + U.esc(bestFund.name.slice(0, 14)) + '</span>' +
            ' <b class="' + tone(bestFund.ret250) + '">' + U.fmt(bestFund.ret250) + '</b> 内部最好</span>' +
        '</div>' +
        '<div style="height:12px;border-radius:6px;overflow:hidden;background:#121c2f;position:relative">' +
          '<div style="position:absolute;left:0;top:0;bottom:0;width:100%;' +
            'background:linear-gradient(90deg,rgba(0,197,142,.55),rgba(245,185,66,.4),rgba(255,77,94,.55))"></div>' +
        '</div>' +
        '<div style="text-align:center;font-size:12.5px;color:#96a8c2;margin-top:9px">' +
          '内部极差 <b class="n hl" style="font-size:15px">' + S.spread.toFixed(2) + '</b> 个百分点' +
        '</div>' +
      '</div>' +
      /* 结论句 */
      '<div class="note ' + (S.spread < 2 ? 'good' : (S.spread < 10 ? 'warn' : 'danger')) +
        '" style="margin-bottom:0">' +
        (S.spread < 2
          ? '<b>这个板块的"平均"可以直接信。</b>你随便挑一只，体验都跟平均值差不多。'
          : '<b>别用"平均"代表自己。</b>板块里最好和最差差 <b class="n">' + S.spread.toFixed(1) +
            '</b> 个百分点，你买到哪一只，结果完全不同。') +
      '</div>';
  })();

  /* =====================================================
     6. 逐只详情卡
     ===================================================== */
  (function () {
    var host = document.getElementById('sFunds');
    if (!host) return;

    if (!FUNDS.length) { host.innerHTML = '<div class="note">该板块暂无基金数据。</div>'; return; }

    host.innerHTML = FUNDS.map(function (f, i) {
      var gr = globalRank(f.code);
      var medal = ['🥇', '🥈', '🥉'][i] || '';
      /* 迷你走势 */
      var mini = '';
      if (f.seq && f.seq.length) {
        var lo = Math.min.apply(null, f.seq), hi = Math.max.apply(null, f.seq);
        var rng = (hi - lo) || 1;
        var W = 240, H = 46, n = f.seq.length;
        var d = f.seq.map(function (v, k) {
          return (k ? 'L' : 'M') + (W * k / (n - 1)).toFixed(1) + ' ' +
            (H - (v - lo) / rng * (H - 6) - 3).toFixed(1);
        }).join(' ');
        mini = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:46px;margin-top:10px">' +
          '<path d="' + d + '" fill="none" stroke="' + (f.ret250 > 0 ? '#ff4d5e' : '#00c58e') +
          '" stroke-width="1.8" stroke-linejoin="round"/></svg>';
      }

      var instNow = f.inst ? f.inst[f.inst.length - 1] : null;
      var instTxt = instNow === null ? '—' : instNow.toFixed(1) + '%';
      var instDelta = f.instDelta;
      var instTone = instDelta === null ? 'mute' : (instDelta > 0 ? 'up' : 'down');

      /* ---------- 补齐此前未展示的真实字段 ---------- */
      /* 多周期收益 */
      var PERIODS = [
        ['近5日', f.ret5], ['近20日', f.ret20], ['近60日', f.ret60],
        ['近120日', f.ret120], ['近250日', f.ret250]
      ];
      var periodHtml = PERIODS.map(function (p2) {
        if (p2[1] === null || p2[1] === undefined) return '';
        var c = p2[1] > 0 ? 'up' : (p2[1] < 0 ? 'down' : 'mute');
        return '<div class="per-cell"><span>' + p2[0] + '</span>' +
          '<b class="' + c + '">' + U.fmt(p2[1]) + '</b></div>';
      }).join('');

      /* 评级星级 */
      var stars = '';
      if (f.star) {
        stars = '<span class="star-badge" title="东财评级">' +
          '★'.repeat(Math.min(5, f.star)) + '☆'.repeat(Math.max(0, 5 - f.star)) +
          '</span>';
      }

      /* 同类排名 —— 字段 rateInSimilarPersent 是「超越同类的百分比」，越大越好。
         （用 40 只样本验证：与收益相关系数 +0.51。
          例：原油 95.7 = 超越 95.7% 的同类；半导体 1.8 = 只超越 1.8%。
          原代码写成"前 X%"且颜色判断反向，是误读，已修正。）*/
      var rankTxt = '—';
      if (f.rankPct !== null && f.rankPct !== undefined) {
        var v = f.rankPct;
        var good = v >= 75, bad = v <= 25;     /* 越高越好 */
        rankTxt = '<b class="' + (good ? 'up' : (bad ? 'down' : 'mute')) + '">' +
          '超越 ' + v.toFixed(1) + '%</b>';
      }

      /* RSI 与趋势 */
      var rsiTxt = '—';
      if (f.rsi !== null && f.rsi !== undefined) {
        var rsiC = f.rsi > 70 ? 'up' : (f.rsi < 30 ? 'down' : 'mute');
        var rsiNote = f.rsi > 70 ? '超买' : (f.rsi < 30 ? '超卖' : '中性');
        rsiTxt = '<b class="' + rsiC + '">' + f.rsi.toFixed(1) + '</b>' +
          '<span class="rsi-note">' + rsiNote + '</span>';
      }
      var trendMap = { up: ['↑ 上升', 'up'], down: ['↓ 下降', 'down'], flat: ['→ 横盘', 'mute'] };
      var trendInfo = trendMap[f.trend] || ['—', 'mute'];

      /* 距高点 / 偏离均线 */
      var fromHighTxt = (f.fromHigh !== null && f.fromHigh !== undefined)
        ? '<b class="down">' + U.fmt(f.fromHigh, 1) + '</b>' : '—';
      var devMa20Txt = (f.devMa20 !== null && f.devMa20 !== undefined)
        ? '<b class="' + (f.devMa20 > 0 ? 'up' : 'down') + '">' +
          U.fmt(f.devMa20, 2) + '</b>' : '—';
      var devMa60Txt = (f.devMa60 !== null && f.devMa60 !== undefined)
        ? '<b class="' + (f.devMa60 > 0 ? 'up' : 'down') + '">' +
          U.fmt(f.devMa60, 2) + '</b>' : '—';

      /* 持有20天 vs 250天胜率 */
      var hold20Txt = (f.hold20 !== null && f.hold20 !== undefined)
        ? U.fmtNum(f.hold20, 1) + '%' : '—';
      var hold250Txt = (f.hold250 !== null && f.hold250 !== undefined)
        ? U.fmtNum(f.hold250, 1) + '%' : '—';

      /* 卡玛比率 */
      var calmarTxt = (f.calmar !== null && f.calmar !== undefined)
        ? '<b class="' + (f.calmar > 0 ? 'up' : 'down') + '">' +
          U.fmtNum(f.calmar, 2) + '</b>' : '—';

      /* 净值数据 */
      var navTxt = (f.nav !== null && f.nav !== undefined) ? U.fmtNum(f.nav, 4) : '—';
      var acnavTxt = (f.acnav !== null && f.acnav !== undefined) ? U.fmtNum(f.acnav, 4) : '—';

      return '<div class="bond-card reveal d' + Math.min(i, 4) + '">' +
        '<div class="bc-head">' +
          '<div class="bc-rank">' + (medal || '·') + '<span>NO.' + (i + 1) + '</span></div>' +
          '<div class="bc-title"><h4><a class="fund-link" href="../基金详情/' + f.code + '.html" ' +
            'title="看完整档案">' + U.esc(f.name) + '</a></h4>' +
            '<div class="bc-meta">' + f.code + ' · ' + U.esc(f.ftype || '') + '</div></div>' +
          '<div class="bc-ret ' + tone(f.ret250) + '">' + U.fmt(f.ret250) + '<small>近一年</small></div>' +
        '</div>' +

        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">' +
          (gr && gr <= 10 ? '<span class="tag ok">全 40 只里第 ' + gr + ' 名</span>' : '') +
          '<span class="tag">波动 ' + f.vol.toFixed(2) + '%</span>' +
          '<span class="tag">全历史 ' + U.fmt(f.mddAll, 1) + '</span>' +
          '<span class="tag">夏普 ' + (f.sharpe === null ? '—' : f.sharpe.toFixed(2)) + '</span>' +
        '</div>' +

        '<div class="bc-stats">' +
          '<div class="bc-stat"><div class="bs-label">波动率 <b>' + f.vol.toFixed(2) + '%</b></div>' +
            '<div class="bs-bar"><i style="width:' + Math.min(100, f.vol / 8 * 100) +
            '%;background:linear-gradient(90deg,#3d8bfd,#22d3ee)"></i></div></div>' +
          '<div class="bc-stat"><div class="bs-label">全历史最深 <b class="down">' + U.fmt(f.mddAll) + '</b></div>' +
            '<div class="bs-bar"><i style="width:' + Math.min(100, Math.abs(f.mddAll) / 10 * 100) +
            '%;background:linear-gradient(90deg,#e8a93c,#ff8a5c)"></i></div></div>' +
          '<div class="bc-stat"><div class="bs-label">机构持有 <b>' + instTxt + '</b>' +
            (instDelta !== null ? ' <span class="' + instTone + '" style="font-size:11px">(' +
              (instDelta > 0 ? '+' : '') + instDelta.toFixed(1) + 'pp)</span>' : '') + '</div>' +
            '<div class="bs-bar"><i style="width:' + Math.min(100, instNow || 0) +
            '%;background:linear-gradient(90deg,#a78bfa,#3d8bfd)"></i></div></div>' +
        '</div>' +

        mini +

        /* ---------- 五周期收益 ---------- */
        '<div class="per-strip">' + periodHtml + '</div>' +

        /* ---------- 详细信息网格（此前未展示的真实字段）---------- */
        '<div class="fx-grid">' +
          '<div class="fx-item"><span>基金经理</span><b>' +
            U.esc(f.manager || '—') + '</b></div>' +
          '<div class="fx-item"><span>评级</span><b>' + (stars || '—') + '</b></div>' +
          '<div class="fx-item"><span>同类排名</span><b>' + rankTxt + '</b></div>' +
          '<div class="fx-item"><span>RSI</span><b>' + rsiTxt + '</b></div>' +
          '<div class="fx-item"><span>趋势</span><b class="' + trendInfo[1] + '">' +
            trendInfo[0] + '</b></div>' +
          '<div class="fx-item"><span>距 52 周高点</span><b>' + fromHighTxt + '</b></div>' +
          '<div class="fx-item"><span>偏离 MA20</span><b>' + devMa20Txt + '</b></div>' +
          '<div class="fx-item"><span>偏离 MA60</span><b>' + devMa60Txt + '</b></div>' +
          '<div class="fx-item"><span>持有20天胜率</span><b class="n">' + hold20Txt + '</b></div>' +
          '<div class="fx-item"><span>持有250天胜率</span><b class="n">' + hold250Txt + '</b></div>' +
          '<div class="fx-item"><span>卡玛比率</span><b>' + calmarTxt + '</b></div>' +
          '<div class="fx-item"><span>单位净值 / 累计</span><b class="n">' +
            navTxt + ' / ' + acnavTxt + '</b></div>' +
        '</div>' +

        /* ---------- 数据截止与费用 ----------
           注意：518880 / 159934 是场内 ETF，没有"申购费/起购金额"的概念，
           字段为 null。直接拼 '%' 会显示成 "—%"（实测发现的 bug），要分别处理。 */
        '<div class="fx-foot">' +
          '<span>净值截至 <b class="n">' + (f.last || '—') + '</b></span>' +
          '<span>起购 ' + (f.minsg === null || f.minsg === undefined
            ? '<b class="fx-etf">场内按手</b>'
            : '<b class="n">' + U.fmtNum(f.minsg, 0) + '</b> 元') + '</span>' +
          '<span>费率 ' + (f.rate === null || f.rate === undefined
            ? '<b class="fx-etf">场内佣金</b>'
            : '<b class="n">' + U.fmtNum(f.rate, 2) + '%</b>') + '</span>' +
          (f.hasDiv ? '<span class="fx-div">分过红 ' + U.fmtNum(f.divGap, 2) + 'pp</span>' : '') +
        '</div>' +

        (f.warns && f.warns.length
          ? '<div class="bc-tags" style="margin-top:10px">' + f.warns.map(function (w) {
              return '<span class="tag risk">' + U.esc(w) + '</span>';
            }).join('') + '</div>'
          : '') +

        '<div class="bc-note">' + U.esc(f.verdict) + '</div>' +
      '</div>';
    }).join('');
  })();

  /* =====================================================
     7. 资金动向：机构持有四期
     ===================================================== */
  (function () {
    var host = document.getElementById('sInstChart');
    if (!host || !C2) return;

    var rows = FUNDS.filter(function (f) { return f.inst && f.inst.length >= 2; });
    if (!rows.length) {
      var box = document.getElementById('sInstBox');
      if (box) box.innerHTML = '<div class="note">该板块暂无机构持有数据。</div>';
      return;
    }

    var PAL = ['#f5b942', '#3d8bfd', '#00c58e', '#ff4d5e', '#a78bfa', '#22d3ee', '#ff8a5c'];
    var series = rows.map(function (f, i) {
      return {
        name: f.code + ' ' + f.name.slice(0, 10),
        short: f.code,
        data: f.inst,
        color: PAL[i % PAL.length]
      };
    });

    /* 取第一只的日期轴 */
    var axis = [];
    for (var k = 0; k < rows[0].inst.length; k++) axis.push('第' + (k + 1) + '期');

    C2.line(host, {
      axis: axis, series: series, height: 300,
      yFmt: function (v) { return v.toFixed(0) + '%'; },
      vFmt: function (v) { return v.toFixed(2) + '%'; },
      legendEl: document.getElementById('sInstLegend')
    });
  })();

  /* =====================================================
     8. 导航高亮 + 启动
     ===================================================== */

  /* =====================================================
     9. 情景模拟：投 1 万块会怎样
     ===================================================== */
  (function () {
    var host = document.getElementById('sSimulate');
    if (!host) return;

    var CAP = 10000;
    var worstFund = FUNDS[FUNDS.length - 1];
    var bestFund = FUNDS[0];

    var rows = [
      { lbl: '按板块平均赚（近一年）', v: S.arith, color: U.sigCol(S.arith),
        desc: S.n + ' 只各买同样多的钱' },
      { lbl: '买到最好的那一只', v: bestFund.ret250, color: U.sigCol(bestFund.ret250),
        desc: bestFund.name.slice(0, 16) },
      { lbl: '买到最差的那一只', v: worstFund.ret250, color: U.sigCol(worstFund.ret250),
        desc: worstFund.name.slice(0, 16) },
      { lbl: '遇到板块级最深回撤', v: S.mddCombo, color: '#e8a93c',
        desc: '买齐一篮子后最惨的时候' },
      { lbl: '买到最惨那一只（近一年最深）', v: S.mddWorst, color: '#ff8a5c',
        desc: '真金白银只买一只，这一年最惨时' },
      { lbl: '最惨那只的全历史最深', v: worstFund.mddAll, color: '#ff4d5e',
        desc: '它这辈子跌得最狠的一次（真正的底线）' }
    ];

    host.innerHTML = rows.map(function (r, i) {
      var end = CAP * (1 + r.v / 100);
      var diff = end - CAP;
      return '<div class="sim-row reveal d' + Math.min(i, 4) + '">' +
        '<div class="sim-left">' +
          '<div class="sim-lbl">' + r.lbl + '</div>' +
          '<div class="sim-desc">' + U.esc(r.desc) + '</div>' +
        '</div>' +
        '<div class="sim-mid">' +
          '<div class="sim-bar"><i style="width:' + Math.min(100, Math.abs(diff) / CAP * 100) +
            '%;background:' + r.color + '"></i></div>' +
        '</div>' +
        '<div class="sim-right">' +
          '<div class="sim-end" style="color:' + r.color + '">' + U.comma(end) + ' 元</div>' +
          '<div class="sim-diff" style="color:' + r.color + '">' +
            (diff >= 0 ? '+' : '') + U.comma(diff) + ' 元</div>' +
        '</div>' +
      '</div>';
    }).join('');
  })();

  /* =====================================================
     10. 九大板块横向排名（标出当前板块）
     ===================================================== */
  (function () {
    var host = document.getElementById('sRankChart');
    if (!host) return;

    var items = RANKED.map(function (x) {
      var isMe = x.sec === SEC_ID;
      var v = x.arith;
      return {
        label: (isMe ? '▶ ' : '　') + x.name,
        value: Math.abs(v),
        color: isMe ? MAIN : (v >= 0 ? 'rgba(255,77,94,.42)' : 'rgba(0,197,142,.42)'),
        text: (v > 0 ? '+' : '') + v.toFixed(2) + '%' + (isMe ? '  ← 当前' : '')
      };
    });

    if (C2 && C2.bar) {
      C2.bar(host, { labelW: 150, rowH: 40, items: items });
    }
  })();

  /* =====================================================
     11. 上一板块 / 下一板块 导航
     ===================================================== */
  (function () {
    var host = document.getElementById('sPrevNext');
    if (!host) return;

    /* 固定顺序（按资产大类排，符合直觉） */
    var ORDER = [
      { fn: '债券', name: '债券' },
      { fn: '黄金', name: '黄金' },
      { fn: '白银', name: '白银' },
      { fn: '原油', name: '原油' },
      { fn: '有色', name: '有色' },
      { fn: '海外美股', name: '海外美股' },
      { fn: 'A股宽基', name: 'A股宽基' },
      { fn: '中国香港', name: '中国香港' },
      { fn: '行业主题', name: '行业主题' }
    ];

    var idx = -1;
    for (var k = 0; k < ORDER.length; k++) if (ORDER[k].fn === CFG.fn) { idx = k; break; }
    if (idx < 0) return;

    var prev = ORDER[(idx - 1 + ORDER.length) % ORDER.length];
    var next = ORDER[(idx + 1) % ORDER.length];

    host.innerHTML =
      '<a class="pn-link prev" href="' + prev.fn + '.html">' +
        '<span class="pn-dir">← 上一个板块</span>' +
        '<span class="pn-name">' + prev.name + '</span>' +
      '</a>' +
      '<a class="pn-link next" href="' + next.fn + '.html">' +
        '<span class="pn-dir">下一个板块 →</span>' +
        '<span class="pn-name">' + next.name + '</span>' +
      '</a>';
  })();

  U.boot();
})();
