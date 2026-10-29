/* ===========================================================
   基金详情页 · 内嵌定投试算
   目的：看单只基金时，不用跳页、不用重选基金，就地试算定投。
   完整版（含逐期明细 + 曲线 + 解读）仍在 定投计算器.html?code=xxx

   ⚠️ 计算逻辑必须与 _assets/dca.js 的 calc() 完全一致。
      两处同步维护，改公式时两边都要改。
   =========================================================== */
(function () {
  'use strict';
  var D = window.DATA, U = window.UI;
  if (!D || !U) return;

  var box = document.getElementById('fundDca');
  if (!box) return;

  var CFG = window.FUND || {};
  var CODE = CFG.code;
  var F = null;
  for (var i = 0; i < D.funds.length; i++) {
    if (D.funds[i].code === CODE) { F = D.funds[i]; break; }
  }
  if (!F || !F.seq || F.seq.length < 10) {
    box.innerHTML = '<div class="sim-empty">这只基金数据不足以试算定投。</div>';
    return;
  }

  var axis = D.axis || [];
  var seq = F.seq;
  var n = seq.length;

  /* ---------- 与 dca.js 一致的日期工具 ---------- */
  function parseDate(s) {
    var a = s.split('-');
    return new Date(+a[0], +a[1] - 1, +a[2]);
  }
  function dayDiff(d1, d2) {
    return Math.round((parseDate(d2) - parseDate(d1)) / 86400000);
  }
  var WIN_DAYS = dayDiff(axis[0], axis[axis.length - 1]);

  var FREQS = [
    { k: 6,  name: '每 2 个月' },
    { k: 12, name: '每月' },
    { k: 24, name: '每 2 周' }
  ];

  var state = { amount: 1000, times: 12 };

  function stepDays(k) {
    var step = (n - 1) / k;
    var i0 = 0, i1 = Math.min(n - 1, Math.round(step));
    if (i1 === i0) return 0;
    return dayDiff(axis[i0], axis[i1]);
  }

  /* ---------- 核心计算（与 dca.js calc() 一致）---------- */
  function calc() {
    var k = state.times;
    var amt = state.amount;
    var step = (n - 1) / k;

    var rows = [], shares = 0, invested = 0;
    for (var i = 0; i < k; i++) {
      var idx = Math.min(n - 1, Math.round(i * step));
      var price = seq[idx] / 100;
      shares += amt / price;
      invested += amt;
      rows.push({
        i: i + 1,
        date: axis[Math.min(axis.length - 1, Math.round(idx / (n - 1) * (axis.length - 1)))],
        price: price, invested: invested
      });
    }

    var finalValue = shares * (seq[n - 1] / 100);
    var dcaRet = (finalValue / invested - 1) * 100;

    var lumpInvested = amt * k;
    var lumpShares = lumpInvested / (seq[0] / 100);
    var lumpValue = lumpShares * (seq[n - 1] / 100);
    var lumpRet = (lumpValue / lumpInvested - 1) * 100;

    return {
      k: k, amt: amt, rows: rows,
      firstBuy: rows[0].date, lastBuy: rows[rows.length - 1].date,
      stepDays: stepDays(k),
      winStart: axis[0], winEnd: axis[axis.length - 1], winDays: WIN_DAYS,
      invested: invested, finalValue: finalValue, dcaRet: dcaRet,
      lumpInvested: lumpInvested, lumpValue: lumpValue, lumpRet: lumpRet,
      diff: dcaRet - lumpRet
    };
  }

  function render() {
    var r = calc();
    var profit = r.finalValue - r.invested;
    var better = r.diff > 0;
    var diffMoney = Math.abs(r.finalValue - r.lumpValue);
    var freqName = '定投';
    FREQS.forEach(function (f) { if (f.k === r.k) freqName = f.name; });

    var html =
      /* 紧凑表单 */
      '<div class="fd-form">' +
        '<div class="fdf-row">' +
          '<label>每期投</label>' +
          '<input type="number" class="fdf-input" id="fdAmt" value="' + state.amount +
            '" min="100" step="100">' +
          '<span class="fdf-unit">元</span>' +
          '<span class="fdf-presets">' +
            [500, 1000, 2000, 5000].map(function (v) {
              return '<button class="fdf-pre' + (state.amount === v ? ' on' : '') +
                '" data-v="' + v + '">' + v + '</button>';
            }).join('') +
          '</span>' +
        '</div>' +
        '<div class="fdf-row">' +
          '<label>多久一次</label>' +
          '<span class="fdf-presets">' +
            FREQS.map(function (f) {
              return '<button class="fdf-pre' + (state.times === f.k ? ' on' : '') +
                '" data-t="' + f.k + '">' + f.name + '</button>';
            }).join('') +
          '</span>' +
          '<span class="fdf-hint">共 <b class="n">' + r.k + '</b> 次 · 间隔约 <b class="n">' +
            r.stepDays + '</b> 天</span>' +
        '</div>' +
      '</div>' +

      /* 金额流向（和定投计算器同一套视觉） */
      '<div class="dm-flow fd-flow">' +
        '<div class="dmf-item">' +
          '<div class="dmf-lbl">每期投入</div>' +
          '<div class="dmf-val"><b class="n">' + U.comma(r.amt) + '</b><small>元</small></div>' +
        '</div>' +
        '<div class="dmf-x">×</div>' +
        '<div class="dmf-item">' +
          '<div class="dmf-lbl">投了</div>' +
          '<div class="dmf-val"><b class="n">' + r.k + '</b><small>次</small></div>' +
        '</div>' +
        '<div class="dmf-x">=</div>' +
        '<div class="dmf-item">' +
          '<div class="dmf-lbl">累计投入</div>' +
          '<div class="dmf-val"><b class="n">' + U.comma(r.invested) + '</b><small>元</small></div>' +
        '</div>' +
        '<div class="dmf-arrow">→</div>' +
        '<div class="dmf-item dmf-final">' +
          '<div class="dmf-lbl">现在值</div>' +
          '<div class="dmf-val"><b class="n ' + (profit >= 0 ? 'up' : 'down') + '">' +
            U.comma(r.finalValue) + '</b><small>元</small></div>' +
          '<div class="dmf-sub ' + (profit >= 0 ? 'up' : 'down') + '">' +
            (profit >= 0 ? '赚 +' : '亏 ') + U.comma(Math.abs(profit)) + ' 元 · ' +
            U.fmt(r.dcaRet) + '</div>' +
        '</div>' +
      '</div>' +

      /* 对比 + 结论 */
      '<div class="fd-vs">' +
        '<div class="fdv-item fdv-hl">' +
          '<div class="fdv-t">按「' + freqName + '」投 ' + r.k + ' 次</div>' +
          '<div class="fdv-m ' + (r.dcaRet >= 0 ? 'up' : 'down') + '">' +
            U.comma(r.finalValue) + '<small>元</small></div>' +
        '</div>' +
        '<div class="fdv-sign">VS</div>' +
        '<div class="fdv-item">' +
          '<div class="fdv-t">第一天一次买完</div>' +
          '<div class="fdv-m ' + (r.lumpRet >= 0 ? 'up' : 'down') + '">' +
            U.comma(r.lumpValue) + '<small>元</small></div>' +
        '</div>' +
      '</div>' +

      '<div class="fd-tag ' + (better ? 'win' : 'lose') + '">' +
        (better
          ? '定投多赚 <b>' + U.comma(diffMoney) + ' 元</b>'
          : '一次性多赚 <b>' + U.comma(diffMoney) + ' 元</b>') +
        '（' + Math.abs(r.diff).toFixed(2) + ' 个百分点）' +
      '</div>' +

      '<div class="fd-foot">' +
        '<span>窗口 ' + r.winStart + ' → ' + r.winEnd + '（' + r.winDays + ' 天）</span>' +
        '<span>首次买入 ' + r.firstBuy + ' · 末次 ' + r.lastBuy + '</span>' +
        '<a class="fd-more" href="../定投计算器.html?code=' + CODE + '">看逐期明细和曲线 →</a>' +
      '</div>';

    box.innerHTML = html;

    /* 绑定 */
    var amt = document.getElementById('fdAmt');
    if (amt) {
      amt.addEventListener('input', function () {
        var v = +amt.value;
        if (!isNaN(v) && v > 0) state.amount = v;
        /* 只重画，重新聚焦 */
        render();
        var a2 = document.getElementById('fdAmt');
        if (a2) { a2.focus(); if (a2.setSelectionRange) a2.setSelectionRange(a2.value.length, a2.value.length); }
      });
    }
    Array.prototype.forEach.call(box.querySelectorAll('.fdf-pre'), function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('data-v')) state.amount = +b.getAttribute('data-v');
        if (b.getAttribute('data-t')) state.times = +b.getAttribute('data-t');
        render();
      });
    });
  }

  render();
})();
