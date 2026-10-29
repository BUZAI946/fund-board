/* ===========================================================
   任意对比（跨板块）
   支持选 2~4 只，不限板块。
   相关性用【板块级】数据近似（基金级相关性数据源未提供，界面会注明）
   =========================================================== */
(function () {
  'use strict';
  var D = window.DATA, U = window.UI, C2 = window.Chart2;
  if (!D || !U) return;

  var pickerHost = document.getElementById('cmpPicker');
  if (!pickerHost) return;

  var F = D.funds || [];
  var axis = D.axis || [];
  var CORR = D.correlations || null;

  var MAX = 4;
  var sel = [];          /* 选中的代码 */

  function getF(code) {
    for (var i = 0; i < F.length; i++) if (F[i].code === code) return F[i];
    return null;
  }

  /* 默认选三只，跨板块，代表三种风险等级 */
  (function initDefault() {
    var want = ['001512', '000051', '000217'];   /* 短债 / A股宽基 / 黄金 */
    want.forEach(function (c) { if (getF(c)) sel.push(c); });
  })();

  /* ---------------- 选择器 ---------------- */
  function renderPicker() {
    /* 按板块分组的下拉 */
    var bySec = {};
    F.forEach(function (f) {
      (bySec[f.secName] = bySec[f.secName] || []).push(f);
    });

    var opts = '<option value="">+ 添加一只基金（可跨板块）…</option>';
    Object.keys(bySec).sort().forEach(function (sec) {
      opts += '<optgroup label="' + U.esc(sec) + '">';
      bySec[sec].sort(function (a, b) { return b.ret250 - a.ret250; }).forEach(function (f) {
        var dis = sel.indexOf(f.code) >= 0;
        opts += '<option value="' + f.code + '"' + (dis ? ' disabled' : '') + '>' +
          f.code + ' ' + U.esc(f.name.slice(0, 18)) + '（' + U.fmt(f.ret250) + '）' +
          (dis ? ' 已选' : '') + '</option>';
      });
      opts += '</optgroup>';
    });

    var html = '<div class="cmp-pick-head">' +
      '<div class="cph-l"><b>已选 <span class="n">' + sel.length + '</span> / ' + MAX + ' 只</b>' +
      '<span class="cph-hint">最多 4 只，可以来自不同板块</span></div>' +
      '<div class="cph-r">' +
        '<select class="sim-select" id="cmpSelect" style="max-width:340px"' +
          (sel.length >= MAX ? ' disabled' : '') + '>' + opts + '</select>' +
        (sel.length ? '<button class="btn" id="cmpClear">清空</button>' : '') +
      '</div></div>';

    /* 已选卡片 */
    html += '<div class="cmp-cards">' +
      sel.map(function (code) {
        var f = getF(code);
        if (!f) return '';
        var tone = f.ret250 > 0 ? 'up' : 'down';
        return '<div class="cmp-card" data-code="' + code + '">' +
          '<button class="cmp-x" data-del="' + code + '" title="移除">×</button>' +
          '<div class="cc-name">' + U.esc(f.name.slice(0, 16)) + '</div>' +
          '<div class="cc-meta">' + f.code + ' · ' + U.esc(f.secName) + '</div>' +
          '<div class="cc-ret ' + tone + '">' + U.fmt(f.ret250) + '</div>' +
          '<div class="cc-kv">' +
            '<div><span>波动</span><b>' + f.vol.toFixed(1) + '%</b></div>' +
            '<div><span>全历史最深</span><b class="down">' + U.fmt(f.mddAll) + '</b></div>' +
          '</div>' +
          '</div>';
      }).join('') +
      (sel.length < MAX ? '<button class="cmp-add" id="cmpAddBtn">+ 再加一只</button>' : '') +
      '</div>';

    pickerHost.innerHTML = html;

    /* 绑定 */
    var s = document.getElementById('cmpSelect');
    if (s) s.addEventListener('change', function () {
      if (s.value && sel.length < MAX && sel.indexOf(s.value) < 0) {
        sel.push(s.value);
        renderAll();
      }
    });
    var c = document.getElementById('cmpClear');
    if (c) c.addEventListener('click', function () { sel = []; renderAll(); });
    var ab = document.getElementById('cmpAddBtn');
    if (ab) ab.addEventListener('click', function () {
      var s2 = document.getElementById('cmpSelect');
      if (s2) s2.focus();
    });
    Array.prototype.forEach.call(pickerHost.querySelectorAll('[data-del]'), function (b) {
      b.addEventListener('click', function () {
        var code = b.getAttribute('data-del');
        sel = sel.filter(function (x) { return x !== code; });
        renderAll();
      });
    });
  }

  /* ---------------- 并排对比表 ---------------- */
  function renderTable() {
    var host = document.getElementById('cmpTable');
    var box = document.getElementById('cmpResultBox');
    if (!host) return;
    if (sel.length < 2) {
      if (box) box.style.display = 'none';
      return;
    }
    if (box) box.style.display = '';

    var fs = sel.map(getF).filter(Boolean);
    if (fs.length < 2) return;

    /* 每个指标：{label, get, better: 'high'|'low'|null, fmt} */
    var ROWS = [
      { l: '近一年收益', get: function (f) { return f.ret250; }, better: 'high',
        fmt: function (v) { return U.fmt(v); }, cls: function (v) { return v > 0 ? 'up' : 'down'; } },
      { l: '波动率', get: function (f) { return f.vol; }, better: 'low',
        fmt: function (v) { return v.toFixed(2) + '%'; } },
      { l: '近一年最深回撤', get: function (f) { return f.mdd250; }, better: 'high',
        fmt: function (v) { return U.fmt(v); }, cls: function () { return 'up'; } },
      { l: '全历史最深回撤', get: function (f) { return f.mddAll; }, better: 'high',
        fmt: function (v) { return U.fmt(v); }, cls: function () { return 'up'; } },
      { l: '1 万最坏剩', get: function (f) { return U.worstLeft(f.mddAll); }, better: 'high',
        fmt: function (v) { return U.comma(v) + ' 元'; } },
      { l: '夏普比率', get: function (f) { return f.sharpe; }, better: 'high',
        fmt: function (v) { return U.fmtNum(v, 2); },
        cls: function (v) { return v > 0 ? 'up' : 'down'; } },
      { l: '卡玛比率', get: function (f) { return f.calmar; }, better: 'high',
        fmt: function (v) { return U.fmtNum(v, 2); } },
      { l: '持有 250 天胜率', get: function (f) { return f.hold250; }, better: 'high',
        fmt: function (v) { return v === null ? '—' : U.fmtNum(v, 1) + '%'; } },
      { l: '基金规模', get: function (f) { return f.scale; }, better: null,
        fmt: function (v) { return v === null ? '—' : U.fmtNum(v, 1) + ' 亿'; } },
      { l: '申购费率', get: function (f) { return f.rate; }, better: 'low',
        fmt: function (v) { return v === null ? '场内佣金' : U.fmtNum(v, 2) + '%'; } },
      { l: '机构四期变化', get: function (f) { return f.instDelta; }, better: null,
        fmt: function (v) {
          if (v === null) return '—';
          return (v > 0 ? '+' : '') + U.fmtNum(v, 1) + 'pp';
        },
        cls: function (v) { return v > 0 ? 'up' : 'down'; } },
      { l: '分过红', get: function (f) { return f.hasDiv ? 1 : 0; }, better: null,
        fmt: function (v) { return v ? '是（口径有偏差）' : '否'; } }
    ];

    var h = '<thead><tr><th class="left">指标</th>' +
      fs.map(function (f) {
        return '<th><a class="fund-link" href="基金详情/' + f.code + '.html">' +
          U.esc(f.name.slice(0, 14)) + '</a>' +
          '<div class="cmp-th-sub">' + f.code + ' · ' + U.esc(f.secName) + '</div></th>';
      }).join('') + '</tr></thead><tbody>';

    ROWS.forEach(function (r) {
      var vals = fs.map(r.get);
      /* 找最优 */
      var bestIdx = -1;
      if (r.better) {
        var valid = vals.map(function (v, i) { return { v: v, i: i }; })
          .filter(function (x) { return x.v !== null && x.v !== undefined; });
        if (valid.length > 1) {
          valid.sort(function (a, b) {
            return r.better === 'high' ? b.v - a.v : a.v - b.v;
          });
          /* 只有确实不同才标 */
          if (valid[0].v !== valid[1].v) bestIdx = valid[0].i;
        }
      }

      h += '<tr><td class="left cmp-row-lbl">' + r.l + '</td>' +
        vals.map(function (v, i) {
          var cls = r.cls ? r.cls(v) : '';
          var isBest = i === bestIdx ? ' cmp-best' : '';
          return '<td class="' + cls + isBest + '">' + r.fmt(v) + '</td>';
        }).join('') + '</tr>';
    });

    /* 板块信息行 */
    h += '<tr><td class="left cmp-row-lbl">所属板块</td>' +
      fs.map(function (f) {
        return '<td><a class="fund-link" href="板块/' + U.esc(f.secName) + '.html" ' +
          'style="font-size:11.5px">' + U.esc(f.secName) + '</a></td>';
      }).join('') + '</tr>';

    host.innerHTML = h + '</tbody>';

    renderCorr(fs);
    renderChart(fs);
  }

  /* ---------------- 相关性 ---------------- */
  function renderCorr(fs) {
    var host = document.getElementById('cmpCorr');
    var box = document.getElementById('cmpCorrBox');
    if (!host) return;

    if (!CORR || fs.length < 2) {
      if (box) box.style.display = 'none';
      return;
    }
    if (box) box.style.display = '';

    /* 用板块相关性近似 */
    var secs = CORR.secs, names = CORR.names, M = CORR.matrix;
    var pairs = [];
    for (var i = 0; i < fs.length; i++) {
      for (var j = i + 1; j < fs.length; j++) {
        var a = fs[i], b = fs[j];
        var ia = secs.indexOf(a.sec), ib = secs.indexOf(b.sec);
        var v = (ia >= 0 && ib >= 0) ? M[ia][ib] : null;
        pairs.push({ a: a, b: b, v: v });
      }
    }

    var html = '<div class="corr-note">' +
      '<b>⚠️ 这里是板块级相关性，不是基金级。</b>' +
      '数据源只提供了板块之间的相关性，所以同一板块的两只基金，这里显示的是 1.00。' +
      '<b style="color:#e8eef8">判断"要不要都买"看数值大小就够了。</b>' +
      '</div>';

    html += '<div class="corr-pairs">' +
      pairs.map(function (p) {
        var v = p.v;
        if (v === null) {
          return '<div class="corr-pair"><span class="cp-names">' +
            U.esc(p.a.name.slice(0, 10)) + ' × ' + U.esc(p.b.name.slice(0, 10)) +
            '</span><b class="cp-val mute">—</b></div>';
        }
        var lvl, desc, col;
        if (v <= -0.05) { lvl = '负相关'; desc = '能互相抵消，分散效果最好'; col = '#00c58e'; }
        else if (v < 0.2) { lvl = '基本无关'; desc = '分散有效'; col = '#4ecfa4'; }
        else if (v < 0.5) { lvl = '弱相关'; desc = '分散还有用'; col = '#e8a93c'; }
        else if (v < 0.75) { lvl = '中高相关'; desc = '分散效果打折'; col = '#ff8a5c'; }
        else { lvl = '高度同涨同跌'; desc = '两个都买等于押一次'; col = '#ff4d5e'; }

        return '<div class="corr-pair">' +
          '<div class="cp-top">' +
            '<span class="cp-names">' + U.esc(p.a.name.slice(0, 10)) +
              ' <span class="cp-x">×</span> ' + U.esc(p.b.name.slice(0, 10)) + '</span>' +
            '<b class="cp-val" style="color:' + col + '">' + v.toFixed(2) + '</b>' +
          '</div>' +
          '<div class="cp-bar"><i style="width:' + Math.max(2, Math.abs(v) * 100) +
            '%;background:' + col + '"></i></div>' +
          '<div class="cp-desc">' + lvl + ' · ' + desc + '</div>' +
          '</div>';
      }).join('') +
      '</div>';

    /* 结论 */
    var highPairs = pairs.filter(function (p) { return p.v !== null && p.v >= 0.75; });
    if (highPairs.length) {
      html += '<div class="note warn" style="margin-top:16px;margin-bottom:0">' +
        '<b>⚠️ 有 ' + highPairs.length + ' 对高度同涨同跌（≥0.75）。</b><br>' +
        highPairs.map(function (p) {
          return '· ' + U.esc(p.a.name.slice(0, 12)) + ' 和 ' + U.esc(p.b.name.slice(0, 12)) +
            '<b>（' + p.v.toFixed(2) + '）</b>';
        }).join('<br>') +
        '<br><b style="color:#f5b942">这两只都买，等于把同一笔钱押了两次。选一只就够。</b>' +
        '</div>';
    } else if (pairs.length && pairs.every(function (p) { return p.v === null || p.v < 0.5; })) {
      html += '<div class="note good" style="margin-top:16px;margin-bottom:0">' +
        '<b>✅ 这几只之间的相关性都不高，一起配确实有分散效果。</b>' +
        '<b style="color:#e8eef8">这才是"不要把鸡蛋放一个篮子"的正确做法——看的是相关性，不是数量。</b>' +
        '</div>';
    }

    host.innerHTML = html;
  }

  /* ---------------- 走势图 ---------------- */
  function renderChart(fs) {
    var host = document.getElementById('cmpChart');
    var box = document.getElementById('cmpChartBox');
    if (!host || !C2) return;
    if (fs.length < 2) { if (box) box.style.display = 'none'; return; }
    if (box) box.style.display = '';

    var COLORS = ['#3d8bfd', '#ff8a5c', '#f5b942', '#a78bfa'];
    var series = fs.map(function (f, i) {
      return {
        name: f.name, short: f.name.slice(0, 8),
        data: f.seq, color: COLORS[i % COLORS.length],
        width: 2.4, dash: i > 1
      };
    });

    C2.line(host, {
      axis: axis, series: series, base: 100, height: 320,
      legendEl: document.getElementById('cmpLegend')
    });
  }

  function renderAll() {
    renderPicker();
    renderTable();
  }

  renderAll();
})();
