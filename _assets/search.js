/* ===========================================================
   全局搜索（Ctrl+K / Cmd+K）
   搜索范围：40 只基金（名称/代码/板块）+ 9 个板块 + 10 个页面
   点结果直达：基金 → 对应板块页，板块 → 板块页，页面 → 页面
   依赖：data.js
   =========================================================== */
(function () {
  'use strict';

  var D = window.DATA;
  if (!D) return;

  var PAGES = [
    { t: '总览', d: '市场温度、九大板块、风险收益全景、建议组合', u: '总览.html', k: '首页 home index 总览 概况' },
    { t: '基金（债券与现金）', d: '4 只债券基金 + 货币基金', u: '债券基金.html', k: '基金 债券 纯债 国债 货币 现金 稳健' },
    { t: '股票（权益基金）', d: 'A股、港股、美股、行业主题，共 18 只', u: '股票基金.html', k: '股票 权益 A股 港股 美股 行业 主题 半导体 白酒' },
    { t: '商品（黄金原油）', d: '黄金、白银、原油、有色，共 18 只', u: '商品基金.html', k: '商品 黄金 白银 原油 有色 金属 大宗' },
    { t: '新手百科与购买建议', d: '术语、收益错觉、配置方案、FAQ、数据说明书', u: '新手百科.html', k: '新手 百科 购买 建议 配置 方案 FAQ 常见问题 术语' }
  ];

  /* 页面路径前缀：板块页在 板块/ 子目录下 */
  var inSub = /\/板块\//.test(location.pathname);
  function url(u) { return (inSub ? '../' : '') + u; }

  var SEC_OF = {};   /* 板块 → 页名 */
  var ITEMS = [];

  /* 页面 */
  PAGES.forEach(function (p) {
    ITEMS.push({ type: '页面', t: p.t, d: p.d, u: url(p.u), k: p.k, group: '页面' });
  });

  /* 板块 + 基金 */
  D.sectors.forEach(function (s) {
    var secUrl = (inSub ? '' : '板块/') + s.name + '.html';
    ITEMS.push({
      type: '板块', t: s.name, d: s.n + ' 只 · 近一年 ' + (s.arith > 0 ? '+' : '') +
        s.arith.toFixed(2) + '% · 波动 ' + s.vol.toFixed(2) + '%',
      u: secUrl, k: s.name + ' ' + (s.codes || []).join(' '), group: '板块'
    });
  });

  var GRP_NAME = { fund: '基金', stock: '股票', commodity: '商品' };
  D.funds.forEach(function (f) {
    var secUrl = (inSub ? '' : '板块/') + f.secName + '.html';
    ITEMS.push({
      type: '基金', t: f.name, d: f.code + ' · ' + f.secName + ' · 近一年 ' +
        (f.ret250 > 0 ? '+' : '') + f.ret250.toFixed(2) + '%',
      u: secUrl, k: f.code + ' ' + f.name + ' ' + f.secName + ' ' + (f.ftype || ''),
      group: GRP_NAME[f.grp] || '基金'
    });
  });

  /* ---------- 匹配打分 ---------- */
  function score(item, q) {
    var t = item.t.toLowerCase();
    var k = (item.k || '').toLowerCase();
    var d = (item.d || '').toLowerCase();
    if (t === q) return 1000;
    if (t.indexOf(q) === 0) return 800;
    if (k.indexOf(q) === 0) return 700;
    if (t.indexOf(q) > -1) return 500;
    if (k.indexOf(q) > -1) return 300;
    if (d.indexOf(q) > -1) return 120;
    /* 逐字包含（支持"沪300"这种跳字） */
    var qi = 0;
    for (var i = 0; i < t.length && qi < q.length; i++) {
      if (t[i] === q[qi]) qi++;
    }
    if (qi === q.length) return 60;
    return 0;
  }

  /* ---------- 构建 UI ---------- */
  var mask, panel, input, listEl, cur = -1, results = [];

  function build() {
    mask = document.createElement('div');
    mask.className = 'search-mask';
    mask.innerHTML =
      '<div class="search-panel" role="dialog" aria-label="搜索">' +
        '<div class="search-bar">' +
          '<svg class="search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/>' +
            '<path d="M20 20l-3.5-3.5"/></svg>' +
          '<input class="search-input" type="text" placeholder="搜基金名称、代码、板块…（如 原油 / 003376 / 黄金）" ' +
            'autocomplete="off" spellcheck="false">' +
          '<kbd class="search-esc">ESC</kbd>' +
        '</div>' +
        '<div class="search-list"></div>' +
        '<div class="search-foot">' +
          '<span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>' +
          '<span><kbd>Enter</kbd> 打开</span>' +
          '<span class="sf-hint">共 ' + ITEMS.length + ' 条可搜</span>' +
        '</div>' +
      '</div>';
    document.body.appendChild(mask);

    panel = mask.querySelector('.search-panel');
    input = mask.querySelector('.search-input');
    listEl = mask.querySelector('.search-list');

    /* 防御：如果 DOM 构建异常（如被 CSP 或插件干扰），不能连累整站脚本 */
    if (!input || !listEl) {
      if (mask.parentNode) mask.parentNode.removeChild(mask);
      mask = panel = input = listEl = null;
      return;
    }

    mask.addEventListener('click', function (e) {
      if (e.target === mask) close();
    });
    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('keydown', onKey);

    document.addEventListener('keydown', function (e) {
      /* Ctrl+K / Cmd+K 唤起 */
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        open();
      } else if (e.key === 'Escape' && mask.classList.contains('open')) {
        close();
      }
    });

    /* 也支持点顶部搜索按钮 */
    Array.prototype.forEach.call(document.querySelectorAll('.search-trigger'), function (b) {
      b.addEventListener('click', open);
    });
  }

  function render(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) {
      /* 空查询：显示快捷入口 */
      results = ITEMS.filter(function (i) { return i.type === '板块' || i.type === '页面'; }).slice(0, 14);
    } else {
      results = ITEMS
        .map(function (i) { return { i: i, s: score(i, q) }; })
        .filter(function (x) { return x.s > 0; })
        .sort(function (a, b) { return b.s - a.s; })
        .slice(0, 20)
        .map(function (x) { return x.i; });
    }
    cur = results.length ? 0 : -1;

    if (!results.length) {
      listEl.innerHTML = '<div class="search-empty">没有找到「' + esc(q) + '」<br>' +
        '<span>试试搜：原油 / 黄金 / 003376 / 债券 / 白酒</span></div>';
      return;
    }

    /* 按 group 分组 */
    var groups = {}, order = [];
    results.forEach(function (r) {
      if (!groups[r.group]) { groups[r.group] = []; order.push(r.group); }
      groups[r.group].push(r);
    });

    var html = '', idx = 0;
    order.forEach(function (g) {
      html += '<div class="search-group">' + g + '</div>';
      groups[g].forEach(function (r) {
        html += '<a class="search-item' + (idx === cur ? ' on' : '') + '" href="' +
          encodeURI(r.u) + '" data-i="' + idx + '">' +
          '<span class="si-type t' + r.type + '">' + r.type + '</span>' +
          '<span class="si-main"><span class="si-t">' + hl(r.t, q) + '</span>' +
          '<span class="si-d">' + hl(r.d, q) + '</span></span>' +
          '<span class="si-go">→</span></a>';
        idx++;
      });
    });
    listEl.innerHTML = html;

    Array.prototype.forEach.call(listEl.querySelectorAll('.search-item'), function (a) {
      a.addEventListener('mouseenter', function () {
        cur = +a.getAttribute('data-i');
        syncOn();
      });
    });
  }

  function syncOn() {
    Array.prototype.forEach.call(listEl.querySelectorAll('.search-item'), function (a) {
      var on = +a.getAttribute('data-i') === cur;
      a.classList.toggle('on', on);
      if (on && a.scrollIntoView) {
        a.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function hl(text, q) {
    var s = esc(text);
    if (!q) return s;
    var i = s.toLowerCase().indexOf(q);
    if (i < 0) return s;
    return s.slice(0, i) + '<mark>' + s.slice(i, i + q.length) + '</mark>' + s.slice(i + q.length);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!results.length) return;
      cur = (cur + 1) % results.length;
      syncOn();
      e.target.value = e.target.value; /* 保持光标 */
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!results.length) return;
      cur = (cur - 1 + results.length) % results.length;
      syncOn();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (cur >= 0 && results[cur]) {
        location.href = encodeURI(results[cur].u);
      }
    }
  }

  function open() {
    if (!mask) return;
    mask.classList.add('open');
    document.body.style.overflow = 'hidden';
    input.value = '';
    render('');
    setTimeout(function () { input.focus(); }, 40);
  }

  function close() {
    mask.classList.remove('open');
    document.body.style.overflow = '';
  }

  /* 暴露给外部（顶部按钮调用） */
  window.SiteSearch = {
    open: function () { if (!mask) build(); if (mask) open(); },
    close: close
  };

  /* 自动构建（失败则静默降级，不影响其他功能） */
  try { build(); } catch (e) {
    mask = null;
    if (typeof window.__SEARCH_DEBUG !== 'undefined') {
      console.error('[search] build failed:', e && e.message);
    }
  }
})();
