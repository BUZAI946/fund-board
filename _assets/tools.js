/* ===========================================================
   全局工具（⑩-⑭）
   ⑩ 亮色主题切换 ⑪ 导出 PDF ⑫ 导出 CSV ⑬ 自测结果本地保存 ⑭ 相关板块推荐
   在每页都自动注入工具栏按钮，无需改 HTML
   依赖：data.js → anim.js
   =========================================================== */
(function () {
  'use strict';
  var D = window.DATA, U = window.UI;
  if (!D || !U) return;
  function $(id) { return document.getElementById(id); }

  var LS_KEY_THEME = 'fundboard_theme';
  var LS_KEY_QUIZ = 'fundboard_quiz';

  /* =========================================================
     ⑩ 亮色 / 暗色主题切换
     ========================================================= */
  var Theme = (function () {
    function apply(mode) {
      var root = document.documentElement;
      if (!root) return;
      /* 防御：某些嵌入式环境没有 removeAttribute */
      if (mode === 'light') {
        if (root.setAttribute) root.setAttribute('data-theme', 'light');
      } else {
        if (root.removeAttribute) root.removeAttribute('data-theme');
        else if (root.setAttribute) root.setAttribute('data-theme', '');
      }
    }
    function current() {
      try {
        if (typeof localStorage === 'undefined') return 'dark';
        return localStorage.getItem(LS_KEY_THEME) || 'dark';
      } catch (e) { return 'dark'; }
    }
    function set(mode) {
      apply(mode);
      try { if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY_THEME, mode); } catch (e) {}
      syncBtn();
    }
    function toggle() { set(current() === 'light' ? 'dark' : 'light'); }
    function syncBtn() {
      var b = $('toolTheme');
      if (!b) return;
      var isLight = current() === 'light';
      b.innerHTML = isLight
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg><span class="tl-txt">暗色</span>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg><span class="tl-txt">亮色</span>';
      b.title = isLight ? '切换到暗色（更适合屏幕）' : '切换到亮色（投影/打印用）';
    }
    /* 初始化：先应用，避免闪白 */
    apply(current());
    return { toggle: toggle, syncBtn: syncBtn, current: current };
  })();

  /* =========================================================
     ⑫ 导出 CSV（当前页的表格全部导出成一个 csv）
     ========================================================= */
  /* =========================================================
     ⑫ 导出（委托给 export.js）—— 真 Excel + 干净打印视图
     原实现两个问题：
       · CSV 抓的是页面 DOM 表格，会把 syl_1n / div_gap 这类字段名
         当内容导出去（用户反馈"表里有英文函数"）
       · PDF 直接 window.print() 原页面，深色卡片 + 固定侧边栏会印成黑块
     现改为：导出底层数据为 .xlsx；PDF 走专用打印视图（白底深字）。
     ========================================================= */
  function exportCSV() {
    if (window.SiteExport && window.SiteExport.xlsx) {
      window.SiteExport.xlsx();
    } else {
      alert('导出模块未加载（export.js 缺失）。');
    }
  }

  function exportPDF() {
    if (window.SiteExport && window.SiteExport.pdf) {
      window.SiteExport.pdf();
    } else {
      /* 兜底：至少让浏览器打印能看 */
      window.print();
    }
  }

  /* =========================================================
     ⑬ 自测结果本地保存 & 恢复
     ========================================================= */
  var QuizMem = (function () {
    function save(obj) {
      try { localStorage.setItem(LS_KEY_QUIZ, JSON.stringify(obj)); } catch (e) {}
    }
    function load() {
      try {
        var s = localStorage.getItem(LS_KEY_QUIZ);
        return s ? JSON.parse(s) : null;
      } catch (e) { return null; }
    }
    function clear() {
      try { localStorage.removeItem(LS_KEY_QUIZ); } catch (e) {}
    }
    return { save: save, load: load, clear: clear };
  })();

  /* 在自测区上方插一条"上次结果"提示 */
  (function () {
    var quiz = $('quiz');
    if (!quiz) return;
    var mem = QuizMem.load();
    if (!mem) return;

    var bar = document.createElement('div');
    bar.className = 'quiz-mem';
    bar.innerHTML = '<span>📌 你上次测的结果：<b>' + mem.lvl + ' · 建议仓位 ' + mem.w + '%</b>' +
      '<span class="qm-time">' + (mem.at || '') + '</span></span>' +
      '<button class="btn qm-clear">清除记录</button>';
    /* 防御：父节点可能不存在（历史记录存在但本页结构变了） */
    if (quiz.parentNode && quiz.parentNode.insertBefore) {
      quiz.parentNode.insertBefore(bar, quiz);
    } else {
      return;
    }
    var cb = bar.querySelector ? bar.querySelector('.qm-clear') : null;
    if (cb) {
      cb.addEventListener('click', function () {
        QuizMem.clear();
        if (bar.parentNode) bar.parentNode.removeChild(bar);
      });
    }
  })();

  /* 挂钩子：自测算完结果时，交给本模块保存 */
  window.__quizSave = function (lvl, w) {
    QuizMem.save({ lvl: lvl, w: w, at: new Date().toLocaleString('zh-CN') });
  };

  /* =========================================================
     ⑭ 相关板块推荐（只在板块页生效）
     ========================================================= */
  (function () {
    var host = $('relatedBox');
    if (!host || !window.SECTOR) return;
    var me = window.SECTOR.id;
    var C = D.correlations;
    if (!C) return;

    var idx = C.secs.indexOf(me);
    if (idx < 0) return;

    /* 按相关系数排序，取最"不相关"（分散价值最高）和最"正相关"（可替代）各两个 */
    var peers = [];
    for (var i = 0; i < C.secs.length; i++) {
      if (i === idx) continue;
      peers.push({ id: C.secs[i], name: C.names[i], v: C.matrix[idx][i] });
    }
    var sorted = peers.slice().sort(function (a, b) { return a.v - b.v; });
    var diversify = sorted.slice(0, 2);            /* 负相关 → 分散最好 */
    var substit = sorted.slice(-2).reverse();      /* 正相关 → 最像 */

    var SEC_MAP = {};
    D.sectors.forEach(function (x) { SEC_MAP[x.sec] = x; });

    function card(p, kind) {
      var s = SEC_MAP[p.id] || {};
      var tone = p.v < -0.05 ? 'good' : (p.v > 0.4 ? 'warn' : '');
      var desc = p.v < -0.05
        ? '和本板块<b>负相关</b>，一起买能压低波动'
        : (p.v > 0.4 ? '和本板块<b>高度同涨同跌</b>，买它等于没分散'
          : '和本板块基本无关，分散有效');
      return '<a class="rel-card" href="' + p.name + '.html">' +
        '<div class="rel-top"><span class="rel-name">' + p.name + '</span>' +
        '<span class="rel-v ' + (p.v > 0 ? 'up' : 'down') + '">' + p.v.toFixed(2) + '</span></div>' +
        '<div class="rel-meta">近一年 ' + (s.arith !== undefined ? U.fmt(s.arith) : '—') +
        ' · 波动 ' + (s.vol !== undefined ? s.vol.toFixed(1) + '%' : '—') + '</div>' +
        '<div class="rel-desc">' + desc + '</div></a>';
    }

    host.innerHTML =
      '<div class="rel-group"><div class="rel-h">🔀 和它最"互补"的（分散价值高）</div>' +
      '<div class="rel-row">' + diversify.map(function (p) { return card(p); }).join('') + '</div></div>' +
      '<div class="rel-group"><div class="rel-h">🔁 和它最"像"的（可互相替代）</div>' +
      '<div class="rel-row">' + substit.map(function (p) { return card(p); }).join('') + '</div></div>';
  })();

  /* =========================================================
     注入「工具」导航菜单 —— 用户说"工具不明显"两次了，
     所以放到导航栏上（全站最显眼的位置），不用改 59 个 HTML。
     由本文件自动注入，一次改动全站生效。
     ========================================================= */
  (function () {
    var nav = document.querySelector('.nav');
    if (!nav) return;
    if (nav.querySelector('.nav-tools')) return;

    /* 判断当前是否在子目录（板块/ 或 基金详情/） */
    /* 判断相对前缀：直接读本文件的 script src。
       不能用 location.pathname —— file:// 下中文会被 URL 编码成 %E6%9D%BF%E5%9D%97，
       indexOf("/板块/") 永远匹配不到（这个坑踩过一次）。
       读 src 最可靠："_assets/tools.js" → 前缀 ''，  "../_assets/tools.js" → 前缀 '../' */
    var pre = '';
    var sels = document.getElementsByTagName('script');
    for (var si = 0; si < sels.length; si++) {
      var src = sels[si].getAttribute('src') || '';
      if (src.indexOf('tools.js') >= 0) {
        var dir = src.replace(/tools\.js([?#].*)?$/, '');   /* 去掉文件名 */
        pre = dir.replace(/_assets\/$/, '');                   /* 去掉 _assets/ */
        break;
      }
    }

    /* 分三组：管钱 / 挑选 / 记录验证 */
    var TOOLS = [
      { g: '管我的钱', n: '我的持仓', d: '记录你买了什么，算盈亏和占比', u: pre + '持仓跟踪.html', ic: '💼' },
      { g: '管我的钱', n: '再平衡提醒', d: '仓位偏了多少，该加该减哪只', u: pre + '再平衡.html', ic: '⚖' },
      { g: '管我的钱', n: '持仓体检', d: '一页纸报告，可打印可分享', u: pre + '体检报告.html', ic: '📋' },
      { g: '管我的钱', n: '定投计划表', d: '把方案变成能打勾的清单', u: pre + '定投计划.html', ic: '📅' },
      { g: '挑选工具', n: '宏观雷达', d: '现在什么环境，哪些板块敏感 + 今日财经要闻', u: pre + '宏观雷达.html', ic: '📡' },
      { g: '挑选工具', n: '板块轮动', d: 'RRG 四象限：钱正从哪流向哪', u: pre + '板块轮动.html', ic: '🔄' },
      { g: '挑选工具', n: '基金筛选器', d: '按条件从 64 只里挑', u: pre + '筛选器.html', ic: '🔍' },
      { g: '挑选工具', n: '任意对比', d: '跨板块比 2~4 只 + 相关性', u: pre + '对比器.html', ic: '⚖' },
      { g: '挑选工具', n: '定投计算器', d: '用真实净值算定投效果', u: pre + '定投计算器.html', ic: '📈' },
      { g: '挑选工具', n: '买入成本', d: '算手续费，看要涨多少才回本', u: pre + '买入成本.html', ic: '🧾' },
      { g: '挑选工具', n: '我的自选', d: '收藏的基金集中对比', u: pre + '自选清单.html', ic: '☰' },
      { g: '记录与验证', n: '决策日志', d: '记下当时为什么买，避免自我欺骗', u: pre + '决策日志.html', ic: '📓' },
      { g: '记录与验证', n: '数据校验', d: '当场重算 14 项，验证数据可信', u: pre + '数据校验.html', ic: '✓' }
    ];

    /* 高亮：当前页在工具里的话，给导航项加个标记 */
    var here = location.pathname.split('/').pop() || '';
    var isToolPage = TOOLS.some(function (t) {
      return t.u.replace('../', '') === here;
    });

    var wrap = document.createElement('div');
    wrap.className = 'nav-tools';

    var btn = document.createElement('button');
    btn.className = 'nt-btn' + (isToolPage ? ' active' : '');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '工具 <span class="nt-arrow">▾</span>';

    var panel = document.createElement('div');
    panel.className = 'nt-panel';
    var lastG = '';
    panel.innerHTML = TOOLS.map(function (t) {
      var head = '';
      if (t.g && t.g !== lastG) {
        head = '<div class="nt-group">' + t.g + '</div>';
        lastG = t.g;
      }
      return head +
        '<a class="nt-item" href="' + t.u + '">' +
        '<span class="nt-ic">' + t.ic + '</span>' +
        '<span class="nt-txt"><b>' + t.n + '</b><small>' + t.d + '</small></span>' +
        '</a>';
    }).join('') +
      '<div class="nt-foot">数据只在你自己电脑里，不上传不同步</div>';

    wrap.appendChild(btn);
    wrap.appendChild(panel);
    nav.appendChild(wrap);

    function toggle(open) {
      var on = open === undefined ? !wrap.classList.contains('open') : open;
      wrap.classList.toggle('open', on);
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle();
    });

    /* 点外部关闭 */
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) toggle(false);
    });

    /* ESC 关闭 */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') toggle(false);
    });

    /* 移动端：点链接后关闭 */
    Array.prototype.forEach.call(panel.querySelectorAll('.nt-item'), function (a) {
      a.addEventListener('click', function () { toggle(false); });
    });
  })();

  /* =========================================================
     注入右上角工具栏（主题 / PDF / CSV）
     ========================================================= */
  (function () {
    var bar = document.querySelector('.topbar-in');
    if (!bar) return;
    if ($('toolBox')) return;

    var box = document.createElement('div');
    box.className = 'tool-box';
    box.id = 'toolBox';
    box.innerHTML =
      '<button class="tool-btn" id="toolTheme" title="切换主题">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
      '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>' +
      '</svg><span class="tl-txt">亮色</span></button>' +
      '<button class="tool-btn" id="toolPdf" title="导出 PDF：打开干净打印视图，选「另存为 PDF」">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M6 9V3h12v6"/><rect x="4" y="13" width="16" height="8" rx="2"/><path d="M8 13v4M16 13v4"/></svg>' +
      '<span class="tl-txt">导出PDF</span></button>' +
      '<button class="tool-btn" id="toolCsv" title="导出 Excel（.xlsx）：全部基金/板块/组合/归因/相关性/行情，共 7 个表">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 19h16"/></svg>' +
      '<span class="tl-txt">导出Excel</span></button>';

    var nav = bar.querySelector('.nav');
    var trigger = bar.querySelector('.search-trigger');
    if (trigger && trigger.nextSibling) bar.insertBefore(box, trigger.nextSibling);
    else if (nav && nav.nextSibling) bar.insertBefore(box, nav.nextSibling);
    else bar.appendChild(box);

    $('toolTheme').addEventListener('click', Theme.toggle);
    $('toolPdf').addEventListener('click', exportPDF);
    $('toolCsv').addEventListener('click', exportCSV);
    Theme.syncBtn();
  })();

  /* 暴露给外部的自测保存钩子 */
  window.SiteTools = { theme: Theme, exportCSV: exportCSV, exportPDF: exportPDF };

})();
