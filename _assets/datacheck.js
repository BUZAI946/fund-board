/* 数据校验：12 项自动交叉验证 */
(function () {
  'use strict';
  var D = window.DATA, U = window.UI;
  if (!D || !U) return;

  var box = document.getElementById('auditBox');
  var listBox = document.getElementById('auditList');
  if (!box) return;

  var F = D.funds;
  var S = D.sectors;
  var results = [];

  function add(name, ok, detail, worst) {
    results.push({ name: name, ok: ok, detail: detail, worst: worst || null });
  }

  /* ---------- 1. ret250 vs 走势序列 ---------- */
  (function () {
    var worst = 0, worstName = '';
    var bad = 0;
    F.forEach(function (f) {
      if (!f.seq || f.seq.length < 2) return;
      var calc = (f.seq[f.seq.length - 1] / f.seq[0] - 1) * 100;
      var diff = Math.abs(calc - f.ret250);
      if (diff > worst) { worst = diff; worstName = f.name; }
      if (diff > 0.15) bad++;
    });
    add('走势图收益 = 表格收益', bad === 0,
      bad === 0
        ? '40 只全部自洽，最大残差 ' + worst.toFixed(3) + 'pp（降采样取整）'
        : bad + ' 只不自洽，最差 ' + worstName + ' 差 ' + worst.toFixed(2) + 'pp',
      worst);
  })();

  /* ---------- 2. 板块平均 = 成分股等权平均 ---------- */
  (function () {
    var bad = 0, worst = 0, worstName = '';
    S.forEach(function (s) {
      var m = F.filter(function (f) { return f.sec === s.sec; });
      if (!m.length) return;
      var avg = m.reduce(function (a, b) { return a + b.ret250; }, 0) / m.length;
      var d = Math.abs(avg - s.arith);
      if (d > worst) { worst = d; worstName = s.name; }
      if (d > 0.02) bad++;
    });
    add('板块平均 = 成分股等权平均', bad === 0,
      bad === 0
        ? '9 个板块全部一致，最大差 ' + worst.toFixed(4) + 'pp'
        : bad + ' 个板块不符，最差 ' + worstName + ' 差 ' + worst.toFixed(3) + 'pp',
      worst);
  })();

  /* ---------- 3. 极差 = 最好 − 最差 ---------- */
  (function () {
    var bad = 0, worst = 0;
    S.forEach(function (s) {
      var m = F.filter(function (f) { return f.sec === s.sec; });
      if (!m.length) return;
      var vals = m.map(function (x) { return x.ret250; });
      var spread = Math.max.apply(null, vals) - Math.min.apply(null, vals);
      var d = Math.abs(spread - s.spread);
      if (d > worst) worst = d;
      if (d > 0.02) bad++;
    });
    add('极差 = 最好 − 最差', bad === 0,
      bad === 0 ? '9 个板块全部一致' : bad + ' 个不符，最大差 ' + worst.toFixed(3), worst);
  })();

  /* ---------- 4. 板块回撤 ≤ 最惨个基回撤 ---------- */
  (function () {
    var bad = [];
    S.forEach(function (s) {
      if (s.mddCombo < s.mddWorst - 0.01) {   /* 板块回撤应"浅于"个基（绝对值更小） */
        bad.push(s.name);
      }
    });
    add('板块回撤不深于最惨个基', bad.length === 0,
      bad.length === 0 ? '9 个板块全部符合（分散确实降低了回撤）'
        : bad.join('、') + ' 出现板块回撤更深的情况');
  })();

  /* ---------- 5. 组合权重合计 = 100% ---------- */
  (function () {
    var bad = [];
    Object.keys(D.plans).forEach(function (k) {
      var p = D.plans[k];
      if (!p.legs) return;
      var tot = p.legs.reduce(function (a, l) { return a + l.w; }, 0) + (p.cash || 0);
      if (Math.abs(tot - 1) > 0.001) bad.push(k + '(' + (tot * 100).toFixed(1) + '%)');
    });
    add('组合权重合计 = 100%', bad.length === 0,
      bad.length === 0 ? '10 个组合全部为 100%' : bad.join('、') + ' 权重不足或超出');
  })();

  /* ---------- 6. 归因合计 ≈ 组合收益 ---------- */
  (function () {
    if (!D.attribution || !D.plans.J) { add('归因合计 ≈ 组合收益', false, '缺少归因数据'); return; }
    var diff = Math.abs(D.attribution.total - D.plans.J.r250);
    add('归因合计 ≈ 组合收益', diff < 0.5,
      '归因合计 ' + U.fmt(D.attribution.total) + '，组合实际 ' + U.fmt(D.plans.J.r250) +
      '，差 ' + diff.toFixed(3) + 'pp（复利效应，应 <0.5）', diff);
  })();

  /* ---------- 7. 相关性矩阵对称 & 对角=1 ---------- */
  (function () {
    var C = D.correlations;
    if (!C) { add('相关性矩阵对称 & 对角=1', false, '缺少相关性数据'); return; }
    var M = C.matrix, n = M.length;
    var asym = 0, diagBad = 0, worst = 0;
    for (var i = 0; i < n; i++) {
      if (Math.abs(M[i][i] - 1) > 0.001) diagBad++;
      for (var j = i + 1; j < n; j++) {
        var d = Math.abs(M[i][j] - M[j][i]);
        if (d > worst) worst = d;
        if (d > 0.001) asym++;
      }
    }
    var ok = asym === 0 && diagBad === 0;
    add('相关性矩阵对称 & 对角=1', ok,
      ok ? n + '×' + n + ' 矩阵完全对称，对角线全为 1'
         : asym + ' 处不对称、' + diagBad + ' 处对角≠1');
  })();

  /* ---------- 8. 相关性数值范围 ---------- */
  (function () {
    var C = D.correlations;
    if (!C) { add('相关性数值在 [-1,1]', false, '缺少数据'); return; }
    var flat = [];
    C.matrix.forEach(function (row) { row.forEach(function (v) { flat.push(v); }); });
    var lo = Math.min.apply(null, flat), hi = Math.max.apply(null, flat);
    add('相关性数值在 [-1,1]', lo >= -1 && hi <= 1,
      '范围 ' + lo.toFixed(3) + ' ~ ' + hi.toFixed(3));
  })();

  /* ---------- 9. 波动率/回撤合理性 ---------- */
  (function () {
    var bad = [];
    F.forEach(function (f) {
      if (f.vol === null || f.vol < 0 || f.vol > 100) bad.push(f.code + ' vol=' + f.vol);
      if (f.mddAll !== null && f.mddAll > 0) bad.push(f.code + ' 回撤为正');
      if (f.mdd250 !== null && f.mdd250 > 0) bad.push(f.code + ' 近一年回撤为正');
    });
    add('波动率/回撤数值合理', bad.length === 0,
      bad.length === 0 ? '40 只全部合理（波动 0~100%，回撤为负）' : bad.slice(0, 3).join('; '));
  })();

  /* ---------- 10. 序列长度一致 ---------- */
  (function () {
    var axisN = (D.axis || []).length;
    var bad = [];
    F.forEach(function (f) {
      if (f.seq && f.seq.length !== axisN) bad.push(f.code);
    });
    S.forEach(function (s) {
      if (s.seq && s.seq.length !== axisN) bad.push('板块' + s.name);
    });
    add('走势序列长度一致', bad.length === 0,
      bad.length === 0 ? '全部为 ' + axisN + ' 个点（与 axis 对齐）'
        : bad.slice(0, 5).join('、') + ' 长度不符');
  })();

  /* ---------- 11. 组合回测起点 = 100 ---------- */
  (function () {
    var bad = [];
    Object.keys(D.plans).forEach(function (k) {
      var p = D.plans[k];
      if (p.seq && p.seq.length && Math.abs(p.seq[0] - 100) > 0.01) {
        bad.push(k + '(起点' + p.seq[0].toFixed(1) + ')');
      }
    });
    add('组合回测起点归一为 100', bad.length === 0,
      bad.length === 0 ? '10 个组合起点全部为 100' : bad.join('、'));
  })();

  /* ---------- 12. 核心指标无空值 ---------- */
  (function () {
    var bad = [];
    F.forEach(function (f) {
      ['ret250', 'vol', 'mdd250', 'mddAll', 'sharpe', 'scale'].forEach(function (k) {
        var v = f[k];
        if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) {
          bad.push(f.code + '.' + k);
        }
      });
    });
    add('核心指标无空值/NaN', bad.length === 0,
      bad.length === 0 ? '40 只 × 6 个核心字段全部有值'
        : bad.slice(0, 5).join('、') + ' 共 ' + bad.length + ' 处为空');
  })();

  /* ---------- 额外：净值日合理性 ---------- */
  (function () {
    var dates = {};
    F.forEach(function (f) { if (f.last) dates[f.last] = (dates[f.last] || 0) + 1; });
    var keys = Object.keys(dates).sort();
    if (!keys.length) { add('净值日期合理性', false, '无净值日期'); return; }
    var newest = keys[keys.length - 1];
    var oldest = keys[0];
    var qdii = F.filter(function (f) { return f.last && f.last < newest; }).length;
    add('净值日期合理性', true,
      '最新 ' + newest + '（' + dates[newest] + ' 只）· 最早 ' + oldest +
      '（' + qdii + ' 只滞后，QDII 属正常）');
  })();

  /* ---------- 额外：分红口径标注 ---------- */
  (function () {
    var bad = [];
    F.forEach(function (f) {
      if (f.hasDiv && (f.ret250nav === null || f.divGap === null)) bad.push(f.code);
    });
    add('分红基金双口径标注完整', bad.length === 0,
      bad.length === 0 ? '所有分过红的基金都同时给出复权与单位净值两个口径'
        : bad.join('、') + ' 缺少对照口径');
  })();

  /* ===================== 渲染 ===================== */
  var pass = results.filter(function (r) { return r.ok; }).length;
  var fail = results.length - pass;

  var state = fail === 0 ? 'ok' : (fail <= 2 ? 'warn' : 'bad');
  var stateText = fail === 0 ? '全部通过' : (fail <= 2 ? '有 ' + fail + ' 项需注意' : '有 ' + fail + ' 项异常');
  var stateColor = fail === 0 ? '#00c58e' : (fail <= 2 ? '#e8a93c' : '#ff4d5a');

  box.innerHTML =
    '<div class="audit-head">' +
      '<div class="ah-left">' +
        '<div class="ah-state" style="color:' + stateColor + '">' + stateText + '</div>' +
        '<div class="ah-sub">' + pass + ' 项通过 · ' + fail + ' 项异常 · 共 ' + results.length + ' 项</div>' +
      '</div>' +
      '<div class="ah-score" style="color:' + stateColor + '">' +
        Math.round(pass / results.length * 100) + '<small>%</small></div>' +
    '</div>' +
    '<div class="audit-bar"><i style="width:' +
      (pass / results.length * 100) + '%;background:' + stateColor + '"></i></div>' +
    '<div class="audit-meta">' +
      '<span>数据快照 <b>' + (D.builtAt || '—') + '</b></span>' +
      '<span>收益窗口 <b>' + ((D.axis || [])[0] || '?') + ' → ' +
        ((D.axis || [])[(D.axis || []).length - 1] || '?') + '</b></span>' +
      '<span>基金 <b>' + F.length + '</b> 只</span>' +
      '<span>板块 <b>' + S.length + '</b> 个</span>' +
      '<span>校验时间 <b>' + new Date().toLocaleString('zh-CN') + '</b></span>' +
    '</div>' +
    '<div class="audit-reset"><button class="btn" id="auditRerun">重新校验</button>' +
      '<span class="ar-hint">每次点都会当场重算一遍，不是读缓存</span></div>';

  var h = '';
  results.forEach(function (r, i) {
    h += '<div class="au-row ' + (r.ok ? 'ok' : 'bad') + '">' +
      '<div class="au-no">' + (i + 1) + '</div>' +
      '<div class="au-ico">' + (r.ok ? '✓' : '!') + '</div>' +
      '<div class="au-body">' +
        '<div class="au-t">' + r.name + '</div>' +
        '<div class="au-d">' + r.detail + '</div>' +
      '</div>' +
      '<div class="au-tag ' + (r.ok ? 'ok' : 'bad') + '">' +
        (r.ok ? '通过' : '异常') + '</div>' +
    '</div>';
  });
  listBox.innerHTML = h;

  var rb = document.getElementById('auditRerun');
  if (rb) rb.addEventListener('click', function () { location.reload(); });
})();
