/* ===========================================================
   动效与交互库：滚动淡入 / 数字滚动 / 评分条 / 表格排序筛选 / 行情滚动条
   纯原生实现，无依赖
   =========================================================== */
(function (global) {
  'use strict';

  var D = global.DATA || {};

  /* ---------------- 工具 ---------------- */
  var U = {
    fmt: function (v, d) {
      if (v === null || v === undefined || isNaN(v)) return '—';
      d = d === undefined ? 2 : d;
      return (v > 0 ? '+' : '') + Number(v).toFixed(d) + '%';
    },
    fmtNum: function (v, d) {
      if (v === null || v === undefined || isNaN(v)) return '—';
      d = d === undefined ? 2 : d;
      return Number(v).toFixed(d);
    },
    /* 千分位 */
    comma: function (v) {
      if (v === null || v === undefined) return '—';
      return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },
    cls: function (v) {
      if (v === null || v === undefined) return 'flat';
      return v > 0.0001 ? 'up' : (v < -0.0001 ? 'down' : 'flat');
    },
    tri: function (v) {
      if (v > 0.0001) return '<i class="tri u"></i>';
      if (v < -0.0001) return '<i class="tri d"></i>';
      return '';
    },
    /* 带箭头的涨跌文本 */
    chg: function (v, d) {
      return '<span class="' + U.cls(v) + '">' + U.tri(v) + U.fmt(v, d) + '</span>';
    },
    esc: function (s) {
      return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
    /* 1万块最坏剩多少 */
    worstLeft: function (mddPct) {
      return Math.round(10000 * (1 + mddPct / 100));
    },
    /**
     * 计数器的"兜底文本" —— 预填最终值
     * 这样即使 JS 动画失败，页面也不会显示 0%；
     * 动画只是把它从 0 滚到目标值。
     */
    countText: function (v, dec, suffix, sign) {
      if (v === null || v === undefined || isNaN(v)) return '—';
      var d = dec === undefined ? 2 : dec;
      var s = (sign !== false && v > 0 ? '+' : '') + Number(v).toFixed(d);
      return s + (suffix || '');
    },
    /**
     * 统一的数值取色 —— 全站唯一入口，杜绝硬编码颜色导致的语义矛盾
     *   正数 → 红（涨）  负数 → 绿（跌）  零 → 灰
     *   neutral=true → 中性蓝（用于波动率、规模等"不是涨跌"的指标）
     */
    sigCol: function (v, neutral) {
      if (neutral) return '#3d8bfd';
      if (v === null || v === undefined || isNaN(v)) return '#96a8c2';
      if (v > 0.0001) return '#ff4d5e';
      if (v < -0.0001) return '#00c58e';
      return '#96a8c2';
    }
  };

  /* ---------------- 滚动淡入 ---------------- */
  function initReveal() {
    var nodes = document.querySelectorAll('.reveal');
    if (!nodes.length) return;
    if (!('IntersectionObserver' in global)) {
      Array.prototype.forEach.call(nodes, function (n) { n.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    Array.prototype.forEach.call(nodes, function (n) { io.observe(n); });
  }

  /* ---------------- 数字滚动 ---------------- */
  function countUp(node, target, opt) {
    opt = opt || {};
    var dur = opt.duration || 1100;
    var dec = opt.decimals === undefined ? 2 : opt.decimals;
    var suffix = opt.suffix || '';
    var prefix = opt.prefix || '';
    var withSign = opt.sign !== false;
    var start = 0;
    var t0 = null;
    var ease = function (t) { return 1 - Math.pow(1 - t, 3); };

    if (opt.reduceMotion) {
      node.textContent = prefix + (withSign && target > 0 ? '+' : '') + target.toFixed(dec) + suffix;
      return;
    }

    function tick(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var v = start + (target - start) * ease(p);
      node.textContent = prefix + (withSign && v > 0 ? '+' : '') + v.toFixed(dec) + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else node.textContent = prefix + (withSign && target > 0 ? '+' : '') + target.toFixed(dec) + suffix;
    }
    requestAnimationFrame(tick);
  }

  /* 自动处理所有 [data-count] 元素 */
  function initCounters() {
    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var nodes = document.querySelectorAll('[data-count]');
    if (!nodes.length) return;

    function run(node) {
      if (node.dataset.done) return;
      node.dataset.done = '1';
      var raw = node.getAttribute('data-count');
      var val = parseFloat(raw);
      if (isNaN(val)) return;
      countUp(node, val, {
        decimals: node.getAttribute('data-dec') !== null ? +node.getAttribute('data-dec') : 2,
        suffix: node.getAttribute('data-suffix') || '',
        sign: node.getAttribute('data-sign') !== 'false',
        duration: node.getAttribute('data-dur') ? +node.getAttribute('data-dur') : 1100,
        reduceMotion: reduce
      });
    }

    if (!('IntersectionObserver' in global)) {
      Array.prototype.forEach.call(nodes, run);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { run(en.target); io.unobserve(en.target); }
      });
    }, { threshold: 0.3 });
    Array.prototype.forEach.call(nodes, function (n) { io.observe(n); });
  }

  /* ---------------- 评分条填充 ---------------- */
  function initBars() {
    var bars = document.querySelectorAll('.score-bar i');
    if (!bars.length) return;
    function fill(el) {
      var w = el.getAttribute('data-w');
      if (w === null) return;
      if (!el.dataset.t) {
        el.dataset.t = '1';
        setTimeout(function () { el.style.width = w + '%'; }, 80);
      }
    }
    if (!('IntersectionObserver' in global)) {
      Array.prototype.forEach.call(bars, fill);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { fill(en.target); io.unobserve(en.target); }
      });
    }, { threshold: 0.2 });
    Array.prototype.forEach.call(bars, function (b) { io.observe(b); });
  }

  /* ---------------- 行情滚动条 ---------------- */
  function initTicker() {
    var track = document.querySelector('.ticker-track');
    if (!track || !D.market) return;
    var items = D.market.items;
    var html = items.map(function (m) {
      var c = U.cls(m.chg);
      return '<span class="tick">' +
        '<span class="tk-name">' + U.esc(m.name) + '</span>' +
        '<span class="tk-price">' + m.price + '</span>' +
        '<span class="tk-chg ' + c + '">' + U.tri(m.chg) + U.fmt(m.chg) + '</span>' +
        '</span>';
    }).join('');
    /* 复制一份实现无缝循环 */
    track.innerHTML = html + html;
  }

  /* ---------------- 顶部阅读进度条 ---------------- */

  /* =========================================================
     区块标题吸顶
     ---------------------------------------------------------
     总览页 16 个区块、近 8000px 长，滚到中段很容易"不知道
     自己在看第几块"。这里用 IntersectionObserver 给进入视口
     顶部的 .sec-head 加 .sticky，CSS 里做了 sticky 定位 + 缩小
     标题 + 收起副标题的动作。

     为什么用 IntersectionObserver 而不是 scroll 事件：
     scroll 每次都算 getBoundingClientRect 会掉帧，这个页面
     已经有 16 个区块 + 若干图表，不能再加负担。
     ========================================================= */
  function initStickyHeads() {
    if (typeof IntersectionObserver !== 'function') return;
    var heads = document.querySelectorAll('section.block .sec-head');
    if (!heads.length) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var el = en.target;
        /* 顶部越过 60px 且还没离开视口底部 → 吸顶 */
        if (en.boundingClientRect.top < 60 && en.isIntersecting) {
          el.classList.add('sticky');
        } else {
          el.classList.remove('sticky');
        }
      });
    }, {
      /* 视口上下各收缩一点，避免边缘抖动 */
      rootMargin: '-60px 0px -70% 0px',
      threshold: 0
    });

    Array.prototype.forEach.call(heads, function (h) { io.observe(h); });
  }

  function initReadProgress() {
    /* 防御：缺少 DOM API 的环境直接跳过，不影响其他功能 */
    if (typeof window.addEventListener !== 'function' || !document.body) return;
    if (document.querySelector('.read-progress')) return;
    var bar = document.createElement('div');
    bar.className = 'read-progress';
    document.body.appendChild(bar);
    var ticking = false;
    function update() {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var pct = h > 0 ? (window.scrollY / h) * 100 : 0;
      bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }


  /* ---------------- 侧边章节导航（自动采集 h2 生成） ---------------- */
  function initSideNav() {
    if (typeof window.addEventListener !== 'function' || !document.body) return;
    var heads = document.querySelectorAll('section.block h2');
    if (!heads || heads.length < 4) return;          /* 章节太少就不显示 */
    if (document.querySelector('.side-nav')) return;

    var nav = document.createElement('nav');
    nav.className = 'side-nav';

    /* 面板标题 */
    var title = document.createElement('div');
    title.className = 'sn-title';
    title.textContent = '本页目录';
    nav.appendChild(title);

    var items = [];

    Array.prototype.forEach.call(heads, function (h, i) {
      /* 给每个 h2 打锚点 */
      if (!h.id) h.id = 'sec-' + i;
      var name = (h.textContent || '').trim();
      /* 太长就截断 */
      if (name.length > 16) name = name.slice(0, 15) + '…';

      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.className = 'sn-dot';
      a.title = (h.textContent || '').trim();
      a.innerHTML = '<i></i><span>' + name + '</span>';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var y = h.getBoundingClientRect().top + window.scrollY - 78;
        window.scrollTo({ top: y, behavior: 'smooth' });
      });
      nav.appendChild(a);
      items.push({ el: a, head: h });
    });

    document.body.appendChild(nav);

    /* 滚动高亮当前章节 */
    var ticking = false;
    function update() {
      var mid = window.scrollY + window.innerHeight * 0.34;
      var active = 0;
      items.forEach(function (it, i) {
        var top = it.head.getBoundingClientRect().top + window.scrollY;
        if (top <= mid) active = i;
      });
      items.forEach(function (it, i) {
        if (i === active) it.el.classList.add('on');
        else it.el.classList.remove('on');
      });
      /* 靠近顶部时隐藏 */
      if (window.scrollY < 240) nav.classList.add('hide');
      else nav.classList.remove('hide');
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ---------------- 返回顶部 ---------------- */
  function initToTop() {
    var btn = document.querySelector('.to-top');
    if (!btn) return;
    global.addEventListener('scroll', function () {
      if (global.scrollY > 600) btn.classList.add('show');
      else btn.classList.remove('show');
    }, { passive: true });
    btn.addEventListener('click', function () {
      global.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ---------------- 通用可排序 / 可筛选表格 ---------------- */
  /**
   * @param {Object} o
   *  table    : table 元素
   *  cols     : [{key,label,type:'num'|'str',cls,render,sortable,align}]
   *  rows     : 数据数组
   *  defaultSort: {key, dir:-1}
   *  filterEl : 容器（放按钮）
   *  filterKey: 用哪个字段筛选
   *  filterAll: 「全部」按钮文案
   *  rowClass : function(row) => string
   *  subRow   : function(row) => string 附加行（警示标签等）
   */
  function sortableTable(o) {
    var table = o.table;
    var cols = o.cols;
    var rows = o.rows.slice();
    var sortKey = o.defaultSort ? o.defaultSort.key : null;
    var sortDir = o.defaultSort ? o.defaultSort.dir : -1;
    var curFilter = '';
    var filterKey = o.filterKey;

    function cmp(a, b) {
      var x = a[sortKey], y = b[sortKey];
      var c = cols.filter(function (k) { return k.key === sortKey; })[0];
      var type = c && c.type ? c.type : 'num';
      if (type === 'str') {
        x = String(x === null || x === undefined ? '' : x);
        y = String(y === null || y === undefined ? '' : y);
        return sortDir * x.localeCompare(y, 'zh');
      }
      x = (x === null || x === undefined || isNaN(x)) ? -Infinity : Number(x);
      y = (y === null || y === undefined || isNaN(y)) ? -Infinity : Number(y);
      return sortDir * (x - y);
    }

    function render() {
      var list = rows.filter(function (r) {
        return !curFilter || String(r[filterKey]) === curFilter;
      }).sort(cmp);

      var thead = '<thead><tr>' + cols.map(function (c) {
        var on = sortKey === c.key;
        var arrow = on ? (sortDir < 0 ? ' ↓' : ' ↑') : '';
        var klass = [c.sortable === false ? '' : 'sortable', c.align === 'left' ? 'left' : ''].join(' ').trim();
        return '<th class="' + klass + '" data-k="' + c.key + '"' +
          (c.width ? ' style="width:' + c.width + '"' : '') + '>' +
          (c.label || '') + arrow + '</th>';
      }).join('') + '</tr></thead>';

      var tbody = '<tbody>' + list.map(function (r) {
        var tds = cols.map(function (c) {
          /* 支持三种输出：
             - 有 render：自定义
             - type:'str'：转义后的纯文本
             - fmt:'int' ：整数（不带 + 号和 %），用于"只数"这类列
             - 默认      ：U.fmt 带 +/- 和 %，用于收益率
             原实现只有前两种，导致 {key:'n', label:'只数', dec:0}
             渲染成 "+5%"，语义错误。 */
          var cellVal;
          if (c.render) {
            cellVal = c.render(r);
          } else if (c.type === 'str') {
            cellVal = U.esc(r[c.key]);
          } else if (c.fmt === 'int') {
            var iv = r[c.key];
            cellVal = (iv === null || iv === undefined || isNaN(iv))
              ? '—' : String(Math.round(iv));
          } else {
            cellVal = U.fmt(r[c.key], c.dec);
          }
          var v = cellVal;
          var klass = [c.align === 'left' ? 'left' : '', c.cls ? c.cls(r) : ''].join(' ').trim();
          return '<td class="' + klass + '">' + v + '</td>';
        }).join('');
        var extra = o.subRow ? o.subRow(r) : '';
        return '<tr' + (o.rowClass ? ' class="' + o.rowClass(r) + '"' : '') + '>' + tds + '</tr>' + extra;
      }).join('') + '</tbody>';

      table.innerHTML = thead + tbody;

      Array.prototype.forEach.call(table.querySelectorAll('th.sortable'), function (th) {
        th.addEventListener('click', function () {
          var k = th.getAttribute('data-k');
          if (sortKey === k) sortDir = -sortDir;
          else { sortKey = k; sortDir = -1; }
          render();
        });
      });
      if (o.afterRender) o.afterRender(table, list);
    }

    if (o.filterEl && filterKey) {
      var opts = [{ v: '', t: o.filterAll || '全部' }];
      if (o.filterOptions) opts = opts.concat(o.filterOptions);
      o.filterEl.innerHTML = opts.map(function (x) {
        return '<button class="btn" data-f="' + x.v + '">' + x.t + '</button>';
      }).join('');
      Array.prototype.forEach.call(o.filterEl.querySelectorAll('.btn'), function (b) {
        b.addEventListener('click', function () {
          Array.prototype.forEach.call(o.filterEl.querySelectorAll('.btn'), function (x) {
            x.classList.remove('on');
          });
          b.classList.add('on');
          curFilter = b.getAttribute('data-f');
          render();
        });
      });
    }

    render();
    return { render: render, setFilter: function (f) { curFilter = f; render(); } };
  }

  /* ---------------- 页面初始化 ---------------- */
  function boot() {
    initReveal();
    initCounters();
    initBars();
    initTicker();
    initToTop();
    initReadProgress();
    initStickyHeads();
    initSideNav();
    /* 标注当前页导航
       注意：文件名是中文时，location.pathname 返回的是 URL 编码形式
       （如 01-%E5%9F%BA%E9%87%91...），而 a.getAttribute('href') 是原始中文。
       必须先 decodeURIComponent，否则当前页永远不会高亮。 */
    var path = location.pathname.split('/').pop() || '';
    try { path = decodeURIComponent(path); } catch (e) { /* 编码异常则用原值 */ }
    Array.prototype.forEach.call(document.querySelectorAll('.nav a'), function (a) {
      var href = a.getAttribute('href');
      if (!href) return;
      var hrefDecoded = href;
      try { hrefDecoded = decodeURIComponent(href); } catch (e) {}
      if (hrefDecoded === path) a.classList.add('on');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.UI = {
    fmt: U.fmt, fmtNum: U.fmtNum, comma: U.comma, cls: U.cls,
    tri: U.tri, chg: U.chg, esc: U.esc, worstLeft: U.worstLeft,
    sigCol: U.sigCol, countText: U.countText,
    countUp: countUp, sortableTable: sortableTable, boot: boot
  };
})(window);

  /* =========================================================
     区块自动编号
     视觉诊断结论：14 个区块结构完全一样（kicker+h2+card），
     读者滚动时没有"这是第几块"的定位感，观感单调。
     这里给每个 .sec-head 注入 01 / 02 / 03 编号，
     配合 CSS 的左侧短线，建立终端面板式的层次。
     不改变任何文案，纯视觉增强。
     ========================================================= */
  (function () {
    var heads = document.querySelectorAll('section.block .sec-head');
    if (!heads.length) return;
    Array.prototype.forEach.call(heads, function (h, i) {
      if (h.querySelector('.sec-no')) return;
      var kicker = h.querySelector('.kicker');
      /* 跳过没有 kicker 的（通常是页面顶部 hero 区） */
      if (!kicker) return;
      var no = document.createElement('div');
      no.className = 'sec-no';
      var n = i + 1;
      no.innerHTML = '<em>' + (n < 10 ? '0' + n : n) + '</em>' +
        '<span>' + (kicker.textContent || '').trim().toUpperCase() + '</span>';
      h.insertBefore(no, kicker);
      /* 原来的 kicker 隐藏（编号行已经带了它的文字） */
      kicker.style.display = 'none';
    });
  })();


