/* ===========================================================
   板块轮动图（RRG）
   -----------------------------------------------------------
   坐标定义（简化版 RRG，口径可解释、不依赖外部假设）：

   X 轴 = 相对强弱 RS
     = 本板块在窗口内的收益 − 全部板块窗口内收益的算术平均
     单位 pp。>0 表示跑赢平均。

   Y 轴 = 相对动量 RM
     = 后半窗口的「相对强弱」− 前半窗口的「相对强弱」
     单位 pp。>0 表示"相对优势在扩大"。

   四象限：
     X>0, Y>0  领先 Leading    强且变强
     X>0, Y<0  走弱 Weakening  强但动能衰减
     X<0, Y<0  落后 Lagging    弱且更弱
     X<0, Y>0  改善 Improving  弱但动能转好

   数据限制：seq 只有 64 个降采样点（代表 250 个交易日），
   所以窗口天数要按比例换算成点数。页面已明示这个局限。
   =========================================================== */
(function () {
  'use strict';
  var D = window.DATA, U = window.UI;
  if (!D || !U) return;

  var host = document.getElementById('rrgChart');
  if (!host) return;

  var SECS = D.sectors || [];
  var N = (D.axis || []).length || (SECS[0] ? SECS[0].seq.length : 64);
  var FULL = D.axisFull || 250;          /* 实际交易日数 */
  var WIN = 20;                          /* 当前窗口（天） */

  /* 天数 → 降采样点数，至少 3 个点才能算动量 */
  function toPts(days) {
    return Math.max(3, Math.round(days / FULL * N));
  }

  /* 计算某个板块在 [起点, 终点] 的收益（%） */
  function ret(seq, i0, i1) {
    if (i1 <= i0) return 0;
    var a = seq[i0], b = seq[i1];
    if (!a) return 0;
    return (b / a - 1) * 100;
  }

  /* 核心计算：返回 [{name, sec, x, y, r20, grp}] */
  function compute(days) {
    var w = toPts(days);
    var half = Math.max(2, Math.round(w / 2));
    var i1 = N - 1;              /* 末端 */
    var i0 = Math.max(0, i1 - w);/* 窗口起点 */
    var im = Math.max(i0 + 1, i1 - half); /* 窗口中点 */

    /* 第一步：窗口内收益 */
    var base = SECS.map(function (s) {
      return {
        name: s.name, sec: s.sec, grp: s.grp,
        r: ret(s.seq, i0, i1),
        /* 前后半段各自的收益，用于算动量 */
        r1: ret(s.seq, i0, im),
        r2: ret(s.seq, im, i1)
      };
    });

    /* 第二步：全板块平均（等权算术平均，与本看板其他页面口径一致） */
    var avg = base.reduce(function (a, b) { return a + b.r; }, 0) / base.length;
    var avg1 = base.reduce(function (a, b) { return a + b.r1; }, 0) / base.length;
    var avg2 = base.reduce(function (a, b) { return a + b.r2; }, 0) / base.length;

    /* 第三步：相对强弱 / 相对动量 */
    return base.map(function (b) {
      return {
        name: b.name, sec: b.sec, grp: b.grp,
        r: b.r,
        x: b.r - avg,                 /* 相对强弱（pp） */
        y: (b.r2 - avg2) - (b.r1 - avg1), /* 动量变化（pp） */
      };
    });
  }

  /* 象限判定 */
  function quadrant(x, y) {
    if (x >= 0 && y >= 0) return { key: 'lead',  label: '领先', color: '#ff4d5e' };
    if (x >= 0 && y < 0)  return { key: 'weak',  label: '走弱', color: '#f5b942' };
    if (x < 0 && y < 0)   return { key: 'lag',   label: '落后', color: '#7286a8' };
    return { key: 'impr', label: '改善', color: '#4ecfa4' };
  }

  var GRP_COLOR = { fund: '#3d8bfd', stock: '#22d3ee', commodity: '#f5b942' };

  /* ================= SVG 绘制 ================= */
  function draw() {
    var data = compute(WIN);

    /* 提示文案 */
    var hint = document.getElementById('rrgHint');
    if (hint) {
      hint.textContent = '窗口 ' + WIN + ' 日 · 相对强弱=与全板块平均之差 · 相对动量=后半段−前半段';
    }

    /* 【注意】画布尺寸必须定义在 X/Y 之前 ——
       var 有声明提升但赋值没有，先引用会拿到 undefined，
       算出来全是 NaN，整张图渲染不出来。 */
    var W = 720, H = 460, PAD = 52;

    /* 坐标范围：留 35% 余量，0 线居中 */
    var xs = data.map(function (d) { return d.x; });
    var ys = data.map(function (d) { return d.y; });
    var xMax = Math.max(2, Math.max.apply(null, xs.map(Math.abs)) * 1.35);
    var yMax = Math.max(2, Math.max.apply(null, ys.map(Math.abs)) * 1.35);
    /* 对称映射，保证 0 在正中心 */
    var X = function (v) { return W / 2 + v / xMax * (W / 2 - PAD); };
    var Y = function (v) { return H / 2 - v / yMax * (H / 2 - PAD); };
    var cx = X(0), cy = Y(0);

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" ' +
      'style="width:100%;height:auto;display:block">';

    /* --- 四象限底色 --- */
    var QUAD = [
      { x: cx, y: 0,  w: W - cx, h: cy,        c: 'rgba(255,77,94,.055)',  lb: '领先',  lx: W - 14, ly: 22,  anchor: 'end',   lc: '#ff4d5e' },
      { x: cx, y: cy, w: W - cx, h: H - cy,    c: 'rgba(245,185,66,.055)', lb: '走弱',  lx: W - 14, ly: H - 12, anchor: 'end',   lc: '#f5b942' },
      { x: 0,  y: cy, w: cx,     h: H - cy,    c: 'rgba(114,134,168,.05)', lb: '落后',  lx: 14,     ly: H - 12, anchor: 'start', lc: '#8fa3c0' },
      { x: 0,  y: 0,  w: cx,     h: cy,        c: 'rgba(78,207,164,.055)', lb: '改善',  lx: 14,     ly: 22,  anchor: 'start', lc: '#4ecfa4' }
    ];
    QUAD.forEach(function (q) {
      svg += '<rect x="' + q.x + '" y="' + q.y + '" width="' + q.w + '" height="' + q.h +
        '" fill="' + q.c + '"/>';
      svg += '<text x="' + q.lx + '" y="' + q.ly + '" text-anchor="' + q.anchor +
        '" fill="' + q.lc + '" opacity=".55" font-size="13" font-weight="700" ' +
        'font-family="' + 'system-ui,sans-serif' + '">' + q.lb + '</text>';
    });

    /* --- 坐标轴（0 线 + 外框）--- */
    svg += '<line x1="' + cx + '" y1="6" x2="' + cx + '" y2="' + (H - 6) +
      '" stroke="rgba(255,255,255,.14)" stroke-width="1" stroke-dasharray="3 4"/>';
    svg += '<line x1="6" y1="' + cy + '" x2="' + (W - 6) + '" y2="' + cy +
      '" stroke="rgba(255,255,255,.14)" stroke-width="1" stroke-dasharray="3 4"/>';

    /* --- 轴标签 --- */
    var AX = { fill: '#7286a8', 'font-size': '11', 'font-family': 'ui-monospace,Consolas,monospace' };
    function txt(x, y, s, extra) {
      var a = 'x="' + x + '" y="' + y + '" ';
      for (var k in AX) a += k + '="' + AX[k] + '" ';
      return '<text ' + a + (extra || '') + '>' + s + '</text>';
    }
    svg += txt(W - 10, cy - 9, '比平均强 →', 'text-anchor="end"');
    svg += txt(10, cy - 9, '← 比平均弱', 'text-anchor="start"');
    svg += txt(cx + 8, 20, '↑ 动能在增强', 'text-anchor="start"');
    svg += txt(cx + 8, H - 10, '↓ 动能在衰减', 'text-anchor="start"');

    /* 刻度值 */
    svg += txt(cx + 5, cy - (H / 2 - PAD) + 4, '+' + yMax.toFixed(0) + 'pp', 'text-anchor="start" opacity=".6"'); 
    svg += txt(W - 8, cy + 16, '+' + xMax.toFixed(0) + 'pp', 'text-anchor="end" opacity=".6"');

    /* --- 数据点 --- */
    var maxAbsR = Math.max(1, Math.max.apply(null, data.map(function (d) { return Math.abs(d.r); })));
    data.forEach(function (d) {
      var q = quadrant(d.x, d.y);
      var px = X(d.x), py = Y(d.y);
      /* 点大小：区间收益绝对值 → 半径 6~15 */
      var rad = 6 + Math.abs(d.r) / maxAbsR * 9;

      /* 到中心的连线，强化"离中心多远"的直觉 */
      svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + px + '" y2="' + py +
        '" stroke="' + q.color + '" stroke-width="1" opacity=".16"/>';

      /* 光晕 */
      svg += '<circle cx="' + px + '" cy="' + py + '" r="' + (rad + 4) +
        '" fill="' + q.color + '" opacity=".13"/>';
      /* 主点 */
      svg += '<circle cx="' + px + '" cy="' + py + '" r="' + rad +
        '" fill="' + q.color + '" opacity=".82" stroke="rgba(255,255,255,.35)" stroke-width="1"/>';
      /* 板块名（带描边保证在任意底色上可读） */
      svg += '<text x="' + (px + rad + 5) + '" y="' + (py + 4) +
        '" font-size="11.5" font-weight="700" fill="#e8eef8" ' +
        'stroke="rgba(5,8,15,.85)" stroke-width="3.2" paint-order="stroke" ' +
        'font-family="system-ui,sans-serif">' + U.esc(d.name) + '</text>';
    });

    svg += '</svg>';
    host.innerHTML = svg;

    /* 图例 */
    var lg = document.getElementById('rrgLegend');
    if (lg) {
      lg.innerHTML = '<span class="rrg-lg"><b>点大小</b> = 区间收益绝对值</span>' +
        '<span class="rrg-lg"><b>离中心越远</b> = 相对优势/劣势越明显</span>' +
        '<span class="rrg-lg"><b>象限</b>：' +
        '<i style="background:#4ecfa4"></i>改善 <i style="background:#ff4d5e"></i>领先 ' +
        '<i style="background:#f5b942"></i>走弱 <i style="background:#7286a8"></i>落后</span>';
    }

    renderTable(data, xMax, yMax);
  }

  /* ================= 明细表 ================= */
  function renderTable(data, xMax, yMax) {
    var host2 = document.getElementById('rrgTable');
    if (!host2) return;

    var ORDER = ['lead', 'weak', 'impr', 'lag'];
    var QMETA = {
      lead: { label: '领先', color: '#ff4d5e', act: '钱在这里，但要判断是不是最后一棒' },
      weak: { label: '走弱', color: '#f5b942', act: '账面还在赚，动能已衰减 —— 最该警惕' },
      impr: { label: '改善', color: '#4ecfa4', act: '还没被注意到，值得研究' },
      lag:  { label: '落后', color: '#7286a8', act: '弱且还在变弱，暂时别碰' }
    };

    var byQ = {};
    data.forEach(function (d) {
      var q = quadrant(d.x, d.y).key;
      (byQ[q] = byQ[q] || []).push(d);
    });

    var html = '';
    ORDER.forEach(function (k) {
      var list = byQ[k];
      if (!list || !list.length) return;
      list.sort(function (a, b) { return b.x - a.x; });
      var m = QMETA[k];

      html += '<div class="rrg-q">' +
        '<div class="rrg-qh" style="border-left-color:' + m.color + '">' +
          '<b style="color:' + m.color + '">' + m.label + '</b>' +
          '<span class="rrg-qn">' + list.length + ' 个板块</span>' +
          '<span class="rrg-qa">' + m.act + '</span>' +
        '</div>' +
        '<div class="rrg-qlist">' +
        list.map(function (d) {
          var rTone = d.r > 0 ? 'up' : (d.r < 0 ? 'down' : '');
          var sTone = d.x > 0 ? 'up' : 'down';
          return '<a class="rrg-item" href="板块/' + U.esc(d.name) + '.html">' +
            '<span class="rrg-iname">' + U.esc(d.name) + '</span>' +
            '<span class="rrg-ir ' + rTone + '">' + U.fmt(d.r) + '</span>' +
            '<span class="rrg-ix ' + sTone + '">' +
              (d.x > 0 ? '强 ' : '弱 ') + Math.abs(d.x).toFixed(1) + 'pp</span>' +
            '<span class="rrg-iy ' + (d.y > 0 ? 'up' : 'down') + '">' +
              (d.y > 0 ? '↑' : '↓') + Math.abs(d.y).toFixed(1) + 'pp</span>' +
          '</a>';
        }).join('') +
        '</div></div>';
    });

    host2.innerHTML = '<div class="rrg-cols">' + html + '</div>';
  }

  /* ================= 窗口切换 ================= */
  Array.prototype.forEach.call(document.querySelectorAll('[data-w]'), function (b) {
    b.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('[data-w]'), function (x) {
        x.classList.remove('on');
      });
      b.classList.add('on');
      WIN = +b.getAttribute('data-w');
      draw();
    });
  });

  draw();
})();
