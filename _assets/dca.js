/* ===========================================================
   定投计算器
   主视觉设计原则：用户填的是"每期多少钱"，所以结果必须先回答
   "我的钱变成多少了"，收益率只是辅助信息。
   支持 URL 参数：?code=003376 可直接预选基金（供详情页跳转用）
   =========================================================== */
(function () {
  'use strict';
  var D = window.DATA, U = window.UI, C2 = window.Chart2;
  if (!D || !U) return;
  var box = document.getElementById('dcaBox2');
  if (!box) return;

  var F = D.funds.slice().sort(function (a, b) { return b.ret250 - a.ret250; });
  var axis = D.axis || [];

  /* ---------------- 日期工具 ---------------- */
  function parseDate(s) {
    var a = s.split('-');
    return new Date(+a[0], +a[1] - 1, +a[2]);
  }
  function dayDiff(d1, d2) {
    return Math.round((parseDate(d2) - parseDate(d1)) / 86400000);
  }
  var WIN_DAYS = dayDiff(axis[0], axis[axis.length - 1]);

  /* 频率档位 */
  var FREQS = [
    { k: 6,  name: '每 2 个月' },
    { k: 12, name: '每月' },
    { k: 24, name: '每 2 周' }
  ];

  /* ---------------- 状态 ---------------- */
  function getF(code) {
    for (var i = 0; i < D.funds.length; i++) if (D.funds[i].code === code) return D.funds[i];
    return null;
  }

  /* 支持 ?code= 预选（供详情页跳转过来） */
  var initCode = '001512';
  try {
    var qs = location.search || '';
    var m = qs.match(/[?&]code=(\d{6})/);
    if (m && getF(m[1])) initCode = m[1];
  } catch (e) {}
  if (!getF(initCode)) initCode = F[0].code;

  var state = { code: initCode, amount: 1000, times: 12 };

  /* 每期间隔天数（实测：第一期到第二期） */
  function stepDays(k, seqArr) {
    if (!seqArr || seqArr.length < 2) return Math.round(WIN_DAYS / k);
    var n = seqArr.length;
    var step = (n - 1) / k;
    var i0 = 0, i1 = Math.min(n - 1, Math.round(step));
    if (i1 === i0) return 0;
    return dayDiff(axis[i0], axis[i1]);
  }

  /* =========================================================
     核心计算
     ========================================================= */
  function calc() {
    var f = getF(state.code);
    if (!f || !f.seq || f.seq.length < 5) return null;
    var seq = f.seq;
    var n = seq.length;
    var k = Math.max(1, Math.min(48, state.times));
    var step = (n - 1) / k;
    var amt = state.amount;

    /* 逐期买入 */
    var rows = [], shares = 0, invested = 0;
    for (var i = 0; i < k; i++) {
      var idx = Math.min(n - 1, Math.round(i * step));
      var price = seq[idx] / 100;                 /* 相对价格，首期 = 1 */
      var got = amt / price;
      shares += got;
      invested += amt;
      rows.push({
        i: i + 1, idx: idx,
        date: axis[Math.min(axis.length - 1, Math.round(idx / (n - 1) * (axis.length - 1)))],
        price: price, amt: amt, got: got,
        shares: shares, invested: invested,
        /* 累计市值 */
        value: shares * (seq[n - 1] / 100),
        /* 这一期单独现在是多少（只算这笔钱自己涨跌） */
        ownValue: amt * (seq[n - 1] / 100) / price,
        /* 这一期单独盈亏 */
        ownPnl: amt * (seq[n - 1] / 100) / price - amt,
        /* 买的时候比第一期贵/便宜多少 */
        vsFirst: (price / (seq[0] / 100) - 1) * 100
      });
    }

    var finalValue = shares * (seq[n - 1] / 100);
    var dcaRet = (finalValue / invested - 1) * 100;

    /* 一次性：同样总投入在第一天全买 */
    var lumpInvested = amt * k;
    var lumpShares = lumpInvested / (seq[0] / 100);
    var lumpValue = lumpShares * (seq[n - 1] / 100);
    var lumpRet = (lumpValue / lumpInvested - 1) * 100;

    /* 两条曲线（相对总投入的百分比，便于同尺度对比） */
    var dcaCurve = [], lumpCurve = [];
    for (var t = 0; t < n; t++) {
      var sh = 0;
      for (var j = 0; j < k; j++) {
        if (Math.round(j * step) <= t) {
          sh += amt / (seq[Math.min(n - 1, Math.round(j * step))] / 100);
        }
      }
      dcaCurve.push(sh * (seq[t] / 100));
      lumpCurve.push(lumpShares * (seq[t] / 100));
    }

    var firstBuy = rows[0].date;
    var lastBuy = rows[rows.length - 1].date;
    var endDate = axis[axis.length - 1];

    return {
      f: f, rows: rows, k: k, amt: amt,
      winStart: axis[0], winEnd: endDate, winDays: WIN_DAYS,
      firstBuy: firstBuy, lastBuy: lastBuy,
      stepDays: stepDays(k, seq), holdDays: dayDiff(lastBuy, endDate),
      invested: invested, finalValue: finalValue, dcaRet: dcaRet,
      lumpInvested: lumpInvested, lumpValue: lumpValue, lumpRet: lumpRet,
      diff: dcaRet - lumpRet,
      dcaCurve: dcaCurve, lumpCurve: lumpCurve,
      avgCost: invested / shares,
      lastPrice: seq[n - 1] / 100,
      firstPrice: seq[0] / 100
    };
  }

  /* =========================================================
     结果卡：钱为主，百分比为辅
     ========================================================= */
  function buildResultCard(r) {
    var better = r.diff > 0;
    var profit = r.finalValue - r.invested;
    var freqName = '定投';
    FREQS.forEach(function (f) { if (f.k === r.k) freqName = f.name; });
    var diffMoney = Math.abs(r.finalValue - r.lumpValue);

    return '<div class="dca-res">' +

      /* 窗口与节奏 */
      '<div class="dr-window">' +
        '<span>数据窗口 <b class="n">' + r.winStart + '</b> → <b class="n">' + r.winEnd + '</b>' +
          '（<b class="n">' + r.winDays + '</b> 天）</span>' +
        '<span>首次买入 <b class="n">' + r.firstBuy + '</b></span>' +
        '<span>末次买入 <b class="n">' + r.lastBuy + '</b></span>' +
        '<span>间隔约 <b class="n">' + r.stepDays + '</b> 天</span>' +
        '<span>末笔持有 <b class="n">' + r.holdDays + '</b> 天</span>' +
      '</div>' +

      /* 主视觉：钱怎么变 */
      '<div class="dm-flow">' +
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

      /* 定投 vs 一次性（金额为主） */
      '<div class="dr-vs">' +
        '<div class="dv-item dv-hl">' +
          '<div class="dv-t">按「' + freqName + '」投 ' + r.k + ' 次</div>' +
          '<div class="dv-money ' + (r.dcaRet >= 0 ? 'up' : 'down') + '">' +
            U.comma(r.finalValue) + '<small>元</small></div>' +
          '<div class="dv-s">投 ' + U.comma(r.invested) + ' → ' + U.fmt(r.dcaRet) + '</div>' +
        '</div>' +
        '<div class="dv-vs-sign">VS</div>' +
        '<div class="dv-item">' +
          '<div class="dv-t">第一天一次买完</div>' +
          '<div class="dv-money ' + (r.lumpRet >= 0 ? 'up' : 'down') + '">' +
            U.comma(r.lumpValue) + '<small>元</small></div>' +
          '<div class="dv-s">投 ' + U.comma(r.lumpInvested) + ' → ' + U.fmt(r.lumpRet) + '</div>' +
        '</div>' +
      '</div>' +

      /* 差额结论（用钱说话） */
      '<div class="dr-tag ' + (better ? 'win' : 'lose') + '">' +
        (better
          ? '这次定投多赚 <b>' + U.comma(diffMoney) + ' 元</b>（' +
            Math.abs(r.diff).toFixed(2) + ' 个百分点）'
          : '这次一次性买入多赚 <b>' + U.comma(diffMoney) + ' 元</b>（' +
            Math.abs(r.diff).toFixed(2) + ' 个百分点）') +
      '</div>' +

      /* 底部：用"涨了多少"来解释，不出现"相对价格/份额"这类术语 */
      '<div class="dr-foot">' +
        '你的平均买入价比第 1 期高 <b class="n up">' +
          ((r.avgCost / r.firstPrice - 1) * 100).toFixed(2) + '%</b>，' +
        '而期末价比第 1 期高 <b class="n ' + (r.lastPrice >= r.firstPrice ? 'up' : 'down') + '">' +
          ((r.lastPrice / r.firstPrice - 1) * 100).toFixed(2) + '%</b>' +
        '　—— 后者大于前者，就是这笔定投赚钱的原因。' +
      '</div>' +
    '</div>';
  }

  /* =========================================================
     逐期明细
     ========================================================= */
  function renderDetail(r) {
    var host = document.getElementById('dcaDetail');
    if (!host) return;
    if (!r) { host.innerHTML = '<div class="sim-empty">这只基金数据不足。</div>'; return; }

    /* 说明：不再展示"相对价格"和"份额"——
       因为本站只有归一化序列，算出来的份额是虚构单位，对新手毫无意义。
       改成"这一笔现在值多少、赚了多少"，这样每一行都能直接看懂。 */
    var h = '<div class="dca-tip">' +
      '每一行是<b>一期</b>：你投了多少钱 → 这一笔现在值多少 → 赚/亏了多少。' +
      '最后一行的「累计」才是整个定投的总账。' +
      '</div>' +
      '<table class="dca-t2"><thead><tr>' +
      '<th class="left">期</th>' +
      '<th class="left">买入日</th>' +
      '<th>投入</th>' +
      '<th>这一笔现在值</th>' +
      '<th>这一笔盈亏</th>' +
      '<th>买得贵不贵</th>' +
      '</tr></thead><tbody>';

    r.rows.forEach(function (x) {
      var vf = x.vsFirst;
      var vfTxt = x.i === 1 ? '<span class="mute">基准</span>'
        : '<span class="' + (vf > 0.01 ? 'up' : (vf < -0.01 ? 'down' : 'mute')) + '">' +
          (vf > 0 ? '贵 +' : '便宜 ') + vf.toFixed(2) + '%</span>';
      h += '<tr>' +
        '<td class="left">' + x.i + '</td>' +
        '<td class="left dca-date">' + x.date + '</td>' +
        '<td>' + U.comma(x.amt) + '</td>' +
        '<td class="' + (x.ownValue >= x.amt ? 'up' : 'down') + '">' +
          U.comma(x.ownValue) + '</td>' +
        '<td class="' + (x.ownPnl >= 0 ? 'up' : 'down') + '">' +
          (x.ownPnl >= 0 ? '+' : '') + U.comma(x.ownPnl) + '</td>' +
        '<td>' + vfTxt + '</td>' +
        '</tr>';
    });

    /* 合计行 */
    h += '<tr class="dca-sum">' +
      '<td class="left" colspan="2">累计（' + r.k + ' 期）</td>' +
      '<td>' + U.comma(r.invested) + '</td>' +
      '<td class="' + (r.finalValue >= r.invested ? 'up' : 'down') + '">' +
        U.comma(r.finalValue) + '</td>' +
      '<td class="' + (r.finalValue >= r.invested ? 'up' : 'down') + '">' +
        (r.finalValue >= r.invested ? '+' : '') + U.comma(r.finalValue - r.invested) + '</td>' +
      '<td>' + U.fmt(r.dcaRet) + '</td>' +
      '</tr>';

    host.innerHTML = h + '</tbody></table>';
  }

  /* =========================================================
     走势对比图
     ========================================================= */
  function renderChart(r) {
    var host = document.getElementById('dcaChart');
    if (!host || !C2 || !r) return;

    var dcaPct = r.dcaCurve.map(function (v) { return v / (r.invested || 1) * 100; });
    var lumpPct = r.lumpCurve.map(function (v) { return v / (r.lumpInvested || 1) * 100; });

    C2.line(host, {
      axis: axis,
      series: [
        { name: '按' + r.k + '次定投', short: '定投', data: dcaPct, color: '#3d8bfd', width: 2.4 },
        { name: '一次性买入', short: '一次性', data: lumpPct, color: '#f5b942', width: 2, dash: true }
      ],
      base: 100, height: 300,
      yFmt: function (v) { return v.toFixed(0) + '%'; },
      vFmt: function (v) { return v.toFixed(1) + '%'; },
      legendEl: document.getElementById('dcaLegend')
    });
  }

  /* =========================================================
     解读
     ========================================================= */
  function renderVerdict(r) {
    var host = document.getElementById('dcaVerdict');
    if (!host || !r) return;
    var better = r.diff > 0;
    var f = r.f;
    var diffMoney = Math.abs(r.finalValue - r.lumpValue);

    if (better) {
      host.className = 'note good';
      host.innerHTML = '<b>这次定投赢了，多赚 ' + U.comma(diffMoney) + ' 元。为什么？</b><br>' +
        '因为 ' + U.esc(f.name.slice(0, 14)) + ' 在这段时间里<b>先跌后涨</b>（或来回震荡）——' +
        '你在低位买到了更多份额，把平均成本摊到 <b class="n">' + U.fmtNum(r.avgCost, 4) +
        '</b>，低于期末相对价格 <b class="n">' + U.fmtNum(r.lastPrice, 4) + '</b>。<br>' +
        '<b style="color:#f5b942">这正是定投真正起作用的时候。</b>';
    } else {
      host.className = 'note warn';
      host.innerHTML = '<b>这次一次性买入赢了，多赚 ' + U.comma(diffMoney) + ' 元。</b><br>' +
        '因为 ' + U.esc(f.name.slice(0, 14)) + ' 在这段时间里<b>整体是上涨的</b>——' +
        '你后来投的那几笔买在了更高的价位（平均成本 <b class="n">' + U.fmtNum(r.avgCost, 4) +
        '</b>），所以整体收益被拉低了。<br>' +
        '<b style="color:#f5b942">这就是定投的代价：单边上涨时一定输给一次性买入。</b>' +
        '它换的是"跌的时候敢继续买"的心态，不是更高的收益。';
    }
  }

  /* =========================================================
     页面渲染
     ========================================================= */
  function render() {
    var r = calc();

    var html = '<div class="dca-form">';

    /* 选基金 */
    html += '<div class="df-row"><label>选择基金</label>' +
      '<select class="sim-select" id="dcaFund">' +
      F.map(function (f) {
        return '<option value="' + f.code + '"' +
          (f.code === state.code ? ' selected' : '') + '>' +
          f.code + ' ' + f.name.slice(0, 20) + '（' + U.fmt(f.ret250) + '）</option>';
      }).join('') + '</select></div>';

    /* 每期金额 */
    html += '<div class="df-row"><label>每期投多少</label>' +
      '<div class="df-inline">' +
        '<input type="number" class="stress-input" id="dcaAmt" value="' + state.amount +
          '" min="100" step="100" style="max-width:150px">' +
        '<span class="df-unit">元</span>' +
        '<span class="df-presets">' +
          [500, 1000, 2000, 5000].map(function (v) {
            return '<button class="df-pre' + (state.amount === v ? ' on' : '') +
              '" data-v="' + v + '">' + v + '</button>';
          }).join('') +
        '</span>' +
      '</div></div>';

    /* 频率 */
    html += '<div class="df-row"><label>多久投一次</label>' +
      '<div class="df-inline">' +
        '<span class="df-presets">' +
          FREQS.map(function (f) {
            return '<button class="df-pre' + (state.times === f.k ? ' on' : '') +
              '" data-t="' + f.k + '">' + f.name + '</button>';
          }).join('') +
        '</span>' +
        '<span class="df-hint">共 <b class="n">' + state.times + '</b> 次 · ' +
          '间隔约 <b class="n">' + stepDays(state.times, (getF(state.code) || {}).seq) +
          '</b> 天 · 总额 <b class="n">' +
          U.comma(state.amount * state.times) + '</b> 元</span>' +
      '</div></div>';

    html += '</div>';

    if (r) html += buildResultCard(r);

    box.innerHTML = html;

    /* ---- 绑定 ---- */
    var sel = document.getElementById('dcaFund');
    if (sel) sel.addEventListener('change', function () {
      state.code = sel.value;
      render();
    });

    var amt = document.getElementById('dcaAmt');
    if (amt) {
      amt.addEventListener('input', function () {
        var v = +amt.value;
        if (!isNaN(v) && v > 0) state.amount = v;
        refresh();
      });
    }

    Array.prototype.forEach.call(box.querySelectorAll('.df-pre'), function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('data-v')) state.amount = +b.getAttribute('data-v');
        if (b.getAttribute('data-t')) state.times = +b.getAttribute('data-t');
        render();
      });
    });

    renderDetail(r);
    renderChart(r);
    renderVerdict(r);
  }

  /* 改金额时只重画结果区，不重画表单（否则输入框会失焦） */
  function refresh() {
    var r = calc();
    if (!r) return;

    var old = box.querySelector('.dca-res');
    if (old && old.parentNode) {
      var wrap = document.createElement('div');
      wrap.innerHTML = buildResultCard(r);
      if (wrap.firstChild) old.parentNode.replaceChild(wrap.firstChild, old);
    }

    /* 同步"总额"提示 */
    var hint = box.querySelector('.df-hint');
    if (hint) {
      hint.innerHTML = '共 <b class="n">' + state.times + '</b> 次 · ' +
        '间隔约 <b class="n">' + r.stepDays + '</b> 天 · 总额 <b class="n">' +
        U.comma(state.amount * state.times) + '</b> 元';
    }

    renderDetail(r);
    renderVerdict(r);
  }

  render();
})();
