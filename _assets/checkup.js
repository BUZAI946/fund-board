/* ===========================================================
   持仓体检报告
   读 localStorage 持仓 → 生成一页纸报告（可打印/导出 PDF）
   =========================================================== */
(function () {
  'use strict';
  var D = window.DATA, U = window.UI;
  if (!D || !U) return;

  var toolbar = document.getElementById('ckToolbar');
  var report = document.getElementById('ckReport');
  if (!toolbar || !report) return;

  var HKEY = 'fundboard_holdings';
  var F = D.funds || [];
  var SECNAMES = {};
  (D.sectors || []).forEach(function (s) { SECNAMES[s.sec] = s.name; });
  SECNAMES['cash'] = '货币';

  function getF(code) {
    for (var i = 0; i < F.length; i++) if (F[i].code === code) return F[i];
    return null;
  }
  function loadH() {
    try {
      var a = JSON.parse(localStorage.getItem(HKEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }

  /* ---------------- 计算 ---------------- */
  function calc() {
    var list = loadH();
    var rows = [], total = 0, totalCost = 0;

    list.forEach(function (h) {
      var f = getF(h.code);
      if (!f) return;
      var val;
      if (h.mode === 'shares') {
        val = h.shares * (f.nav || 1);
      } else {
        var axis = D.axis || [];
        var iBuy = 0, bd = Infinity;
        var tg = +String(h.date || '').replace(/-/g, '');
        for (var i = 0; i < axis.length; i++) {
          var d = Math.abs(+axis[i].replace(/-/g, '') - tg);
          if (d < bd) { bd = d; iBuy = i; }
        }
        val = h.cost * (f.seq[f.seq.length - 1] / f.seq[iBuy]);
      }
      rows.push({ f: f, cost: h.cost, value: val, pnl: val - h.cost,
                  ret: h.cost ? (val / h.cost - 1) * 100 : 0, h: h });
      total += val;
      totalCost += h.cost;
    });

    /* 板块分布 */
    var bySec = {}, byGrp = {};
    rows.forEach(function (r) {
      bySec[r.f.sec] = (bySec[r.f.sec] || 0) + r.value;
      byGrp[r.f.grp] = (byGrp[r.f.grp] || 0) + r.value;
    });

    /* 加权回撤 */
    var wMdd = 0, wVol2 = 0, worst = null;
    rows.forEach(function (r) {
      var w = total ? r.value / total : 0;
      if (r.f.mddAll) wMdd += w * Math.abs(r.f.mddAll);
      if (r.f.vol) wVol2 += Math.pow(w * r.f.vol, 2);
      if (r.f.mddAll && (!worst || r.f.mddAll < worst.f.mddAll)) worst = r;
    });

    return {
      rows: rows, total: total, totalCost: totalCost,
      pnl: total - totalCost,
      ret: totalCost ? (total / totalCost - 1) * 100 : 0,
      bySec: bySec, byGrp: byGrp,
      wMdd: wMdd, wVol: Math.sqrt(wVol2), worst: worst
    };
  }

  /* ---------------- 生成问题清单 ---------------- */
  function issues(r) {
    var out = [];
    if (!r.rows.length) return out;

    var secN = Object.keys(r.bySec).length;
    var grpN = Object.keys(r.byGrp).length;
    var maxSec = '', maxPct = 0;
    Object.keys(r.bySec).forEach(function (k) {
      var p = r.bySec[k] / r.total * 100;
      if (p > maxPct) { maxPct = p; maxSec = k; }
    });

    /* 集中度 */
    if (secN === 1) {
      out.push({
        lvl: 'bad',
        t: '只持有一个板块',
        d: '你的钱全在「' + (SECNAMES[maxSec] || maxSec) + '」。'
      });
    } else if (maxPct >= 70) {
      out.push({
        lvl: 'warn',
        t: '单一板块占比过高',
        d: '「' + (SECNAMES[maxSec] || maxSec) + '」占 ' + maxPct.toFixed(0) + '%，' +
           '它的涨跌基本决定你的全部收益。'
      });
    } else if (secN >= 5) {
      out.push({
        lvl: 'good', t: '板块分散，' + secN + ' 个板块',
        d: '最大单一板块占 ' + maxPct.toFixed(0) + '%，结构合理。'
      });
    }

    /* 权益占比 */
    var eq = (r.byGrp['stock'] || 0) / r.total * 100;
    var bd = (r.byGrp['fund'] || 0) / r.total * 100;
    if (eq >= 80) {
      out.push({ lvl: 'warn', t: '权益仓位 ' + eq.toFixed(0) + '%，偏激进',
                 d: '假设跌 30%，你会亏 ' + U.comma(r.total * 0.3 * eq / 100) + ' 元左右。' });
    } else if (bd >= 80) {
      out.push({ lvl: 'warn', t: '债券仓位 ' + bd.toFixed(0) + '%，偏保守',
                 d: '抗跌但收益有限。如果这笔钱 3 年不用，可以适当加权益。' });
    }

    /* 风险集中 */
    if (r.worst && r.worst.f.mddAll) {
      var wr = Math.abs(r.worst.f.mddAll);
      if (wr >= 60) {
        out.push({
          lvl: 'warn',
          t: '持有一只历史最深跌 ' + wr.toFixed(0) + '% 的基金',
          d: U.esc(r.worst.f.name.slice(0, 16)) + '，那笔 ' +
             U.comma(r.worst.value) + ' 元最坏会变成 ' +
             U.comma(r.worst.value * (1 - wr / 100)) + ' 元。'
        });
      }
    }

    /* 盈亏 */
    if (r.pnl < 0 && r.ret < -10) {
      out.push({ lvl: 'warn', t: '当前浮亏 ' + U.fmt(r.ret),
                 d: '账面亏 ' + U.comma(Math.abs(r.pnl)) + ' 元。' +
                    '先确认是"整体市场下跌"还是"你买错了"，两者的处理完全不同。' });
    }

    /* 记录太少 */
    if (r.rows.length === 1) {
      out.push({ lvl: 'warn', t: '只有 1 笔持仓',
                 d: '单只基金不叫组合。要判断分散效果，至少要有 3 笔。' });
    }

    /* 与"再平衡"对齐：有没有设目标配置、偏离多少 */
    try {
      var tg = JSON.parse(localStorage.getItem('fundboard_target') || '[]');
      if (Array.isArray(tg) && tg.length) {
        var tm = {};
        tg.forEach(function (x) { tm[x.sec] = (tm[x.sec] || 0) + x.w; });
        var tsum = Object.keys(tm).reduce(function (a, k) { return a + tm[k]; }, 0) || 1;
        /* 遍历「目标 ∪ 实际」的并集 —— 和再平衡页口径一致。
           只遍历目标会漏掉"实际有但目标里没有"的板块（比如多配了黄金）。 */
        var keyset = {};
        Object.keys(tm).forEach(function (k) { keyset[k] = true; });
        Object.keys(r.bySec).forEach(function (k) { keyset[k] = true; });
        var bad = [];
        Object.keys(keyset).forEach(function (k) {
          var want = (tm[k] || 0) / tsum * 100;
          var have = (r.bySec[k] || 0) / r.total * 100;
          if (Math.abs(have - want) >= 5) {
            bad.push({ name: SECNAMES[k] || k, d: have - want });
          }
        });
        if (bad.length) {
          out.push({
            lvl: 'warn',
            t: '有 ' + bad.length + ' 个板块偏离目标超过 5 个百分点',
            d: bad.slice(0, 3).map(function (x) {
              return x.name + '（' + (x.d > 0 ? '+' : '') + x.d.toFixed(1) + 'pp）';
            }).join('、') +
              '。结构本身没毛病，但和你设定的目标不一致——去「再平衡提醒」看具体加减多少。'
          });
        }
      } else {
        out.push({
          lvl: 'good',
          t: '还没设目标配置',
          d: '建议去「再平衡提醒」设一个。没有目标就没法判断"现在的仓位算不算偏"，' +
             '只能看结构性问题。'
        });
      }
    } catch (e) {}

    return out;
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    var r = calc();

    /* 工具栏 */
    toolbar.innerHTML =
      '<div class="ck-tool">' +
        '<div class="ckt-l">' +
          '<b>持仓体检报告</b>' +
          '<span class="ckt-sub">基于你录入的 ' + r.rows.length + ' 笔持仓生成</span>' +
        '</div>' +
        '<div class="ckt-r">' +
          '<a class="btn" href="持仓跟踪.html">编辑持仓</a>' +
          '<button class="btn on" id="ckPrint">打印 / 存成 PDF</button>' +
        '</div>' +
      '</div>' +
      (!r.rows.length
        ? '<div class="note warn" style="margin:16px 0 0">' +
          '<b>还没有持仓数据。</b>先去 <a href="持仓跟踪.html">我的持仓</a> 录入，' +
          '这一页才有内容。下面的报告用的是示例数据。' +
          '</div>'
        : '');

    var pb = document.getElementById('ckPrint');
    if (pb) pb.addEventListener('click', function () { window.print(); });

    if (!r.rows.length) {
      report.innerHTML = '<div class="sim-empty" style="padding:60px 20px;text-align:center">' +
        '<div style="font-size:44px;color:#3d4f6b;margin-bottom:14px">📋</div>' +
        '<div style="font-size:15px;font-weight:700;color:#e8eef8;margin-bottom:10px">' +
        '还没有持仓数据</div>' +
        '<div style="font-size:13px;color:#7b8fb0;line-height:1.9">' +
        '先去「我的持仓」录入你实际买了什么，回来这里就能生成报告。<br>' +
        '<b style="color:#e8eef8">记录只存在你自己电脑的浏览器里。</b></div></div>';
      return;
    }

    var iss = issues(r);
    var dateStr = new Date().toLocaleString('zh-CN');
    var navDate = '';
    (function () {
      var cnt = {}, bd = '', bn = 0;
      F.forEach(function (f) {
        if (!f.last) return;
        cnt[f.last] = (cnt[f.last] || 0) + 1;
        if (cnt[f.last] > bn) { bn = cnt[f.last]; bd = f.last; }
      });
      navDate = bd;
    })();

    var h = '<div class="ck-paper">';

    /* 报告头 */
    h += '<div class="ckp-head">' +
      '<div class="ckp-title">持仓体检报告</div>' +
      '<div class="ckp-meta">净值日 ' + (navDate || '—') + ' · 生成于 ' + dateStr + '</div>' +
      '</div>';

    /* 核心数字 */
    h += '<div class="ckp-hero">' +
      '<div class="ckp-h-item"><span>总投入</span><b class="n">' +
        U.comma(r.totalCost) + '</b><small>元</small></div>' +
      '<div class="ckp-h-item ckp-h-main"><span>现在市值</span><b class="n">' +
        U.comma(r.total) + '</b><small>元</small>' +
        '<div class="ckp-pnl ' + (r.pnl >= 0 ? 'up' : 'down') + '">' +
          (r.pnl >= 0 ? '赚 +' : '亏 ') + U.comma(Math.abs(r.pnl)) + ' 元 · ' +
          U.fmt(r.ret) + '</div></div>' +
      '<div class="ckp-h-item"><span>加权波动率</span><b class="n">' +
        r.wVol.toFixed(1) + '</b><small>%</small></div>' +
      '<div class="ckp-h-item"><span>加权回撤</span><b class="n up">-' +
        r.wMdd.toFixed(1) + '</b><small>%</small></div>' +
      '</div>';

    /* 问题清单 */
    h += '<div class="ckp-sec"><div class="ckp-sec-t">体检结论</div>';
    if (!iss.length) {
      h += '<div class="ckp-iss good"><b>✅ 没有发现明显的结构性问题。</b>' +
        '<span>继续按计划持有，每季度复查一次即可。</span></div>';
    } else {
      iss.forEach(function (x) {
        var ICON = { bad: '✕', warn: '!', good: '✓' };
        h += '<div class="ckp-iss ' + x.lvl + '">' +
          '<span class="ckp-ic">' + (ICON[x.lvl] || '·') + '</span>' +
          '<div><b>' + x.t + '</b><span>' + x.d + '</span></div></div>';
      });
    }
    h += '</div>';

    /* 板块分布 */
    var secArr = Object.keys(r.bySec).map(function (k) {
      return { sec: k, name: SECNAMES[k] || k, v: r.bySec[k],
               pct: r.bySec[k] / r.total * 100 };
    }).sort(function (a, b) { return b.v - a.v; });

    h += '<div class="ckp-sec"><div class="ckp-sec-t">板块分布</div><div class="ckp-bars">';
    secArr.forEach(function (x) {
      h += '<div class="ckp-bar-row">' +
        '<span class="ckp-br-name">' + U.esc(x.name) + '</span>' +
        '<span class="ckp-br-track"><i style="width:' + x.pct + '%"></i></span>' +
        '<b class="ckp-br-pct">' + x.pct.toFixed(1) + '%</b>' +
        '<span class="ckp-br-money">' + U.comma(x.v) + '</span>' +
        '</div>';
    });
    h += '</div></div>';

    /* 大类分布 */
    var GRPNAME = { fund: '债券基金', stock: '股票基金', commodity: '商品基金' };
    var grpArr = Object.keys(r.byGrp).map(function (k) {
      return { g: k, name: GRPNAME[k] || k, v: r.byGrp[k],
               pct: r.byGrp[k] / r.total * 100 };
    }).sort(function (a, b) { return b.v - a.v; });
    h += '<div class="ckp-sec"><div class="ckp-sec-t">大类分布</div><div class="ckp-grps">';
    grpArr.forEach(function (x) {
      h += '<div class="ckp-grp"><span>' + x.name + '</span>' +
        '<b class="n">' + x.pct.toFixed(0) + '%</b>' +
        '<small>' + U.comma(x.v) + ' 元</small></div>';
    });
    h += '</div></div>';

    /* 逐笔明细 */
    h += '<div class="ckp-sec"><div class="ckp-sec-t">逐笔明细</div>';
    h += '<table class="ckp-tbl"><thead><tr>' +
      '<th class="left">基金</th><th class="left">板块</th>' +
      '<th>投入</th><th>市值</th><th>盈亏</th><th>收益率</th><th>占比</th>' +
      '</tr></thead><tbody>';
    r.rows.slice().sort(function (a, b) { return b.value - a.value; }).forEach(function (x) {
      var pct = x.value / r.total * 100;
      h += '<tr>' +
        '<td class="left">' + U.esc(x.f.name.slice(0, 16)) +
          '<div class="ckp-sub">' + x.f.code + '</div></td>' +
        '<td class="left" style="font-size:11.5px;color:var(--dim2)">' +
          U.esc(x.f.secName) + '</td>' +
        '<td>' + U.comma(x.cost) + '</td>' +
        '<td>' + U.comma(x.value) + '</td>' +
        '<td class="' + (x.pnl >= 0 ? 'up' : 'down') + '">' +
          (x.pnl >= 0 ? '+' : '') + U.comma(x.pnl) + '</td>' +
        '<td class="' + (x.ret >= 0 ? 'up' : 'down') + '">' + U.fmt(x.ret) + '</td>' +
        '<td>' + pct.toFixed(1) + '%</td>' +
        '</tr>';
    });
    h += '</tbody></table></div>';

    /* 风险三格 */
    h += '<div class="ckp-sec"><div class="ckp-sec-t">最坏能亏多少</div>' +
      '<div class="ckp-risk">' +
        '<div class="ckp-r"><span>正常回调 -3%</span><b class="up">-' +
          U.comma(r.total * 0.03) + '</b></div>' +
        '<div class="ckp-r"><span>各腿同时打历史最深</span><b class="up">-' +
          U.comma(r.total * r.wMdd / 100) + '</b>' +
          '<small>加权 -' + r.wMdd.toFixed(1) + '%</small></div>' +
        '<div class="ckp-r"><span>最惨那一只打到底</span><b class="up">-' +
          U.comma(r.worst ? r.worst.value * Math.abs(r.worst.f.mddAll) / 100 : 0) +
          '</b><small>' + (r.worst ? U.esc(r.worst.f.name.slice(0, 10)) : '—') +
          ' ' + (r.worst ? U.fmt(r.worst.f.mddAll) : '') + '</small></div>' +
      '</div></div>';

    /* 结论 */
    h += '<div class="ckp-sec"><div class="ckp-sec-t">接下来做什么</div>' +
      '<ol class="ckp-todo">' +
        '<li><b>先确认这份持仓是不是你想要的。</b>' +
          '如果板块结构和你的风险承受力不匹配，先改结构，别急着加仓。</li>' +
        (iss.some(function (x) { return x.lvl !== 'good'; })
          ? '<li><b>处理上面标记的问题。</b>一次只改一件事，改完观察一段时间再动第二件。</li>'
          : '<li><b>没有明显问题，保持即可。</b>每季度复查一次，或者偏离超过 5 个百分点时再看。</li>') +
        '<li>去 <a href="再平衡.html">再平衡提醒</a> 看偏离度，' +
          '确认现在的仓位有没有偏离你的目标。</li>' +
        '<li>下次买入前，先在 <a href="决策日志.html">决策日志</a> 写下理由和' +
          '"什么情况我会认错"。</li>' +
      '</ol></div>';

    /* 免责 */
    h += '<div class="ckp-foot">' +
      '本报告基于你手动录入的持仓和公开净值数据生成，' +
      '不构成投资建议。收益率按累计净值口径推算，未扣除申购费与赎回费。' +
      '</div>';

    h += '</div>';

    report.innerHTML = h;
  }

  render();
})();
