/* ===========================================================
   高级功能模块（⑤-⑨）
   ⑤基金对比器 ⑥术语悬浮提示 ⑦压力测试 ⑧事件日历 ⑨折线图区间选择
   依赖：data.js → chart.js → anim.js
   =========================================================== */
(function () {
  'use strict';
  var D = window.DATA, U = window.UI, C2 = window.Chart2;
  if (!D || !U) return;
  var F = D.funds;
  function $(id) { return document.getElementById(id); }
  function tone(v) { return v > 0.0001 ? 'up' : (v < -0.0001 ? 'down' : 'mute'); }

  /* =========================================================
     ⑤ 基金对比器（2~3 只并排）
     ========================================================= */
  (function () {
    var host = $('compareBox');
    if (!host) return;

    /* 只在本页所属大类里选，避免跨类比较没意义 */
    var GRP = host.getAttribute('data-grp') || '';
    var POOL = GRP ? F.filter(function (f) { return f.grp === GRP; }) : F;

    var picked = [];
    if (POOL.length >= 2) { picked = [POOL[0].code, POOL[1].code]; }

    function getF(code) {
      for (var i = 0; i < F.length; i++) if (F[i].code === code) return F[i];
      return null;
    }

    var DIMS = [
      { k: 'ret250', n: '近一年收益', unit: '%', better: 'high', dec: 2 },
      { k: 'vol', n: '波动率', unit: '%', better: 'low', dec: 2 },
      { k: 'mdd250', n: '近一年最深', unit: '%', better: 'high', dec: 2 },
      { k: 'mddAll', n: '全历史最深', unit: '%', better: 'high', dec: 2 },
      { k: 'sharpe', n: '夏普比率', unit: '', better: 'high', dec: 2 },
      { k: 'hold250', n: '持有250天胜率', unit: '%', better: 'high', dec: 1 },
      { k: 'scale', n: '规模（亿）', unit: '', better: 'high', dec: 2 },
      { k: 'rate', n: '费率', unit: '%', better: 'low', dec: 2 }
    ];

    function render() {
      var fs = picked.map(getF).filter(Boolean);

      var html = '<div class="cmp-picker">';
      html += '<select class="sim-select cmp-sel" data-slot="0">' +
        '<option value="">选择基金…</option>' + POOL.map(function (f) {
          return '<option value="' + f.code + '"' + (picked[0] === f.code ? ' selected' : '') + '>' +
            f.code + ' ' + f.name.slice(0, 20) + '</option>';
        }).join('') + '</select>';
      html += '<select class="sim-select cmp-sel" data-slot="1">' +
        '<option value="">选择基金…</option>' + POOL.map(function (f) {
          return '<option value="' + f.code + '"' + (picked[1] === f.code ? ' selected' : '') + '>' +
            f.code + ' ' + f.name.slice(0, 20) + '</option>';
        }).join('') + '</select>';
      html += '<select class="sim-select cmp-sel" data-slot="2">' +
        '<option value="">（可选）第三只…</option>' + POOL.map(function (f) {
          return '<option value="' + f.code + '"' + (picked[2] === f.code ? ' selected' : '') + '>' +
            f.code + ' ' + f.name.slice(0, 20) + '</option>';
        }).join('') + '</select>';
      html += '</div>';

      if (fs.length < 2) {
        html += '<div class="sim-empty">请至少选择两只基金进行对比。</div>';
        host.innerHTML = html;
        bind();
        return;
      }

      /* 表：每行一个维度，标出赢家 */
      html += '<div class="cmp-tbl-wrap"><table class="cmp-tbl"><thead><tr><th class="left">指标</th>';
      fs.forEach(function (f) {
        html += '<th><div class="cmp-th-name">' + f.name.slice(0, 16) + '</div>' +
          '<div class="cmp-th-code">' + f.code + '</div></th>';
      });
      html += '</tr></thead><tbody>';

      DIMS.forEach(function (d) {
        var vals = fs.map(function (f) { return f[d.k]; });
        var valid = vals.filter(function (x) { return x !== null && x !== undefined; });
        var best = null;
        if (valid.length >= 2) {
          best = d.better === 'high' ? Math.max.apply(null, valid) : Math.min.apply(null, valid);
          /* 全部相同就不标 */
          if (Math.abs(Math.max.apply(null, valid) - Math.min.apply(null, valid)) < 1e-9) best = null;
        }
        html += '<tr><td class="left cmp-dim">' + d.n + '</td>';
        vals.forEach(function (v, i) {
          if (v === null || v === undefined) {
            html += '<td class="cmp-na">—</td>';
            return;
          }
          var isBest = best !== null && Math.abs(v - best) < 1e-9;
          var cls = d.k === 'ret250' || d.k === 'mdd250' || d.k === 'mddAll'
            ? tone(v) : (d.k === 'vol' ? 'mute' : tone(v));
          html += '<td class="' + cls + (isBest ? ' cmp-best' : '') + '">' +
            U.fmtNum(v, d.dec) + d.unit +
            (isBest ? '<span class="cmp-crown">★</span>' : '') + '</td>';
        });
        html += '</tr>';
      });
      html += '</tbody></table></div>';

      /* 雷达图：把 8 个维度归一化到 0-100 画蛛网 */
      html += '<div class="cmp-radar" id="cmpRadar"></div>';

      /* 结语 */
      var winnerCnt = fs.map(function () { return 0; });
      DIMS.forEach(function (d) {
        var vals = fs.map(function (f) { return f[d.k]; });
        var valid = vals.filter(function (x) { return x !== null && x !== undefined; });
        if (valid.length < 2) return;
        var best = d.better === 'high' ? Math.max.apply(null, valid) : Math.min.apply(null, valid);
        if (Math.abs(Math.max.apply(null, valid) - Math.min.apply(null, valid)) < 1e-9) return;
        vals.forEach(function (v, i) { if (v === best) winnerCnt[i]++; });
      });
      var wi = winnerCnt.indexOf(Math.max.apply(null, winnerCnt));
      html += '<div class="note good" style="margin-bottom:0">' +
        '<b>综合占优：' + fs[wi].name.slice(0, 18) + '</b>（' +
        DIMS.length + ' 项指标里赢了 <b class="n">' + winnerCnt[wi] + '</b> 项）<br>' +
        '<span style="color:#7286a8;font-size:12px">但请注意：<b>指标多不等于该买它</b>。' +
        '还要看它能不能放进你的组合、你能不能扛住它最惨的回撤。</span></div>';

      host.innerHTML = html;
      bind();
      drawRadar(fs);
    }

    function drawRadar(fs) {
      var box = $('cmpRadar');
      if (!box || !C2) return;
      var W = 1200, H = 380;
      var cx = W / 2, cy = H / 2, R = 130;
      var n = DIMS.length;

      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      function mk(t, a) {
        var e = document.createElementNS('http://www.w3.org/2000/svg', t);
        for (var k in a) if (a[k] !== null && a[k] !== undefined) e.setAttribute(k, a[k]);
        return e;
      }

      /* 归一化：每维度 min-max 到 0..1，方向按 better */
      var norm = fs.map(function (f) {
        return DIMS.map(function (d) {
          var vals = fs.map(function (x) { return x[d.k]; }).filter(function (v) { return v !== null && v !== undefined; });
          var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
          var v = f[d.k];
          if (v === null || v === undefined) return 0.5;
          if (hi - lo < 1e-9) return 0.5;
          var t = (v - lo) / (hi - lo);
          return d.better === 'high' ? t : 1 - t;
        });
      });

      var COLORS = ['#3d8bfd', '#f5b942', '#ff8a5c'];

      /* 网格环 */
      [0.25, 0.5, 0.75, 1].forEach(function (r) {
        var pts = [];
        for (var i = 0; i < n; i++) {
          var ang = -Math.PI / 2 + i * 2 * Math.PI / n;
          pts.push((cx + Math.cos(ang) * R * r).toFixed(1) + ',' + (cy + Math.sin(ang) * R * r).toFixed(1));
        }
        svg.appendChild(mk('polygon', {
          points: pts.join(' '), fill: 'none',
          stroke: '#1a2740', 'stroke-width': 1, 'stroke-dasharray': r === 1 ? null : '2 4'
        }));
      });
      /* 轴 */
      for (var i = 0; i < n; i++) {
        var ang = -Math.PI / 2 + i * 2 * Math.PI / n;
        svg.appendChild(mk('line', {
          x1: cx, y1: cy, x2: cx + Math.cos(ang) * R, y2: cy + Math.sin(ang) * R,
          stroke: '#1a2740', 'stroke-width': 1
        }));
        var lx = cx + Math.cos(ang) * (R + 32), ly = cy + Math.sin(ang) * (R + 26);
        var t = mk('text', {
          x: lx, y: ly, fill: '#7b8fb0', 'font-size': 10.5,
          'text-anchor': Math.abs(Math.cos(ang)) < 0.2 ? 'middle' : (Math.cos(ang) > 0 ? 'start' : 'end'),
          'font-family': '"PingFang SC","Microsoft YaHei",sans-serif'
        });
        t.textContent = DIMS[i].n;
        svg.appendChild(t);
      }
      /* 数据多边形 */
      norm.forEach(function (vals, fi) {
        var pts = vals.map(function (v, i) {
          var ang = -Math.PI / 2 + i * 2 * Math.PI / n;
          var r = R * (0.08 + v * 0.92);
          return (cx + Math.cos(ang) * r).toFixed(1) + ',' + (cy + Math.sin(ang) * r).toFixed(1);
        });
        var col = COLORS[fi % COLORS.length];
        svg.appendChild(mk('polygon', {
          points: pts.join(' '), fill: col, 'fill-opacity': 0.13,
          stroke: col, 'stroke-width': 2, 'stroke-linejoin': 'round'
        }));
        vals.forEach(function (v, i) {
          var ang = -Math.PI / 2 + i * 2 * Math.PI / n;
          var r = R * (0.08 + v * 0.92);
          svg.appendChild(mk('circle', {
            cx: cx + Math.cos(ang) * r, cy: cy + Math.sin(ang) * r,
            r: 3, fill: col
          }));
        });
      });

      box.innerHTML = '';
      box.appendChild(svg);

      var lg = document.createElement('div');
      lg.className = 'legend';
      lg.style.justifyContent = 'center';
      lg.innerHTML = fs.map(function (f, i) {
        return '<span style="cursor:default"><i style="background:' + COLORS[i % COLORS.length] +
          '"></i>' + f.name.slice(0, 14) + '</span>';
      }).join('');
      box.appendChild(lg);
    }

    function bind() {
      Array.prototype.forEach.call(host.querySelectorAll('.cmp-sel'), function (sel) {
        sel.addEventListener('change', function () {
          picked[+sel.getAttribute('data-slot')] = sel.value;
          picked = picked.filter(function (x, i) { return i > 2 || x; });
          /* 去重 */
          var seen = {};
          picked = picked.map(function (c) {
            if (!c) return c;
            if (seen[c]) return '';
            seen[c] = 1;
            return c;
          });
          render();
        });
      });
    }

    render();
  })();

  /* =========================================================
     ⑥ 术语悬浮提示（把正文里难懂的词自动加 tooltip）
     ========================================================= */
  (function () {
    if (!document.body) return;

    var GLOSSARY = {
      '波动率': '基金"晃得有多厉害"。数字越大，一年里上上下下越夸张。本看板：1.5% 以下=几乎不颠，22% 以上=极颠簸。',
      '最大回撤': '从最高点掉下来最惨掉到过多少。这是你实际会经历的痛苦，比波动率更真实。',
      '久期': '这笔钱借出去多久。久期越长，对利率变化越敏感——利率跌它涨最多，利率涨它跌最狠。',
      '夏普': '每担一份风险，换回几份超额收益。越高越划算。但债券类要小心：波动极小会把这个数放大得很夸张。',
      '夏普比率': '每担一份风险，换回几份超额收益。越高越划算。',
      '复权净值': '把分红再投资算进去的净值。判断赚没赚必须看这个，不能看 App 首页的单位净值。',
      '单位净值': '基金每份多少钱。分红后会下调，看起来"亏了"其实钱没少。',
      '内部极差': '板块里最好的和最差的差多少个百分点。越小说明"板块平均"越可信。',
      '超买': 'RSI 大于 70，短期涨太快了。但超买不等于要跌。',
      '超卖': 'RSI 小于 30，短期跌太狠了。但超卖不等于见底——恒生科技超卖后 20 日胜率只有 30%。',
      'RSI': '相对强弱指数，0~100。衡量最近涨得快还是跌得狠。',
      'QDII': '投资海外市场的基金。净值比 A 股基金晚 1~2 个交易日公布，而且有汇率风险。',
      '年化': '把不满一年的收益换算成"一年会是多少"，方便比较。',
      '再平衡': '把涨多了的卖掉一点、跌多了的补一点，让配比回到原计划。',
      '定投': '每隔一段时间固定买一笔。作用是减少择时错误，不是提高收益。',
      '持仓': '你手上实际买着的基金和份额。',
      '回撤': '从高点跌下来的幅度。'
    };

    /* 从长到短匹配，避免"夏普"抢先匹配"夏普比率" */
    var TERMS = Object.keys(GLOSSARY).sort(function (a, b) { return b.length - a.length; });
    var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, A: 1, BUTTON: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, CODE: 1, SVG: 1, MARK: 1 };
    var done = 0, MAX = 60;

    var tip = document.createElement('div');
    tip.className = 'gloss-tip';
    document.body.appendChild(tip);

    function processText(node) {
      if (done >= MAX) return;
      var text = node.nodeValue;
      if (!text || text.length < 2) return;
      var hit = null;
      for (var i = 0; i < TERMS.length; i++) {
        var idx = text.indexOf(TERMS[i]);
        if (idx > -1) { hit = { term: TERMS[i], idx: idx }; break; }
      }
      if (!hit) return;

      var frag = document.createDocumentFragment();
      if (hit.idx > 0) frag.appendChild(document.createTextNode(text.slice(0, hit.idx)));
      var span = document.createElement('span');
      span.className = 'gloss';
      span.setAttribute('data-t', hit.term);
      span.textContent = hit.term;
      frag.appendChild(span);
      var rest = text.slice(hit.idx + hit.term.length);
      if (rest) frag.appendChild(document.createTextNode(rest));

      node.parentNode.replaceChild(frag, node);
      done++;
    }

    function walk(root) {
      if (done >= MAX) return;
      var kids = root.childNodes;
      if (!kids) return;
      for (var i = kids.length - 1; i >= 0; i--) {
        var c = kids[i];
        if (c.nodeType === 3) processText(c);
        else if (c.nodeType === 1 && !SKIP_TAGS[c.tagName] && !c.classList.contains('gloss')) walk(c);
      }
    }

    /* 只处理正文段落，不动已经做过标记的区域 */
    var zones = document.querySelectorAll('.note, .sec-head p, .step p, .card p, .faq-a-inner');
    Array.prototype.forEach.call(zones, function (z) {
      if (done >= MAX) return;
      walk(z);
    });

    /* 悬停/点击显示 */
    function show(el) {
      var t = el.getAttribute('data-t');
      var def = GLOSSARY[t];
      if (!def) return;
      tip.innerHTML = '<b>' + t + '</b><br>' + def;
      var r = el.getBoundingClientRect();
      tip.style.display = 'block';
      tip.style.left = Math.min(window.innerWidth - 280, Math.max(10, r.left)) + 'px';
      tip.style.top = (r.bottom + window.scrollY + 8) + 'px';
    }
    function hide() { tip.style.display = 'none'; }

    document.addEventListener('mouseover', function (e) {
      var el = e.target;
      if (el && el.classList && el.classList.contains('gloss')) show(el);
    });
    document.addEventListener('mouseout', function (e) {
      var el = e.target;
      if (el && el.classList && el.classList.contains('gloss')) hide();
    });
    document.addEventListener('scroll', hide, { passive: true });
  })();

  /* =========================================================
     ⑦ 压力测试
     ========================================================= */
  (function () {
    var host = $('stressBox');
    if (!host) return;

    var SCENARIOS = [
      { n: '温和回调（正常年份）', d: -1.53,
        desc: '过去一年真实发生过的最深回撤。这属于噪音，不动。' },
      { n: '中等下跌', d: -3.00,
        desc: '约两倍正常回撤。触发警戒线：暂停买入，但不动仓位。' },
      { n: '四腿同时打历史最深', d: -9.20,
        desc: '假设债券、标普同时打出各自全历史最深回撤。这是真正的下限。' },
      { n: '单押长债（对照）', d: -8.27,
        desc: '如果把 100% 全买 003376，历史最深亏这么多。这是"集中"的代价。' },
      { n: '单押黄金（对照）', d: -31.12,
        desc: '单押黄金板块最惨个基的历史最深。1 万变 6,888。' },
      { n: '单押原油（对照）', d: -87.61,
        desc: '华宝油气的历史最深。1 万变 1,239。这就是"高收益"的另一面。' }
    ];

    /* 不用 querySelector 逐行更新 —— 每次输入直接重渲染整张表，
       避免任何 DOM 查询失败导致数字空白 */
    function render(amt) {
      var html = '<div class="stress-head">' +
        '<div class="stress-in"><label>我的投入金额（元）</label>' +
        '<input type="number" class="stress-input" id="stressAmt" value="' + amt +
        '" min="1000" step="1000"></div>' +
        '<div class="stress-in"><label>按哪个方案算</label>' +
        '<div class="stress-plan">建议组合 J（债60 / 标普20 / 现金20）</div></div>' +
        '</div>';

      html += '<div class="stress-tbl-wrap"><table class="stress-tbl"><thead><tr>' +
        '<th class="left">情景</th><th>跌幅</th><th>我的账户变成</th><th>少掉</th>' +
        '</tr></thead><tbody>';

      SCENARIOS.forEach(function (sc) {
        var end = amt * (1 + sc.d / 100);
        var lose = end - amt;
        html += '<tr>' +
          '<td class="left"><div class="stress-name">' + sc.n + '</div>' +
          '<div class="stress-desc">' + sc.desc + '</div></td>' +
          '<td class="up">' + sc.d.toFixed(2) + '%</td>' +
          '<td class="stress-end">' + U.comma(end) + ' 元</td>' +
          '<td class="stress-lose up">' + U.comma(lose) + ' 元</td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';

      var worstEnd = amt * (1 - 9.20 / 100);
      html += '<div class="note danger" style="margin-bottom:0">' +
        '<b>看第 3 行：四腿同时打历史最深，你的 ' + U.comma(amt) + ' 元会变成 ' +
        U.comma(worstEnd) + ' 元，少掉 ' + U.comma(amt - worstEnd) + ' 元。</b><br>' +
        '如果这个数字让你睡不着，<b style="color:#ff8a5c">说明你的仓位太重了</b>——' +
        '不是这个组合有问题，是你放进去的钱超过了你能承受的。<br>' +
        '<b style="color:#f5b942">往下看最后三行对照：单押任何一个板块，最坏情况都比组合惨 1~10 倍。</b>' +
        '这就是分散的全部意义——不是赚更多，是死得慢一点。' +
        '</div>';

      host.innerHTML = html;

      var inp = $('stressAmt');
      if (inp) {
        inp.addEventListener('input', function () {
          var v = +inp.value;
          if (isNaN(v) || v < 0) v = 0;
          render(v);
          var again = $('stressAmt');
          if (again) { again.focus(); }
        });
      }
    }

    render(100000);
  })();

  /* =========================================================
     ⑧ 事件日历时间轴
     ========================================================= */
  (function () {
    var host = $('calendarBox');
    if (!host) return;

    var EVENTS = [
      { d: '2026-10-30', t: '04:00', n: '美联储 FOMC 决议', tag: '高',
        desc: '现任主席凯文·沃什已取消前瞻指引，所以只能看措辞。12 月加息概率被定价在 75%~80%。',
        act: '等。这是反向事件——结果出来前不加仓。' },
      { d: '2026-11-03', t: '全天', n: '美国中期选举', tag: '高',
        desc: '油价的双向最大变量。10/28 已预演过一次：伊朗一句表态，布伦特当天跌 1%。',
        act: '等。原油相关仓位先别动。' },
      { d: '2026-11-04', t: '—', n: '第 1 批买入窗口', tag: '操作',
        desc: 'FOMC 与选举都过去后的第一个可操作窗口。',
        act: '买 050025 第二批 6.67%。' },
      { d: '2026-12-16', t: '—', n: '12 月 FOMC', tag: '高',
        desc: '加息是否落地，那天见分晓。',
        act: '决议后 3 个交易日内买 050025 第三批 6.66%。' },
      { d: '2027-01-15', t: '—', n: '基金四季报披露', tag: '中',
        desc: '能看到最新一期的持有人结构变化——机构是在加还是在撤。',
        act: '看数据，不动仓位。' },
      { d: '2027-04-15', t: '—', n: '第一次再平衡', tag: '操作',
        desc: '持有满半年。只看三条腿是否偏离 ≥5pp。',
        act: '偏离才动，不偏离不动。' }
    ];

    var html = '<div class="cal-list">';
    EVENTS.forEach(function (e, i) {
      var isAction = e.tag === '操作';
      var isHigh = e.tag === '高';
      html += '<div class="cal-item reveal d' + Math.min(i, 4) + (isAction ? ' act' : '') + '">' +
        '<div class="cal-dot-wrap">' +
        '<div class="cal-dot ' + (isHigh ? 'high' : (isAction ? 'act' : 'mid')) + '"></div>' +
        '</div>' +
        '<div class="cal-body">' +
        '<div class="cal-head">' +
        '<span class="cal-date">' + e.d + '</span>' +
        (e.t !== '—' ? '<span class="cal-time">' + e.t + '</span>' : '') +
        '<span class="cal-tag ' + (isHigh ? 'high' : (isAction ? 'act' : 'mid')) + '">' + e.tag + '</span>' +
        '</div>' +
        '<div class="cal-name">' + e.n + '</div>' +
        '<div class="cal-desc">' + e.desc + '</div>' +
        '<div class="cal-act"><b>该怎么做：</b>' + e.act + '</div>' +
        '</div></div>';
    });
    html += '</div>';
    host.innerHTML = html;
  })();

  /* =========================================================
     ⑨ 折线图区间选择（在走势图上拖选一段看区间收益）
     ========================================================= */
  (function () {
    var host = $('rangeChartBox');
    if (!host) return;
    var axis = D.axis, N = axis.length;
    var SECS = D.sectors.filter(function (s) { return s.seq && s.seq.length === N; });

    var start = 0, end = N - 1;
    var dragging = false, dragStart = -1;

    var html = '<div class="rg-hint">' +
      '<b>用法：</b>在下面的图上<b>按住鼠标横向拖动</b>，框选一段区间，实时看这段的涨跌。' +
      '<span style="color:#7286a8">（点一下就取消选择，回到全区间）</span></div>' +
      '<div class="rg-chart" id="rgInner"></div>' +
      '<div class="rg-readout" id="rgOut"></div>';
    host.innerHTML = html;

    var inner = $('rgInner');
    var out = $('rgOut');

    function draw() {
      var W = 1200, H = 300, ml = 46, mr = 14, mt = 14, mb = 26;
      var iw = W - ml - mr, ih = H - mt - mb;

      var all = [];
      SECS.forEach(function (s) { s.seq.forEach(function (v) { all.push(v); }); });
      var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
      var pad = (hi - lo) * 0.06 || 1;
      lo -= pad; hi += pad;

      var X = function (i) { return ml + iw * i / (N - 1); };
      var Y = function (v) { return mt + ih * (1 - (v - lo) / (hi - lo)); };

      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      function mk(t, a) {
        var e = document.createElementNS('http://www.w3.org/2000/svg', t);
        for (var k in a) if (a[k] !== null && a[k] !== undefined) e.setAttribute(k, a[k]);
        return e;
      }

      /* 网格 */
      for (var g = 0; g <= 4; g++) {
        var v = lo + (hi - lo) * g / 4, y = Y(v);
        svg.appendChild(mk('line', { x1: ml, y1: y, x2: W - mr, y2: y, stroke: '#1a2740', 'stroke-width': 1, 'stroke-dasharray': '2 6' }));
        var t = mk('text', { x: ml - 9, y: y + 4, fill: '#7b8fb0', 'font-size': 10.5, 'text-anchor': 'end', 'font-family': 'ui-monospace,monospace', 'font-weight': 600 });
        t.textContent = v.toFixed(0);
        svg.appendChild(t);
      }

      /* 选区外遮罩 + 选区高亮 */
      if (end > start) {
        svg.appendChild(mk('rect', {
          x: X(start), y: mt, width: Math.max(1, X(end) - X(start)), height: ih,
          fill: 'rgba(61,139,253,.10)'
        }));
      }

      /* 线条 */
      /* 颜色由 Chart2.palette 按数量自动生成，不再写死数组（避免多条线撞色） */
    var PAL = (window.Chart2 && window.Chart2.palette)
      ? window.Chart2.palette(SECS.length) : null;
      SECS.forEach(function (s, si) {
        var d = s.seq.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join(' ');
        svg.appendChild(mk('path', {
          d: d, fill: 'none', stroke: PAL[si],
          'stroke-width': 1.5, 'stroke-linejoin': 'round', opacity: 0.72
        }));
      });

      /* 选区边界线 */
      [start, end].forEach(function (i) {
        svg.appendChild(mk('line', {
          x1: X(i), y1: mt, x2: X(i), y2: mt + ih,
          stroke: '#fff', 'stroke-width': 1.5, opacity: 0.75
        }));
      });

      /* X 轴 */
      [0, Math.floor(N / 2), N - 1].forEach(function (i) {
        var tx = mk('text', {
          x: X(i), y: H - 8, fill: '#7286a8', 'font-size': 10.5,
          'text-anchor': i === 0 ? 'start' : (i === N - 1 ? 'end' : 'middle'),
          'font-family': 'ui-monospace,monospace', 'font-weight': 600
        });
        tx.textContent = axis[i];
        svg.appendChild(tx);
      });

      /* 交互层 */
      var hit = mk('rect', { x: ml, y: mt, width: iw, height: ih, fill: 'transparent', style: 'cursor:crosshair' });
      svg.appendChild(hit);

      inner.innerHTML = '';
      inner.appendChild(svg);

      function idxAt(ev) {
        var r = svg.getBoundingClientRect();
        var px = (ev.clientX - r.left) / r.width * W;
        var i = Math.round((px - ml) / iw * (N - 1));
        return Math.max(0, Math.min(N - 1, i));
      }

      hit.addEventListener('mousedown', function (ev) {
        dragging = true;
        dragStart = idxAt(ev);
      });
      hit.addEventListener('mousemove', function (ev) {
        if (!dragging) return;
        var i = idxAt(ev);
        start = Math.min(dragStart, i);
        end = Math.max(dragStart, i);
        if (end - start < 2) end = Math.min(N - 1, start + 2);
        draw();
      });
      hit.addEventListener('mouseup', function () { dragging = false; });
      hit.addEventListener('mouseleave', function () { dragging = false; });
      hit.addEventListener('click', function (ev) {
        if (dragging) return;
        /* 单击取消选择 */
        start = 0; end = N - 1;
        draw();
      });

      renderOut();
    }

    function renderOut() {
      if (!out) return;
      var span = end - start;
      if (span < 2) { out.innerHTML = '<div class="rg-empty">拖动框选一段吧</div>'; return; }

      var rows = SECS.map(function (s) {
        var a = s.seq[start], b = s.seq[end];
        return { name: s.name, r: (b / a - 1) * 100 };
      }).sort(function (x, y) { return y.r - x.r; });

      var html = '<div class="rg-head">' +
        '<span class="rg-span">' + axis[start] + ' → ' + axis[end] +
        '<b>（' + Math.round(span / (N - 1) * 250) + ' 个交易日）</b></span>' +
        '<span class="rg-tip">区间收益</span></div>' +
        '<div class="rg-bars">';
      rows.forEach(function (r) {
        var col = r.r >= 0 ? '#ff4d5e' : '#00c58e';
        html += '<div class="rg-bar-item">' +
          '<span class="rg-bar-name">' + r.name + '</span>' +
          '<span class="rg-bar-track"><i style="width:' +
          Math.min(100, Math.abs(r.r) / Math.max(1, Math.abs(rows[0].r)) * 100) +
          '%;background:' + col + '"></i></span>' +
          '<b class="rg-bar-val" style="color:' + col + '">' +
          (r.r > 0 ? '+' : '') + r.r.toFixed(2) + '%</b></div>';
      });
      html += '</div>';
      out.innerHTML = html;
    }

    draw();
  })();

})();
