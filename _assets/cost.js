/* ===========================================================
   买入成本计算器
   核心价值：算出「基金要涨多少你才真正不亏」（盈亏平衡点）
   费率说明：
     申购费 — 用真实数据 rate 字段（%）
     赎回费 — 数据源没有，用行业通用阶梯规则估算（页面已明确标注）
   支持 URL：?code=003376&amt=10000 预填
   =========================================================== */
(function () {
  'use strict';
  var D = window.DATA, U = window.UI;
  if (!D || !U) return;

  var formHost = document.getElementById('ccForm');
  if (!formHost) return;

  /* ---------------- 赎回费阶梯（行业通用规则，估算用）----------------
     债券/混合类（grp=fund）：<7天 1.5% / 7~30天 0.10% / ≥30天 0
     股票/商品类（grp=stock|commodity）：<7天 1.5% / 7~30天 0.75%
                                        / 30天~1年 0.5% / 1~2年 0.25% / ≥2年 0
     数值来源：公募基金常见费率结构。个体可能有差异，页面已提示。
     ---------------------------------------------------------------- */
  var RULES = {
    fund: [
      { days: 0,   rate: 1.5,  label: '不满 7 天' },
      { days: 7,   rate: 0.10, label: '7 天 ~ 30 天' },
      { days: 30,  rate: 0,    label: '满 30 天' }
    ],
    stock: [
      { days: 0,   rate: 1.5,  label: '不满 7 天' },
      { days: 7,   rate: 0.75, label: '7 天 ~ 30 天' },
      { days: 30,  rate: 0.5,  label: '30 天 ~ 1 年' },
      { days: 365, rate: 0.25, label: '1 年 ~ 2 年' },
      { days: 730, rate: 0,    label: '满 2 年' }
    ]
  };
  RULES.commodity = RULES.stock;

  function redeemRate(grp, days) {
    var r = RULES[grp] || RULES.stock;
    var out = r[0];
    for (var i = 0; i < r.length; i++) if (days >= r[i].days) out = r[i];
    return out;
  }

  function getF(code) {
    for (var i = 0; i < D.funds.length; i++) if (D.funds[i].code === code) return D.funds[i];
    return null;
  }

  /* ---------------- 状态 ---------------- */
  var initCode = '';
  var initAmt = 10000;
  try {
    var qs = location.search || '';
    var mc = qs.match(/[?&]code=(\d{6})/);
    if (mc && getF(mc[1])) initCode = mc[1];
    var ma = qs.match(/[?&]amt=(\d+)/);
    if (ma) initAmt = +ma[1];
  } catch (e) {}

  var state = {
    code: initCode || '001512',
    amount: initAmt,
    days: 365,
    gain: 0           /* 假设涨跌幅 %，用于算"涨了之后卖出" */
  };
  if (!getF(state.code)) state.code = D.funds[0].code;

  /* ---------------- 计算 ---------------- */
  function calc() {
    var f = getF(state.code);
    if (!f) return null;

    /* 申购费：rate 是百分数（0.12 表示 0.12%）。场内 ETF 为 null。 */
    var isEtf = (f.rate === null || f.rate === undefined);
    var subRate = isEtf ? 0 : f.rate;              /* % */
    var isC = (!isEtf && f.rate === 0);            /* C 类：免申购费但有服务费 */

    var amount = state.amount;
    var subFee = amount * subRate / 100;
    var invested = amount - subFee;                /* 实际进入基金的金额 */

    var days = state.days;
    var rr = redeemRate(f.grp, days);
    var redeemFeeRate = rr.rate;

    /* 假设持有期内基金涨了 gain% */
    var grown = invested * (1 + state.gain / 100);
    var redeemFee = grown * redeemFeeRate / 100;
    var netOut = grown - redeemFee;                /* 最终到手 */
    var profit = netOut - amount;                  /* 相对最初投入的盈亏 */
    var profitPct = amount ? profit / amount * 100 : 0;

    /* 盈亏平衡点：netOut = amount 时的涨幅
       amount*(1-sub)*(1+g)*(1-redeem) = amount
       => (1+g) = 1 / ((1-sub)*(1-redeem))
       => g = 1/((1-sub)*(1-redeem)) - 1                            */
    var subF = subRate / 100;
    var redF = redeemFeeRate / 100;
    var beGain = (1 / ((1 - subF) * (1 - redF)) - 1) * 100;

    /* 各持有期对比（假设 gain 固定为 state.gain） */
    var holdRows = (RULES[f.grp] || RULES.stock).map(function (r) {
      var gp = invested * (1 + state.gain / 100);
      var fee = gp * r.rate / 100;
      var net = gp - fee;
      return {
        label: r.label, days: r.days, rate: r.rate,
        fee: fee, net: net, profit: net - amount,
        be: (1 / ((1 - subF) * (1 - r.rate / 100)) - 1) * 100
      };
    });

    /* 7 天内卖出（惩罚场景）单独算 */
    var d7 = (RULES[f.grp] || RULES.stock)[0];
    var g7 = invested * (1 + state.gain / 100);
    var f7 = g7 * d7.rate / 100;

    return {
      f: f, isEtf: isEtf, isC: isC,
      amount: amount, subRate: subRate, subFee: subFee, invested: invested,
      days: days, redeemRate: redeemFeeRate, redeemLabel: rr.label,
      gain: state.gain,
      grown: grown, redeemFee: redeemFee, netOut: netOut,
      profit: profit, profitPct: profitPct,
      beGain: beGain,
      holdRows: holdRows,
      penaltyFee: f7,
      penaltyDiff: f7 - (grown * ((RULES[f.grp] || RULES.stock)[1] || { rate: 0 }).rate / 100)
    };
  }

  /* =========================================================
     输入区
     ========================================================= */
  function renderForm() {
    var html = '<div class="cc-form">';

    html += '<div class="cc-row"><label>选基金</label>' +
      '<select class="sim-select" id="ccCode" style="max-width:460px">' +
      '<option value="">选择一只基金…</option>' +
      D.funds.slice().sort(function (a, b) { return b.ret250 - a.ret250; }).map(function (f) {
        var rt = (f.rate === null || f.rate === undefined) ? '场内' : f.rate + '%';
        return '<option value="' + f.code + '"' +
          (state.code === f.code ? ' selected' : '') + '>' +
          f.code + ' ' + f.name.slice(0, 16) + '（申购费 ' + rt + '）</option>';
      }).join('') + '</select></div>';

    html += '<div class="cc-row"><label>买入金额</label>' +
      '<input type="number" class="cc-input" id="ccAmt" value="' + state.amount +
        '" min="100" step="1000">' +
      '<span class="cc-unit">元</span>' +
      '<span class="cc-presets">' +
        [1000, 5000, 10000, 50000, 100000].map(function (v) {
          return '<button class="cc-pre' + (state.amount === v ? ' on' : '') +
            '" data-a="' + v + '">' + (v >= 10000 ? (v / 10000) + '万' : v) + '</button>';
        }).join('') +
      '</span></div>';

    html += '<div class="cc-row"><label>打算持有</label>' +
      '<span class="cc-presets">' +
        [3, 10, 60, 365, 730].map(function (d) {
          var nm = d === 3 ? '3 天' : (d === 10 ? '10 天' : (d === 60 ? '2 个月' :
                   (d === 365 ? '1 年' : '2 年')));
          return '<button class="cc-pre' + (state.days === d ? ' on' : '') +
            '" data-d="' + d + '">' + nm + '</button>';
        }).join('') +
      '</span>' +
      '<input type="number" class="cc-input cc-days" id="ccDays" value="' + state.days +
        '" min="1" step="1">' +
      '<span class="cc-unit">天</span></div>';

    html += '<div class="cc-row"><label>假设涨跌</label>' +
      '<input type="number" class="cc-input cc-days" id="ccGain" value="' + state.gain +
        '" step="0.5">' +
      '<span class="cc-unit">%</span>' +
      '<span class="cc-presets">' +
        [-5, 0, 1, 5, 10].map(function (g) {
          return '<button class="cc-pre' + (state.gain === g ? ' on' : '') +
            '" data-g="' + g + '">' + (g > 0 ? '+' : '') + g + '%</button>';
        }).join('') +
      '</span>' +
      '<span class="cc-hint">填 0 就是看"没涨没跌时卖出会怎样"</span></div>';

    html += '</div>';
    formHost.innerHTML = html;

    /* 绑定 */
    var sel = document.getElementById('ccCode');
    if (sel) sel.addEventListener('change', function () { state.code = sel.value; renderAll(); });

    var amt = document.getElementById('ccAmt');
    if (amt) amt.addEventListener('input', function () {
      var v = +amt.value; if (!isNaN(v) && v > 0) state.amount = v; refresh();
    });

    var dy = document.getElementById('ccDays');
    if (dy) dy.addEventListener('input', function () {
      var v = +dy.value; if (!isNaN(v) && v > 0) state.days = v; refresh();
    });

    var gn = document.getElementById('ccGain');
    if (gn) gn.addEventListener('input', function () {
      var v = +gn.value; if (!isNaN(v)) state.gain = v; refresh();
    });

    Array.prototype.forEach.call(formHost.querySelectorAll('.cc-pre'), function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('data-a')) state.amount = +b.getAttribute('data-a');
        if (b.getAttribute('data-d')) state.days = +b.getAttribute('data-d');
        if (b.getAttribute('data-g') !== null && b.getAttribute('data-g') !== undefined &&
            b.hasAttribute('data-g')) state.gain = +b.getAttribute('data-g');
        renderAll();
      });
    });
  }

  /* =========================================================
     成本明细
     ========================================================= */
  function renderBreak(r) {
    var host = document.getElementById('ccBreak');
    if (!host) return;

    var subTxt;
    if (r.isEtf) {
      subTxt = '<b style="color:#6aacff">场内 ETF，按券商佣金</b>' +
        '<span class="ccb-note">没有申购费，但有交易佣金（约万分之一到万分之三）</span>';
    } else if (r.isC) {
      subTxt = '<b style="color:#6aacff">C 类：0 元申购费</b>' +
        '<span class="ccb-note">但每年另收约 0.2%~0.4% 销售服务费，持有越久越吃亏</span>';
    } else {
      subTxt = '<b class="n">' + U.comma(r.subFee) + ' 元</b>' +
        '<span class="ccb-note">费率 ' + U.fmtNum(r.subRate, 2) + '%</span>';
    }

    host.innerHTML =
      '<div class="ccb-flow">' +
        '<div class="ccb-step">' +
          '<div class="ccb-lbl">你付出</div>' +
          '<div class="ccb-val"><b class="n">' + U.comma(r.amount) + '</b><small>元</small></div>' +
        '</div>' +
        '<div class="ccb-minus">−</div>' +
        '<div class="ccb-step ccb-fee">' +
          '<div class="ccb-lbl">申购费</div>' +
          '<div class="ccb-val">' + subTxt + '</div>' +
        '</div>' +
        '<div class="ccb-eq">=</div>' +
        '<div class="ccb-step">' +
          '<div class="ccb-lbl">真正买入</div>' +
          '<div class="ccb-val"><b class="n">' + U.comma(r.invested) + '</b><small>元</small></div>' +
        '</div>' +
      '</div>' +

      '<div class="ccb-flow" style="margin-top:14px">' +
        '<div class="ccb-step">' +
          '<div class="ccb-lbl">持有 ' + r.days + ' 天后（假设' +
            (r.gain > 0 ? '涨 ' + r.gain : (r.gain < 0 ? '跌 ' + Math.abs(r.gain) : '没涨没跌')) + '%）' +
          '</div>' +
          '<div class="ccb-val"><b class="n">' + U.comma(r.grown) + '</b><small>元</small></div>' +
        '</div>' +
        '<div class="ccb-minus">−</div>' +
        '<div class="ccb-step ccb-fee">' +
          '<div class="ccb-lbl">赎回费（' + r.redeemLabel + '）</div>' +
          '<div class="ccb-val"><b class="n">' + U.comma(r.redeemFee) + '</b><small>元</small></div>' +
          '<span class="ccb-note">费率 ' + U.fmtNum(r.redeemRate, 2) + '%</span>' +
        '</div>' +
        '<div class="ccb-eq">=</div>' +
        '<div class="ccb-step ccb-final">' +
          '<div class="ccb-lbl">实际到手</div>' +
          '<div class="ccb-val"><b class="n ' + (r.profit >= 0 ? 'up' : 'down') + '">' +
            U.comma(r.netOut) + '</b><small>元</small></div>' +
          '<div class="ccb-pnl ' + (r.profit >= 0 ? 'up' : 'down') + '">' +
            (r.profit >= 0 ? '赚 +' : '亏 ') + U.comma(Math.abs(r.profit)) + ' 元 · ' +
            U.fmt(r.profitPct) + '</div>' +
        '</div>' +
      '</div>' +

      /* 总成本 */
      '<div class="ccb-total">' +
        '<span>这笔交易的总成本（申购费 + 赎回费）</span>' +
        '<b class="n up">' + U.comma(r.subFee + r.redeemFee) + ' 元</b>' +
        '<span>占投入 ' + ((r.subFee + r.redeemFee) / r.amount * 100).toFixed(3) + '%</span>' +
      '</div>';
  }

  /* =========================================================
     盈亏平衡点
     ========================================================= */
  function renderBreakeven(r) {
    var host = document.getElementById('ccBreakeven');
    if (!host) return;

    var be = r.beGain;
    var beMoney = r.amount * be / 100;
    var danger = be > 1;

    host.innerHTML =
      '<div class="be-hero">' +
        '<div class="be-lbl">基金至少要涨</div>' +
        '<div class="be-num ' + (danger ? 'up' : 'down') + '">' + be.toFixed(3) + '<small>%</small></div>' +
        '<div class="be-sub">你才刚好回本（不赚不亏）</div>' +
        '<div class="be-money">相当于这只基金要涨出 <b class="n">' + U.comma(beMoney) +
          ' 元</b>，才抵掉手续费</div>' +
      '</div>' +

      '<div class="be-formula">' +
        '<div class="bf-title">这个数字是怎么来的</div>' +
        '<div class="bf-line">' +
          '<code>1 ÷ [ (1 − ' + U.fmtNum(r.subRate, 2) + '%) × (1 − ' +
            U.fmtNum(r.redeemRate, 2) + '%) ] − 1 = ' + be.toFixed(3) + '%</code>' +
        '</div>' +
        '<div class="bf-note">' +
          '申购费 <b>' + U.fmtNum(r.subRate, 2) + '%</b> 先扣掉一块，' +
          '赎回费 <b>' + U.fmtNum(r.redeemRate, 2) + '%</b> 再扣掉一块，' +
          '<b>两块都要靠净值上涨补回来。</b>' +
        '</div>' +
      '</div>' +

      (danger ? '<div class="note warn" style="margin-bottom:0">' +
        '<b>⚠️ 注意：你现在选的持有期是 ' + r.days + ' 天，赎回费率 ' +
        U.fmtNum(r.redeemRate, 2) + '%。</b><br>' +
        '换个持有期，这个平衡点会变——<b>拉长持有时间是最直接的降低成本方式。</b>' +
        '看下面的对比表。' +
        '</div>' : '') +

      '<div class="be-cmp">' +
        '<div class="be-cmp-item">' +
          '<span>如果只持有 3 天</span>' +
          '<b class="up">' + ((1 / ((1 - r.subRate / 100) * (1 - 1.5 / 100)) - 1) * 100).toFixed(2) + '%</b>' +
          '<small>才回本</small>' +
        '</div>' +
        '<div class="be-cmp-item">' +
          '<span>持有满 2 年</span>' +
          '<b class="down">' + ((1 / ((1 - r.subRate / 100) * 1) - 1) * 100).toFixed(2) + '%</b>' +
          '<small>就够</small>' +
        '</div>' +
        '<div class="be-cmp-item be-cmp-hl">' +
          '<span>差多少</span>' +
          '<b>' + Math.abs(
            ((1 / ((1 - r.subRate / 100) * (1 - 1.5 / 100)) - 1) * 100) -
            ((1 / ((1 - r.subRate / 100) * 1) - 1) * 100)
          ).toFixed(2) + ' 个百分点</b>' +
          '<small>光靠等就能省下</small>' +
        '</div>' +
      '</div>';
  }

  /* =========================================================
     持有期对比表
     ========================================================= */
  function renderHoldTable(r) {
    var host = document.getElementById('ccHoldTable');
    if (!host) return;

    var h = '<thead><tr>' +
      '<th class="left">持有时间</th><th>赎回费率</th>' +
      '<th>赎回费</th><th>实际到手</th><th>盈亏</th><th>回本需涨</th>' +
      '</tr></thead><tbody>';

    r.holdRows.forEach(function (x, i) {
      var isCur = (r.days >= x.days) &&
        (i === r.holdRows.length - 1 || r.days < r.holdRows[i + 1].days);
      h += '<tr' + (isCur ? ' class="me"' : '') + '>' +
        '<td class="left">' + x.label +
          (isCur ? ' <span class="tag gold">你选的</span>' : '') + '</td>' +
        '<td>' + U.fmtNum(x.rate, 2) + '%</td>' +
        '<td class="up">' + U.comma(x.fee) + '</td>' +
        '<td>' + U.comma(x.net) + '</td>' +
        '<td class="' + (x.profit >= 0 ? 'up' : 'down') + '">' +
          (x.profit >= 0 ? '+' : '') + U.comma(x.profit) + '</td>' +
        '<td class="' + (x.be > 1 ? 'up' : 'down') + '">' + x.be.toFixed(2) + '%</td>' +
        '</tr>';
    });

    host.innerHTML = h + '</tbody>';
  }

  /* =========================================================
     渲染
     ========================================================= */
  function refresh() {
    var r = calc();
    if (!r) return;
    renderBreak(r);
    renderBreakeven(r);
    renderHoldTable(r);
  }

  function renderAll() {
    renderForm();
    refresh();
  }

  renderAll();
})();
