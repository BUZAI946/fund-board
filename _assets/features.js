/* ===========================================================
   高级功能模块（①-⑨）
   每个模块独立检测容器，容器不存在就跳过 —— 同一份文件可全站复用
   依赖：data.js → chart.js → anim.js
   =========================================================== */
(function () {
  'use strict';
  var D = window.DATA, U = window.UI, C2 = window.Chart2;
  if (!D || !U) return;

  var F = D.funds;
  var S = D.sectors;
  function $(id) { return document.getElementById(id); }
  function tone(v) { return v > 0.0001 ? 'up' : (v < -0.0001 ? 'down' : 'mute'); }

  /* =========================================================
     ① 板块相关性矩阵
     ========================================================= */
  (function () {
    var host = $('corrMatrix');
    if (!host || !D.correlations) return;
    var C = D.correlations;
    var names = C.names, M = C.matrix, n = names.length;

    /* 每个格子：相关系数 → 颜色
       正相关（同涨同跌）→ 偏红；负相关（对冲）→ 偏绿；接近 0 → 灰
       对角线自己跟自己 = 1，用暗色弱化 */
    function cellColor(v, isDiag) {
      if (isDiag) return { bg: 'rgba(255,255,255,.05)', fg: '#657a99' };
      var a = Math.abs(v);
      if (v > 0.05) {
        var alpha = 0.06 + a * 0.5;
        return { bg: 'rgba(255,77,94,' + alpha.toFixed(3) + ')', fg: a > 0.55 ? '#fff' : '#ffb3bb' };
      }
      if (v < -0.05) {
        var alpha2 = 0.06 + a * 0.9;
        return { bg: 'rgba(0,197,142,' + alpha2.toFixed(3) + ')', fg: '#8ff0cc' };
      }
      return { bg: 'rgba(255,255,255,.035)', fg: '#7b8fb0' };
    }

    var html = '<div class="corr-wrap"><table class="corr-tbl"><thead><tr><th></th>';
    names.forEach(function (nm) { html += '<th>' + nm + '</th>'; });
    html += '</tr></thead><tbody>';

    for (var i = 0; i < n; i++) {
      html += '<tr><th class="corr-rowh">' + names[i] + '</th>';
      for (var j = 0; j < n; j++) {
        var v = M[i][j], col = cellColor(v, i === j);
        var isDiag = i === j;
        html += '<td class="corr-cell' + (isDiag ? ' diag' : '') + '"' +
          ' style="background:' + col.bg + ';color:' + col.fg + '"' +
          (isDiag ? '' : ' data-a="' + names[i] + '" data-b="' + names[j] + '" data-v="' + v + '"') +
          '>' + (isDiag ? '—' : v.toFixed(2).replace('0.', '.')) + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    host.innerHTML = html;

    /* 点格子给解读 */
    var tip = $('corrTip');
    Array.prototype.forEach.call(host.querySelectorAll('.corr-cell[data-v]'), function (td) {
      td.addEventListener('click', function () {
        var a = td.getAttribute('data-a'), b = td.getAttribute('data-b'), v = +td.getAttribute('data-v');
        Array.prototype.forEach.call(host.querySelectorAll('.corr-cell'), function (x) {
          x.classList.remove('sel');
        });
        td.classList.add('sel');
        if (!tip) return;
        var msg, cls;
        if (v > 0.7) {
          msg = '<b>' + a + '</b> 和 <b>' + b + '</b> 相关性 <b class="n up">' + v.toFixed(2) +
            '</b> —— <b style="color:#ff8a5c">几乎是一回事</b>。两个都买，等于把同一笔钱押了两次，"分散"在这里是假的。';
          cls = 'danger';
        } else if (v > 0.4) {
          msg = '<b>' + a + '</b> 和 <b>' + b + '</b> 相关性 <b class="n">' + v.toFixed(2) +
            '</b> —— 有一定同涨同跌倾向，分散效果<b>打折</b>。';
          cls = 'warn';
        } else if (v < -0.1) {
          msg = '<b>' + a + '</b> 和 <b>' + b + '</b> 相关性 <b class="n down">' + v.toFixed(2) +
            '</b> —— <b style="color:#00c58e">负相关</b>，一个跌另一个可能涨。' +
            '<b>这才是真正的分散</b>，你的组合波动会被显著压低。';
          cls = 'good';
        } else {
          msg = '<b>' + a + '</b> 和 <b>' + b + '</b> 相关性 <b class="n">' + v.toFixed(2) +
            '</b> —— 基本互不相干，<b>分散有效</b>。';
          cls = 'good';
        }
        tip.innerHTML = msg;
        tip.className = 'note ' + cls;
        tip.style.display = 'block';
      });
    });
  })();

  /* =========================================================
     ② 定投 vs 一次性买入
     ========================================================= */
  (function () {
    var host = $('dcaBox');
    if (!host) return;
    var axis = D.axis;                 /* 64 个降采样日期 */
    var N = axis.length;
    var CAP = 60000;                   /* 总资金 6 万 */

    /* 用板块序列模拟：定投 = 每月固定金额买入，一次性 = 第一天全买 */
    var SECS = S.filter(function (s) { return s.seq && s.seq.length === N; });

    function simulate(seq, monthly) {
      /* 一次性 */
      var lumpShares = 1 / seq[0];
      var lumpEnd = lumpShares * seq[N - 1];

      /* 定投：把总资金平均分成 k 份，每 N/k 个点投一份 */
      var k = monthly;
      var step = Math.floor(N / k);
      var dcaShares = 0, invested = 0;
      for (var i = 0; i < k; i++) {
        var idx = Math.min(N - 1, i * step);
        var amt = 1 / k;
        dcaShares += amt / seq[idx];
        invested += amt;
      }
      var dcaEnd = dcaShares * seq[N - 1];

      return {
        lump: (lumpEnd - 1) * 100,
        dca: (dcaEnd / invested - 1) * 100
      };
    }

    var rows = SECS.map(function (s) {
      var r = simulate(s.seq, 12);      /* 分 12 个月定投 */
      return { name: s.name, lump: r.lump, dca: r.dca, diff: r.dca - r.lump, sec: s.sec };
    }).sort(function (a, b) { return b.diff - a.diff; });

    var dcaWin = rows.filter(function (x) { return x.diff > 0; }).length;

    var html = '<div class="dca-summary">' +
      '<div class="dca-stat"><span>定投更划算的板块</span>' +
      '<b class="n hl">' + dcaWin + ' / ' + rows.length + '</b></div>' +
      '<div class="dca-stat"><span>测的周期</span>' +
      '<b class="n">' + axis[0] + ' → ' + axis[N - 1] + '</b></div>' +
      '<div class="dca-stat"><span>定投方式</span>' +
      '<b>分 12 个月平均买入</b></div>' +
      '</div>';

    html += '<div class="dca-tbl-wrap"><table class="dca-tbl"><thead><tr>' +
      '<th class="left">板块</th><th>一次性买入</th><th>分12月定投</th><th>定投优势</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      var better = r.diff > 0;
      html += '<tr>' +
        '<td class="left tname">' + r.name + '</td>' +
        '<td class="' + tone(r.lump) + '">' + U.fmt(r.lump) + '</td>' +
        '<td class="' + tone(r.dca) + '">' + U.fmt(r.dca) + '</td>' +
        '<td><b class="' + (better ? 'down' : 'up') + '">' +
        (better ? '+' : '') + r.diff.toFixed(2) + 'pp</b>' +
        '<span class="dca-tag ' + (better ? 'win' : 'lose') + '">' +
        (better ? '定投胜' : '一次性胜') + '</span></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    host.innerHTML = html;
  })();

  /* =========================================================
     ③ 收益归因瀑布图（组合 J 每条腿贡献多少）
     ========================================================= */
  (function () {
    var host = $('attrChart');
    if (!host || !D.attribution) return;
    var A = D.attribution;

    var W = 1200, H = 380;
    var ml = 60, mr = 24, mt = 30, mb = 76;
    var iw = W - ml - mr, ih = H - mt - mb;
    var legs = A.legs;
    var total = A.total;

    /* 累计起点 0，最后一根是总计 */
    var bars = [], run = 0;
    legs.forEach(function (l) {
      bars.push({ label: l.name.slice(0, 10), sub: l.w + '%', from: run, to: run + l.contrib, v: l.contrib, kind: 'part' });
      run += l.contrib;
    });
    bars.push({ label: '组合合计', sub: '', from: 0, to: total, v: total, kind: 'total' });

    var maxV = Math.max.apply(null, bars.map(function (b) { return Math.max(Math.abs(b.from), Math.abs(b.to)); }));
    var pad = maxV * 0.18;
    var lo = Math.min(0, -pad), hi = maxV + pad;
    var X = function (i) { return ml + (iw / bars.length) * (i + 0.5); };
    var bw = Math.min(88, iw / bars.length * 0.56);
    var Y = function (v) { return mt + ih * (1 - (v - lo) / (hi - lo)); };

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    function mk(tag, attrs) {
      var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
      return e;
    }

    /* 网格 */
    for (var g = 0; g <= 4; g++) {
      var v = lo + (hi - lo) * g / 4, y = Y(v);
      svg.appendChild(mk('line', { x1: ml, y1: y, x2: W - mr, y2: y, stroke: '#1a2740', 'stroke-width': 1, 'stroke-dasharray': '2 6' }));
      var t = mk('text', { x: ml - 10, y: y + 4, fill: '#7b8fb0', 'font-size': 10.5, 'text-anchor': 'end', 'font-family': 'ui-monospace,monospace', 'font-weight': 600 });
      t.textContent = (v > 0 ? '+' : '') + v.toFixed(1) + 'pp';
      svg.appendChild(t);
    }
    /* 零线 */
    svg.appendChild(mk('line', { x1: ml, y1: Y(0), x2: W - mr, y2: Y(0), stroke: '#465a78', 'stroke-width': 1.5 }));

    /* 柱 */
    bars.forEach(function (b, i) {
      var x = X(i) - bw / 2;
      var y1 = Y(b.from), y2 = Y(b.to);
      var top = Math.min(y1, y2), h = Math.max(3, Math.abs(y2 - y1));
      var col = b.kind === 'total' ? '#f5b942' : (b.v >= 0 ? '#ff4d5e' : '#00c58e');

      var rect = mk('rect', {
        x: x, y: Y(0), width: bw, height: 0, rx: 3,
        fill: col, opacity: b.kind === 'total' ? 0.95 : 0.85
      });
      svg.appendChild(rect);
      /* 动画：从零线长出来 */
      setTimeout(function () {
        rect.style.transition = 'y .7s cubic-bezier(.2,.8,.2,1),height .7s cubic-bezier(.2,.8,.2,1)';
        rect.setAttribute('y', top);
        rect.setAttribute('height', h);
      }, 100 + i * 80);

      /* 连接虚线（瀑布感） */
      if (i < bars.length - 1 && b.kind !== 'total') {
        svg.appendChild(mk('line', {
          x1: x + bw, y1: Y(b.to), x2: X(i + 1) - bw / 2, y2: Y(b.to),
          stroke: '#3d4a63', 'stroke-width': 1, 'stroke-dasharray': '3 3'
        }));
      }

      /* 数值标签 */
      var vt = mk('text', {
        x: X(i), y: top - 8, fill: col, 'font-size': 11.5, 'text-anchor': 'middle',
        'font-weight': 700, 'font-family': 'ui-monospace,Menlo,monospace', opacity: 0
      });
      vt.textContent = (b.v > 0 ? '+' : '') + b.v.toFixed(2) + 'pp';
      svg.appendChild(vt);
      setTimeout(function () { vt.setAttribute('opacity', 1); }, 500 + i * 80);

      /* 底部标签（两行） */
      var lt = mk('text', { x: X(i), y: mt + ih + 20, fill: '#96a8c2', 'font-size': 11, 'text-anchor': 'middle', 'font-family': '"PingFang SC","Microsoft YaHei",sans-serif' });
      lt.textContent = b.label;
      svg.appendChild(lt);
      if (b.sub) {
        var st = mk('text', { x: X(i), y: mt + ih + 35, fill: '#657a99', 'font-size': 10, 'text-anchor': 'middle', 'font-family': 'ui-monospace,monospace' });
        st.textContent = '权重 ' + b.sub;
        svg.appendChild(st);
      }
    });

    host.appendChild(svg);

    /* 结论：找最大贡献和最大拖累 */
    var parts = legs.slice();
    parts.sort(function (a, b) { return b.contrib - a.contrib; });
    var top = parts[0], bottom = parts[parts.length - 1];
    var sum = D.attribution.total;

    var conc = $('attrNote');
    if (conc) {
      conc.innerHTML = '<b>这张图回答一个问题：这 ' + U.fmt(sum) + ' 是谁赚来的？</b><br>' +
        '· 贡献最大：<b>' + top.name.slice(0, 16) + '</b> 贡献 <b class="n up">+' +
        top.contrib.toFixed(2) + 'pp</b>（权重 ' + top.w + '% × 自身 ' + U.fmt(top.ret) + '）<br>' +
        '· 贡献最小：<b>' + bottom.name.slice(0, 16) + '</b> 贡献 <b class="n">' +
        (bottom.contrib > 0 ? '+' : '') + bottom.contrib.toFixed(2) + 'pp</b><br><br>' +
        '<b style="color:#f5b942">注意：20% 现金只贡献了 ' +
        (legs[legs.length - 1].contrib > 0 ? '+' : '') + legs[legs.length - 1].contrib.toFixed(2) +
        'pp，但它是你唯一的"子弹"。</b>收益归因只告诉你钱从哪来，不告诉你该不该留现金。';
    }

    /* 口径说明 */
    var cal = $('attrCaliber');
    if (cal) {
      cal.innerHTML = '<b>⚠️ 口径说明：</b>各腿贡献相加 = <b class="n">' + U.fmt(sum) +
        '</b>，而组合实际回测是 <b class="n">+3.87%</b>，差 <b class="n">' +
        Math.abs(sum - 3.87).toFixed(2) + 'pp</b>。<br>' +
        '原因是<b>复利效应</b>——加权平均收益 ≠ 组合实际收益（后者要连乘）。两者都真实，' +
        '归因图用来看"谁贡献大"，组合收益用前面回测表里的数。';
    }
  })();

  /* =========================================================
     ④ 持仓模拟器（自选配比实时计算）
     ========================================================= */
  (function () {
    var host = $('simBox');
    if (!host) return;

    var PRESETS = [
      { n: '建议组合 J', w: { '001512': 25, '000015': 20, '003376': 15, '050025': 20, cash: 20 } },
      { n: '全债券', w: { '001512': 40, '000015': 30, '003376': 30 } },
      { n: '九板块均配', w: { '000217': 11, '161226': 11, '501018': 11, '004432': 11, '006479': 11, '000071': 11, '000051': 11, '001594': 11, '110017': 12 } },
      { n: '激进（股8债2）', w: { '000051': 40, '006479': 20, '008888': 20, '001512': 20 } }
    ];

    var CASH_Y = D.cash && D.cash.length ? D.cash[0].yield7 : 0.9;
    var state = {};
    Object.keys(PRESETS[0].w).forEach(function (k) { state[k] = PRESETS[0].w[k]; });

    function fundOf(code) {
      for (var i = 0; i < F.length; i++) if (F[i].code === code) return F[i];
      return null;
    }

    /* ========================= 计算 ========================= */
    function calc() {
      var keys = Object.keys(state).filter(function (k) { return state[k] > 0; });
      var wsum = keys.reduce(function (a, k) { return a + state[k]; }, 0);
      if (!wsum) return null;

      var ret = 0, vol2 = 0, worstMdd = 0, rows = [];
      keys.forEach(function (k) {
        var w = state[k] / wsum;
        if (k === 'cash') {
          ret += w * CASH_Y;
          rows.push({ code: k, name: '现金', w: w, ret: CASH_Y, vol: 0, mdd: 0 });
        } else {
          var f = fundOf(k);
          if (!f) return;
          ret += w * f.ret250;
          vol2 += Math.pow(w * f.vol, 2);
          worstMdd += w * Math.abs(f.mddAll);
          rows.push({ code: k, name: f.name, w: w, ret: f.ret250, vol: f.vol, mdd: f.mddAll });
        }
      });
      return { ret: ret, vol: Math.sqrt(vol2), mddSum: worstMdd, rows: rows, wsum: wsum };
    }

    /* ========================= 结构渲染（只画一次） ========================= */
    function renderShell() {
      var html = '<div class="sim-presets">';
      PRESETS.forEach(function (p, i) {
        html += '<button class="btn sim-pre" data-i="' + i + '">' + p.n + '</button>';
      });
      html += '<button class="btn sim-pre" id="simEven">权重均分</button>' +
              '<button class="btn sim-pre" id="simClear">清空</button></div>';

      html += '<div class="sim-add-wrap"><select class="sim-select" id="simSelect">' +
        '<option value="">+ 添加一只基金或现金…</option>' +
        '<option value="cash">现金（货币基金 ' + CASH_Y + '%）</option>';
      F.forEach(function (f) {
        html += '<option value="' + f.code + '">' + f.code + ' ' + f.name.slice(0, 18) + '</option>';
      });
      html += '</select></div>';

      html += '<div id="simListWrap"></div>' +
              '<div id="simResultWrap"></div>' +
              '<div id="simHintWrap"></div>';

      host.innerHTML = html;
      bindStatic();
      renderList();
      renderResult();
    }

    /* ========================= 列表（增删才重建） ========================= */
    function renderList() {
      var wrap = document.getElementById('simListWrap');
      if (!wrap) return;
      var keys = Object.keys(state);

      if (!keys.length) {
        wrap.innerHTML = '<div class="sim-empty">还没有选择任何标的。' +
          '点上面的「建议组合 J」试试，或用下拉框添加。</div>';
        return;
      }

      var h = '<div class="sim-sum-bar">' +
        '<span>合计 <b class="n" id="simSumVal">0</b>%</span>' +
        '<span class="ssb-note" id="simSumNote"></span>' +
        '<button class="ssb-bal" id="simBalance" title="按当前比例缩放到 100%">' +
          '一键配平到 100%</button>' +
        '</div>';

      h += '<div class="sim-list">';
      keys.forEach(function (k) {
        var nm = k === 'cash' ? '现金' : (fundOf(k) ? fundOf(k).name : k);
        var codeTxt = k === 'cash' ? 'CASH' : k;
        h += '<div class="sim-item" data-row="' + k + '">' +
          '<div class="sim-item-name">' + U.esc(nm) +
            ' <span class="tcode">' + codeTxt + '</span></div>' +
          '<input type="range" class="sim-range" data-k="' + k + '" ' +
            'min="0" max="100" step="1" value="' + state[k] + '">' +
          '<div class="sim-item-w">' +
            '<input type="number" class="sim-num" data-k="' + k + '" ' +
              'min="0" max="100" step="1" value="' + state[k] + '">' +
            '<span>%</span>' +
          '</div>' +
          '<button class="sim-del" data-k="' + k + '" title="移除">×</button>' +
          '</div>';
      });
      h += '</div>';
      wrap.innerHTML = h;

      /* --- 绑定：拖动只更新数字，不重建 DOM --- */
      Array.prototype.forEach.call(wrap.querySelectorAll('.sim-range'), function (rg) {
        rg.addEventListener('input', function () {
          var k = rg.getAttribute('data-k');
          state[k] = +rg.value;
          syncRow(k);          /* 只同步同一行的数字框 */
          updateSum();         /* 只更新合计 */
          renderResult();      /* 只更新结果区 */
        });
      });

      /* --- 绑定：数字输入，回车或失焦生效，滑块同步 --- */
      Array.prototype.forEach.call(wrap.querySelectorAll('.sim-num'), function (num) {
        function apply() {
          var k = num.getAttribute('data-k');
          var v = parseFloat(num.value);
          if (isNaN(v)) v = 0;
          v = Math.max(0, Math.min(100, Math.round(v)));
          state[k] = v;
          num.value = v;
          var rg = wrap.querySelector('.sim-range[data-k="' + k + '"]');
          if (rg) rg.value = v;
          updateSum();
          renderResult();
        }
        num.addEventListener('input', function () {
          /* 边输边更新（但允许中间态为空） */
          var k = num.getAttribute('data-k');
          var raw = num.value;
          if (raw === '' || raw === '-') return;
          var v = parseFloat(raw);
          if (isNaN(v)) return;
          v = Math.max(0, Math.min(100, Math.round(v)));
          state[k] = v;
          var rg = wrap.querySelector('.sim-range[data-k="' + k + '"]');
          if (rg) rg.value = v;
          updateSum();
          renderResult();
        });
        num.addEventListener('blur', apply);
        num.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { apply(); num.blur(); }
          if (e.key === 'ArrowUp') { e.preventDefault(); num.value = Math.min(100, (+num.value || 0) + 1); apply(); }
          if (e.key === 'ArrowDown') { e.preventDefault(); num.value = Math.max(0, (+num.value || 0) - 1); apply(); }
        });
      });

      /* --- 删除 --- */
      Array.prototype.forEach.call(wrap.querySelectorAll('.sim-del'), function (b) {
        b.addEventListener('click', function () {
          delete state[b.getAttribute('data-k')];
          renderList();
          renderResult();
        });
      });

      /* --- 一键配平 --- */
      var bal = document.getElementById('simBalance');
      if (bal) bal.addEventListener('click', function () {
        var ks = Object.keys(state).filter(function (k) { return state[k] > 0; });
        var sum = ks.reduce(function (a, k) { return a + state[k]; }, 0);
        if (!sum) return;
        /* 按比例缩放成整数，余数补给最大的一项 */
        var scaled = {}, acc = 0;
        ks.forEach(function (k) { scaled[k] = Math.round(state[k] / sum * 100); acc += scaled[k]; });
        var diff = 100 - acc;
        if (diff !== 0) {
          var biggest = ks.slice().sort(function (a, b) { return scaled[b] - scaled[a]; })[0];
          scaled[biggest] += diff;
        }
        state = scaled;
        renderList();
        renderResult();
      });

      updateSum();
    }

    /* 只同步一行的数字框（拖动时用） */
    function syncRow(k) {
      var num = host.querySelector('.sim-num[data-k="' + k + '"]');
      if (num) num.value = state[k];
    }

    /* 只更新合计条 */
    function updateSum() {
      var el = document.getElementById('simSumVal');
      var note = document.getElementById('simSumNote');
      if (!el) return;
      var keys = Object.keys(state);
      var sum = keys.reduce(function (a, k) { return a + state[k]; }, 0);
      el.textContent = sum;
      el.className = 'n' + (sum === 100 ? '' : (sum > 100 ? ' up' : ' down'));
      if (note) {
        if (sum === 100) {
          note.textContent = '✓ 正好 100%';
          note.className = 'ssb-note ok';
        } else if (sum > 100) {
          note.textContent = '超出 ' + (sum - 100) + '%，计算时按比例归一化';
          note.className = 'ssb-note warn';
        } else {
          note.textContent = '还差 ' + (100 - sum) + '%，计算时按比例归一化';
          note.className = 'ssb-note warn';
        }
      }
    }

    /* ========================= 结果区（只更新数字） ========================= */
    function renderResult() {
      var wrap = document.getElementById('simResultWrap');
      if (!wrap) return;
      var r = calc();
      if (!r) { wrap.innerHTML = ''; return; }

      var norm = Math.abs(r.wsum - 100) > 0.01;
      var kpis = [
        { l: '加权近一年收益', v: U.fmt(r.ret), c: tone(r.ret) },
        { l: '估算波动率', v: r.vol.toFixed(2) + '%', c: 'n' },
        { l: '最坏情况（趋近）', v: '-' + r.mddSum.toFixed(2) + '%', c: 'up' },
        { l: '10 万变', v: U.comma(100000 * (1 + r.ret / 100)), c: 'n hl' }
      ];

      wrap.innerHTML =
        (norm ? '<div class="sim-warn">权重合计 <b class="n">' + r.wsum +
          '%</b>，已自动按比例归一化到 100% 计算</div>' : '') +
        '<div class="sim-kpis">' +
        kpis.map(function (k) {
          return '<div class="sim-kpi"><span>' + k.l + '</span>' +
            '<b class="' + k.c + '">' + k.v + '</b></div>';
        }).join('') +
        '</div>' +
        '<div class="sim-breakdown">' +
          r.rows.slice().sort(function (a, b) { return b.w - a.w; }).map(function (x) {
            return '<div class="sb-row">' +
              '<span class="sb-name">' + U.esc(x.name.slice(0, 14)) + '</span>' +
              '<span class="sb-track"><i style="width:' + (x.w * 100) +
                '%;background:' + (x.code === 'cash' ? '#7b8fb0' : (x.ret > 0 ? '#ff4d5e' : '#00c58e')) +
                '"></i></span>' +
              '<b class="sb-pct">' + (x.w * 100).toFixed(1) + '%</b>' +
              '</div>';
          }).join('') +
        '</div>' +
        '<div class="sim-foot">' +
          '<b>波动率是简化估算</b>（按各腿独立相加，没算相关性），' +
          '<b>实际会低一些</b>——因为板块之间不完全同涨同跌。要精确值请看相关性矩阵。' +
        '</div>';
    }

    /* ========================= 静态绑定 ========================= */
    function bindStatic() {
      Array.prototype.forEach.call(host.querySelectorAll('.sim-pre'), function (b) {
        b.addEventListener('click', function () {
          var i = b.getAttribute('data-i');
          if (i === null || i === undefined) return;
          state = {};
          var w = PRESETS[+i].w;
          Object.keys(w).forEach(function (k) { state[k] = w[k]; });
          renderList();
          renderResult();
        });
      });

      var even = document.getElementById('simEven');
      if (even) even.addEventListener('click', function () {
        var keys = Object.keys(state);
        if (!keys.length) return;
        var base = Math.floor(100 / keys.length);
        var rest = 100 - base * keys.length;
        var ns = {};
        keys.forEach(function (k, i) { ns[k] = base + (i < rest ? 1 : 0); });
        state = ns;
        renderList();
        renderResult();
      });

      var clr = document.getElementById('simClear');
      if (clr) clr.addEventListener('click', function () {
        state = {};
        renderList();
        renderResult();
      });

      var sel = document.getElementById('simSelect');
      if (sel) sel.addEventListener('change', function () {
        var v = sel.value;
        if (!v) return;
        if (!state[v]) state[v] = 20;
        sel.value = '';
        renderList();
        renderResult();
      });
    }

    renderShell();
  })();

})();
