/* ===========================================================
   轻量 SVG 折线图引擎（无第三方依赖，离线可用）
   特性：多序列 / 面积渐变 / 绘制动画 / 悬停十字线+提示框 / 图例点击隐藏
   =========================================================== */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  /* ===========================================================
     SVG 内排版规范（修复"图里数字大小不统一"）
     根因：汉字和数字用同一个 font-size，而数字字形本就比汉字高，
          再叠加 Georgia 粗体，视觉上明显偏大。
     规范：数字一律比同行汉字小约 6%，且用等宽字体（衬线体数字更胖）。
     =========================================================== */
  var F_NUM = 'ui-monospace,Menlo,Consolas,monospace';
  var F_CN  = '"PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  var FS = {
    tick: 11,   /* 轴刻度数字 */
    label: 12.5,  /* 条形图左侧标签（含汉字） */
    value: 11.5,  /* 条形图右侧数值（纯数字，比 label 小） */
    axis: 11.5    /* 轴标题（含汉字） */
  };

  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) {
      e.setAttribute(k, attrs[k]);
    }
    return e;
  }

  function fmtPct(v, d) {
    if (v === null || v === undefined) return '—';
    var n = Number(v);
    return (n > 0 ? '+' : '') + n.toFixed(d === undefined ? 2 : d) + '%';
  }

  /**
   * 绘制折线图
   * @param {HTMLElement} host 容器
   * @param {Object} cfg
   *   axis   : ['2025-10-15', ...]
   *   series : [{name, data:[], color, width, area:bool, dash:bool}]
   *   base   : 基准线数值（默认 100）
   *   height : 视口高度（默认 360）
   *   yFmt   : 数值格式化函数
   *   vFmt   : 提示框数值格式化
   */
  function LineChart(host, cfg) {
    this.host = host;
    this.cfg = cfg;
    this.hidden = {};
    this.render();
  }

  LineChart.prototype.render = function () {
    var self = this;
    var cfg = this.cfg;
    var host = this.host;
    var axis = cfg.axis || [];
    var series = cfg.series || [];
    var W = 1200;
    var H = cfg.height || 360;
    var ml = 52, mr = 16, mt = 16, mb = 32;
    var iw = W - ml - mr, ih = H - mt - mb;
    var yFmt = cfg.yFmt || function (v) { return v.toFixed(0); };
    var vFmt = cfg.vFmt || fmtPct;

    // 计算值域（只统计可见序列）
    var all = [];
    series.forEach(function (s) {
      if (self.hidden[s.name]) return;
      s.data.forEach(function (v) { if (v !== null && v !== undefined) all.push(v); });
    });
    if (cfg.base !== undefined) all.push(cfg.base);
    if (!all.length) all = [0, 100];

    var lo = Math.min.apply(null, all);
    var hi = Math.max.apply(null, all);
    var pad = (hi - lo) * 0.08 || Math.abs(hi || 1) * 0.05 || 1;
    lo -= pad; hi += pad;

    var n = axis.length || series[0].data.length;
    var X = function (i) { return ml + iw * (n <= 1 ? 0.5 : i / (n - 1)); };
    var Y = function (v) { return mt + ih * (1 - (v - lo) / (hi - lo)); };

    var svg = el('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img'
    });

    // defs：面积渐变
    var defs = el('defs');
    series.forEach(function (s, i) {
      var g = el('linearGradient', {
        id: 'g' + i + '_' + Math.random().toString(36).slice(2, 7),
        x1: '0', y1: '0', x2: '0', y2: '1'
      });
      g.appendChild(el('stop', { offset: '0%', 'stop-color': s.color, 'stop-opacity': '0.26' }));
      g.appendChild(el('stop', { offset: '100%', 'stop-color': s.color, 'stop-opacity': '0' }));
      defs.appendChild(g);
      s._gid = g.getAttribute('id');
    });
    svg.appendChild(defs);

    // 水平网格 + Y 轴刻度
    var ticks = 5;
    for (var t = 0; t <= ticks; t++) {
      var v = lo + (hi - lo) * t / ticks;
      var yy = Y(v);
      svg.appendChild(el('line', {
        x1: ml, y1: yy, x2: W - mr, y2: yy,
        stroke: '#1a2740', 'stroke-width': 1,
        'stroke-dasharray': t === 0 ? null : '2 5'
      }));
      var tx = el('text', {
        x: ml - 10, y: yy + 4, fill: '#7b8fb0', 'font-size': FS.tick,
        'text-anchor': 'end', 'font-family': F_NUM, 'font-weight': 600
      });
      tx.textContent = yFmt(v);
      svg.appendChild(tx);
    }

    // 基准线
    if (cfg.base !== undefined && cfg.base > lo && cfg.base < hi) {
      svg.appendChild(el('line', {
        x1: ml, y1: Y(cfg.base), x2: W - mr, y2: Y(cfg.base),
        stroke: '#7286a8', 'stroke-width': 1.2, 'stroke-dasharray': '5 5'
      }));
    }

    // X 轴日期
    var marks = n <= 1 ? [0] : [0, Math.floor((n - 1) / 3), Math.floor(2 * (n - 1) / 3), n - 1];
    marks.forEach(function (i) {
      var tx = el('text', {
        x: X(i), y: H - 10, fill: '#7286a8', 'font-size': FS.tick,
        'text-anchor': i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle'),
        'font-family': F_NUM, 'font-weight': 600
      });
      tx.textContent = axis[i] || '';
      svg.appendChild(tx);
    });

    // 折线 + 面积
    series.forEach(function (s, si) {
      if (self.hidden[s.name]) return;
      var pts = [];
      s.data.forEach(function (v, i) {
        if (v !== null && v !== undefined) pts.push([X(i), Y(v)]);
      });
      if (!pts.length) return;

      // 面积
      if (s.area !== false && series.length <= 4) {
        var ap = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
        ap += ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (mt + ih) + ' L' + pts[0][0].toFixed(1) + ' ' + (mt + ih) + ' Z';
        var area = el('path', {
          d: ap, fill: 'url(#' + s._gid + ')', stroke: 'none',
          class: 'area-anim'
        });
        svg.appendChild(area);
        setTimeout(function () { area.classList.add('go'); }, 60 + si * 60);
      }

      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
      var path = el('path', {
        d: d, fill: 'none', stroke: s.color,
        'stroke-width': s.width || 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        'stroke-dasharray': s.dash ? '6 4' : null,
        class: s.dash ? null : 'line-anim',
        opacity: s.opacity || 1
      });
      svg.appendChild(path);

      if (!s.dash) {
        // 计算路径长度以驱动描绘动画
        var len = 0;
        for (var i = 1; i < pts.length; i++) {
          var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
          len += Math.sqrt(dx * dx + dy * dy);
        }
        var total = Math.ceil(len * 1.08);
        if (path.style && typeof path.style.setProperty === 'function') {
          path.style.setProperty('--len', total);
        } else {
          path.setAttribute('stroke-dasharray', total);
          path.setAttribute('stroke-dashoffset', total);
        }
        setTimeout(function () { path.classList.add('go'); }, 80 + si * 90);
      }
    });

    // 悬停层
    var hoverLine = el('line', {
      x1: 0, y1: mt, x2: 0, y2: mt + ih,
      stroke: '#3d8bfd', 'stroke-width': 1, opacity: 0, 'stroke-dasharray': '3 3'
    });
    svg.appendChild(hoverLine);

    var dots = series.map(function (s) {
      var c = el('circle', {
        r: 4, fill: '#05080f', stroke: s.color, 'stroke-width': 2, opacity: 0
      });
      svg.appendChild(c);
      return { s: s, c: c };
    });

    var hit = el('rect', {
      x: ml, y: mt, width: iw, height: ih, fill: 'transparent',
      style: 'cursor:crosshair'
    });
    svg.appendChild(hit);

    // HTML 提示框
    var tip = document.createElement('div');
    tip.style.cssText = [
      'position:absolute', 'pointer-events:none', 'opacity:0',
      'transition:opacity .12s', 'background:rgba(13,21,36,.97)',
      'border:1px solid #26385a', 'border-radius:8px', 'padding:10px 12px',
      'font-size:12px', 'line-height:1.75', 'color:#e8eef8',
      'box-shadow:0 8px 28px rgba(0,0,0,.6)', 'z-index:20',
      'white-space:nowrap', 'backdrop-filter:blur(8px)'
    ].join(';');

    host.style.position = 'relative';
    host.appendChild(svg);
    host.appendChild(tip);

    function idxFromEvent(ev) {
      var r = svg.getBoundingClientRect();
      var px = (ev.clientX - r.left) / r.width * W;
      var i = Math.round((px - ml) / iw * (n - 1));
      return Math.max(0, Math.min(n - 1, i));
    }

    function show(ev) {
      var i = idxFromEvent(ev);
      var x = X(i);
      hoverLine.setAttribute('x1', x);
      hoverLine.setAttribute('x2', x);
      hoverLine.setAttribute('opacity', 1);

      var rows = [];
      dots.forEach(function (d) {
        var v = d.s.data[i];
        if (self.hidden[d.s.name] || v === null || v === undefined) {
          d.c.setAttribute('opacity', 0); return;
        }
        d.c.setAttribute('cx', x);
        d.c.setAttribute('cy', Y(v));
        d.c.setAttribute('opacity', 1);
        var diff = v - (cfg.base === undefined ? v : cfg.base);
        var col = diff > 0.001 ? '#ff4d5e' : (diff < -0.001 ? '#00c58e' : '#96a8c2');
        rows.push(
          '<div style="display:flex;align-items:center;gap:7px;justify-content:space-between">' +
          '<span style="display:flex;align-items:center;gap:6px">' +
          '<i style="width:10px;height:3px;border-radius:2px;background:' + d.s.color + '"></i>' +
          (d.s.short || d.s.name) + '</span>' +
          '<b style="color:' + col + ';font-family:' + F_NUM + ';font-variant-numeric:tabular-nums">' + vFmt(v) + '</b></div>'
        );
      });

      tip.innerHTML = '<div style="color:#7b8fb0;margin-bottom:4px;font-size:11px">' +
        (axis[i] || '') + '</div>' + rows.join('');

      var r = svg.getBoundingClientRect();
      var hostR = host.getBoundingClientRect();
      var px = (x / W) * r.width;
      var left = px + 16;
      if (left + 190 > r.width) left = px - 200;
      tip.style.left = Math.max(4, left) + 'px';
      tip.style.top = '12px';
      tip.style.opacity = 1;
    }

    function hide() {
      hoverLine.setAttribute('opacity', 0);
      dots.forEach(function (d) { d.c.setAttribute('opacity', 0); });
      tip.style.opacity = 0;
    }

    hit.addEventListener('mousemove', show);
    hit.addEventListener('mouseleave', hide);
    hit.addEventListener('touchmove', function (e) {
      if (e.touches[0]) show(e.touches[0]);
    }, { passive: true });
    hit.addEventListener('touchend', hide);

    this.svg = svg;
  };

  LineChart.prototype.toggle = function (name) {
    this.hidden[name] = !this.hidden[name];
    this.host.innerHTML = '';
    this.render();
  };

  /* ---------------- 图例 ---------------- */
  function buildLegend(host, series, chart) {
    host.innerHTML = '';
    series.forEach(function (s) {
      var sp = document.createElement('span');
      sp.innerHTML = '<i style="background:' + s.color + '"></i>' + (s.short || s.name);
      sp.addEventListener('click', function () {
        sp.classList.toggle('off');
        chart.toggle(s.name);
      });
      host.appendChild(sp);
    });
  }

  /* ---------------- 横向条形图（多空对比等） ---------------- */
  function BarChart(host, cfg) {
    var W = 1200, rowH = cfg.rowH || 38, ml = cfg.labelW || 180, mr = 90;
    var items = cfg.items || [];
    var H = Math.max(80, items.length * rowH + 24);
    var iw = W - ml - mr;
    var maxV = Math.max.apply(null, items.map(function (d) { return Math.abs(d.value); })) || 1;

    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet' });
    items.forEach(function (d, i) {
      var y = 12 + i * rowH;
      var bh = Math.min(20, rowH - 14);
      var w = iw * Math.abs(d.value) / maxV;
      var col = d.color || '#3d8bfd';

      var tx = el('text', {
        x: ml - 12, y: y + bh / 2 + 4, fill: '#96a8c2',
        'font-size': FS.label, 'text-anchor': 'end', 'font-family': F_CN
      });
      tx.textContent = d.label;
      svg.appendChild(tx);

      svg.appendChild(el('rect', {
        x: ml, y: y, width: iw, height: bh, rx: 4, fill: '#121c2f'
      }));
      var bar = el('rect', {
        x: ml, y: y, width: 0, height: bh, rx: 4, fill: col, opacity: .88
      });
      svg.appendChild(bar);
      setTimeout(function () {
        bar.style.transition = 'width .9s cubic-bezier(.2,.8,.2,1)';
        bar.setAttribute('width', w);
      }, 100 + i * 55);

      var vt = el('text', {
        x: ml + w + 10, y: y + bh / 2 + 4, fill: col,
        'font-size': FS.value, 'font-weight': 700, 'font-family': F_NUM
      });
      vt.textContent = d.text || '';
      svg.appendChild(vt);
    });
    host.appendChild(svg);
  }


  /* ===========================================================
     散点图：X = 波动率，Y = 收益率
     投资展示的核心图 —— 一眼看出谁"高风险低收益"、谁"低风险高收益"
     左上角 = 最划算；右下角 = 最不划算
     =========================================================== */
  function ScatterChart(host, cfg) {
    var W = 1200, H = cfg.height || 460;
    var ml = 62, mr = 24, mt = 22, mb = 46;
    var iw = W - ml - mr, ih = H - mt - mb;
    var pts = cfg.points || [];
    if (!pts.length) return;

    var xs = pts.map(function (p) { return p.x; });
    var ys = pts.map(function (p) { return p.y; });
    var xlo = Math.min.apply(null, xs), xhi = Math.max.apply(null, xs);
    var ylo = Math.min.apply(null, ys), yhi = Math.max.apply(null, ys);
    var xp = (xhi - xlo) * 0.12 || 1, yp = (yhi - ylo) * 0.14 || 1;
    xlo = Math.max(0, xlo - xp); xhi += xp;
    ylo -= yp; yhi += yp;

    var X = function (v) { return ml + iw * (v - xlo) / (xhi - xlo); };
    var Y = function (v) { return mt + ih * (1 - (v - ylo) / (yhi - ylo)); };

    var svg = el('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img', 'aria-label': '风险收益散点图'
    });

    var defs = el('defs');
    /* 发光滤镜 */
    var f = el('filter', { id: 'glowSc', x: '-60%', y: '-60%', width: '220%', height: '220%' });
    f.appendChild(el('feGaussianBlur', { stdDeviation: '3', result: 'b' }));
    var mg = el('feMerge');
    mg.appendChild(el('feMergeNode', { in: 'b' }));
    mg.appendChild(el('feMergeNode', { in: 'SourceGraphic' }));
    f.appendChild(mg);
    defs.appendChild(f);
    svg.appendChild(defs);

    /* 网格 */
    var i;
    for (i = 0; i <= 5; i++) {
      var vy = ylo + (yhi - ylo) * i / 5, yy = Y(vy);
      svg.appendChild(el('line', {
        x1: ml, y1: yy, x2: W - mr, y2: yy,
        stroke: '#1a2740', 'stroke-width': 1, 'stroke-dasharray': i === 0 ? null : '2 6'
      }));
      var ty = el('text', {
        x: ml - 10, y: yy + 4, fill: '#7b8fb0', 'font-size': FS.tick,
        'text-anchor': 'end', 'font-family': F_NUM, 'font-weight': 600
      });
      ty.textContent = (vy > 0 ? '+' : '') + vy.toFixed(0) + '%';
      svg.appendChild(ty);
    }
    for (i = 0; i <= 5; i++) {
      var vx = xlo + (xhi - xlo) * i / 5, xx = X(vx);
      svg.appendChild(el('line', {
        x1: xx, y1: mt, x2: xx, y2: mt + ih,
        stroke: '#1a2740', 'stroke-width': 1, 'stroke-dasharray': '2 6'
      }));
      var tx = el('text', {
        x: xx, y: mt + ih + 20, fill: '#7b8fb0', 'font-size': FS.tick,
        'text-anchor': 'middle', 'font-family': F_NUM, 'font-weight': 600
      });
      tx.textContent = vx.toFixed(0) + '%';
      svg.appendChild(tx);
    }

    /* 零收益线 */
    if (ylo < 0 && yhi > 0) {
      svg.appendChild(el('line', {
        x1: ml, y1: Y(0), x2: W - mr, y2: Y(0),
        stroke: '#465a78', 'stroke-width': 1.4, 'stroke-dasharray': '6 4'
      }));
    }

    /* 四个象限的淡淡背景标签 */
    var quads = [
      { x: ml + 8, y: mt + 18, t: '↖ 低风险 · 高收益', c: '#00c58e', a: 'start' },
      { x: W - mr - 8, y: mt + 18, t: '高风险 · 高收益 ↗', c: '#e8a93c', a: 'end' },
      { x: ml + 8, y: mt + ih - 10, t: '↙ 低风险 · 低收益', c: '#7b8fb0', a: 'start' },
      { x: W - mr - 8, y: mt + ih - 10, t: '高风险 · 低收益 ↘', c: '#ff8a5c', a: 'end' }
    ];
    quads.forEach(function (q) {
      var t = el('text', {
        x: q.x, y: q.y, fill: q.c, 'font-size': FS.tick, opacity: 0.5,
        'text-anchor': q.a, 'font-weight': 600, 'font-family': F_CN
      });
      t.textContent = q.t;
      svg.appendChild(t);
    });

    /* 轴标题 */
    var ax1 = el('text', {
      x: ml + iw / 2, y: H - 6, fill: '#657a99', 'font-size': FS.axis,
      'text-anchor': 'middle', 'font-weight': 600, 'font-family': F_CN
    });
    ax1.textContent = cfg.xLabel || '年化波动率 →';
    svg.appendChild(ax1);
    var ax2 = el('text', {
      x: 14, y: mt + ih / 2, fill: '#657a99', 'font-size': FS.axis,
      'text-anchor': 'middle', 'font-weight': 600, 'font-family': F_CN,
      transform: 'rotate(-90 14 ' + (mt + ih / 2) + ')'
    });
    ax2.textContent = cfg.yLabel || '近一年收益率 →';
    svg.appendChild(ax2);

    /* 点 */
    var tip = document.createElement('div');
    tip.style.cssText = [
      'position:absolute', 'pointer-events:none', 'opacity:0',
      'transition:opacity .12s', 'background:rgba(13,21,36,.98)',
      'border:1px solid #26385a', 'border-radius:8px', 'padding:10px 12px',
      'font-size:12px', 'line-height:1.8', 'color:#e8eef8',
      'box-shadow:0 8px 28px rgba(0,0,0,.7)', 'z-index:20',
      'white-space:nowrap', 'backdrop-filter:blur(8px)'
    ].join(';');
    host.style.position = 'relative';

    pts.forEach(function (p, idx) {
      var cx = X(p.x), cy = Y(p.y);
      var g = el('g', { style: 'cursor:pointer' });
      /* 外圈光晕 */
      g.appendChild(el('circle', {
        cx: cx, cy: cy, r: p.r || 6, fill: p.color, opacity: 0.18
      }));
      var dot = el('circle', {
        cx: cx, cy: cy, r: p.r || 5.5, fill: p.color,
        stroke: '#05080f', 'stroke-width': 1.5, opacity: 0,
        filter: 'url(#glowSc)'
      });
      g.appendChild(dot);
      /* 出现动画 */
      setTimeout(function () { dot.setAttribute('opacity', 0.95); }, 120 + idx * 22);

      /* 高亮/提示 */
      var halo = g.firstChild;
      g.addEventListener('mouseenter', function () {
        dot.setAttribute('r', (p.r || 5.5) * 1.7);
        halo.setAttribute('opacity', 0.42);
        tip.innerHTML =
          '<div style="font-weight:700;margin-bottom:3px;color:#fff">' + p.label + '</div>' +
          '<div style="color:#96a8c2;font-size:11px;margin-bottom:5px">' + (p.sub || '') + '</div>' +
          '<div>近一年 <b style="color:' + (p.y > 0 ? '#ff4d5e' : '#00c58e') +
            ';font-family:ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums">' +
            (p.y > 0 ? '+' : '') + p.y.toFixed(2) + '%</b></div>' +
          '<div>波动率 <b style="color:#96a8c2;font-family:ui-monospace,Menlo,monospace">' +
            p.x.toFixed(2) + '%</b></div>' +
          (p.extra ? '<div style="color:#7b8fb0;font-size:11px;margin-top:3px">' + p.extra + '</div>' : '');
        var r = svg.getBoundingClientRect();
        var px = cx / W * r.width, py = cy / H * r.height;
        var left = px + 16, top = py - 10;
        if (left + 210 > r.width) left = px - 226;
        if (top < 0) top = 4;
        tip.style.left = left + 'px';
        tip.style.top = top + 'px';
        tip.style.opacity = 1;
      });
      g.addEventListener('mouseleave', function () {
        dot.setAttribute('r', p.r || 5.5);
        halo.setAttribute('opacity', 0.18);
        tip.style.opacity = 0;
      });
      svg.appendChild(g);
    });

    host.appendChild(svg);
    host.appendChild(tip);
  }

  global.Chart2 = {
    line: function (host, cfg) {
      var c = new LineChart(host, cfg);
      if (cfg.legendEl) buildLegend(cfg.legendEl, cfg.series, c);
      return c;
    },
    bar: BarChart,
    scatter: ScatterChart,
    fmtPct: fmtPct
  };
})(window);
