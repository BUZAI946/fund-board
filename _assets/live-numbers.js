/* ===========================================================
   动态数字绑定（自动化更新的前提）
   ---------------------------------------------------------------
   问题：页面文案里写死了"黄金 -10.84%"这类数字。每天数据一变，
        文案就和表格对不上，用户会看到自相矛盾的两个数。
   解法：把数字包成 <span data-live="...">旧值</span>，
        本文件在加载时用 DATA 里的真实值覆盖它。

   支持的值类型（data-live 的写法）：
     sec.<key>          板块算术平均收益，如 sec.gold
     secvol.<key>       板块平均波动率
     grp.<key>          大类平均收益，如 grp.stock
     plan.<key>         组合收益，如 plan.J
     fund.<code>.ret    单只基金近250日
     其他自定义在下方 map 里扩展

   格式：默认输出 +X.XX% / -X.XX%，并自动加涨/跌色 class。
        加 data-fmt="nopercent" 只出数字；data-fmt="abs" 出绝对值。
   =========================================================== */
(function () {
  'use strict';
  var D = window.DATA;
  if (!D) return;

  /* ---------------- 取值映射 ---------------- */
  var SEC = {}, SECVOL = {}, SECN = {}, SECFULL = {}, GRP = {}, PLAN = {}, FUND = {};
  (D.sectors || []).forEach(function (s) {
    SEC[s.sec] = s.arith;
    SECVOL[s.sec] = s.vol;
    SECN[s.sec] = s.n;
    SECFULL[s.sec] = s;   /* 整个板块对象，供 sec.<key>.spread 等路径用 */
  });
  (D.funds || []).forEach(function (f) {
    FUND[f.code] = f;
  });
  Object.keys(D.groups || {}).forEach(function (g) {
    GRP[g] = D.groups[g].avg;
  });
  Object.keys(D.plans || {}).forEach(function (k) {
    PLAN[k] = D.plans[k].r250;
  });

  /* 衍生值（一次性算好） */
  var DERIVED = {};
  (function () {
    var S = D.sectors || [];
    if (!S.length) return;
    var sorted = S.slice().sort(function (a, b) { return b.arith - a.arith; });
    DERIVED.bestSec = sorted[0];
    DERIVED.worstSec = sorted[sorted.length - 1];
    DERIVED.spread = sorted[0].arith - sorted[sorted.length - 1].arith;
    DERIVED.posCount = S.filter(function (x) { return x.arith > 0; }).length;

    var volSorted = S.slice().sort(function (a, b) { return a.vol - b.vol; });
    DERIVED.lowVolSec = volSorted[0];
    DERIVED.highVolSec = volSorted[volSorted.length - 1];

    var F = D.funds || [];
    if (F.length) {
      var fr = F.slice().sort(function (a, b) { return b.ret250 - a.ret250; });
      DERIVED.bestFund = fr[0];
      DERIVED.worstFund = fr[fr.length - 1];
      var md = F.slice().sort(function (a, b) { return a.mddAll - b.mddAll; });
      DERIVED.worstMddFund = md[0];
    }
  })();

  /* 大类里"最惨个基"的回撤（groups 可能没直接给，从 funds 算） */
  function g4mdd(g) {
    if (g.mddWorst !== undefined) return g.mddWorst;
    var secs = g.secs || [];
    var worst = 0;
    (D.funds || []).forEach(function (f) {
      if (secs.indexOf(f.sec) >= 0 && f.mddAll < worst) worst = f.mddAll;
    });
    return worst;
  }

  function lookup(path) {
    var p = path.split('.');

    /* ---- 数量类（不格式化，直接输出整数）---- */
    if (path === 'totals.funds') return (D.funds || []).length;
    if (path === 'totals.sectors') return (D.sectors || []).length;
    if (path === 'totals.sectorsAll') return (D.sectors || []).length + 1;  /* +1 = 货币页 */
    if (path === 'totals.cash') return (D.cash || []).length;

    if (p[0] === 'grp' && p[2] === 'n') {
      var g = D.groups && D.groups[p[1]];
      return g ? (g.n || 0) : null;
    }
    if (p[0] === 'grp' && p[2] === 'nSec') {
      var g2 = D.groups && D.groups[p[1]];
      return g2 ? (g2.nSec || 0) : null;
    }
    if (p[0] === 'grp' && p[2] === 'vol') {
      var g3 = D.groups && D.groups[p[1]];
      return g3 ? g3.vol : null;
    }
    if (p[0] === 'grp' && p[2] === 'worst') {
      var g4 = D.groups && D.groups[p[1]];
      return g4 ? g4.worst : null;
    }
    if (p[0] === 'grp' && p[2] === 'mdd') {
      var g5 = D.groups && D.groups[p[1]];
      return g5 ? g4mdd(g5) : null;
    }
    if (p[0] === 'sec' && p[2] === 'n') {
      var sec = SECN[p[1]];
      return sec === undefined ? null : sec;
    }
    /* 板块的其它指标（极差/波动/回撤/最好/最差）
       之前缺这些，导致页面写"极差 18.30"这类数字没法动态化，
       数据一变就和表格对不上。 */
    if (p[0] === 'sec' && p[2]) {
      var full = SECFULL[p[1]];
      if (full && full[p[2]] !== undefined) return full[p[2]];
    }

    if (p[0] === 'sec' && p[1] in SEC) return SEC[p[1]];
    if (p[0] === 'secvol' && p[1] in SECVOL) return SECVOL[p[1]];
    if (p[0] === 'grp' && GRP[p[1]] !== undefined) return GRP[p[1]];
    if (p[0] === 'plan' && PLAN[p[1]] !== undefined) return PLAN[p[1]];
    if (p[0] === 'fund' && FUND[p[1]] && p[2]) return FUND[p[1]][p[2]];
    /* 衍生 */
    if (path === 'derived.spread') return DERIVED.spread;
    if (path === 'derived.spreadAbs') return DERIVED.spread;
    if (path === 'derived.posCount') return DERIVED.posCount;
    if (path === 'derived.bestSecArith' && DERIVED.bestSec) return DERIVED.bestSec.arith;
    if (path === 'derived.worstSecArith' && DERIVED.worstSec) return DERIVED.worstSec.arith;
    if (path === 'derived.bestFundRet' && DERIVED.bestFund) return DERIVED.bestFund.ret250;
    if (path === 'derived.worstFundRet' && DERIVED.worstFund) return DERIVED.worstFund.ret250;
    if (path === 'derived.worstMdd' && DERIVED.worstMddFund) return DERIVED.worstMddFund.mddAll;
    if (path === 'derived.lowVol' && DERIVED.lowVolSec) return DERIVED.lowVolSec.vol;
    if (path === 'derived.highVol' && DERIVED.highVolSec) return DERIVED.highVolSec.vol;
    return null;
  }

  function fmt(v, el) {
    if (v === null || v === undefined || isNaN(v)) return null;
    var mode = el.getAttribute('data-fmt') || '';
    var dec = el.getAttribute('data-dec');
    var d = dec === null ? 2 : +dec;

    if (mode === 'abs') {
      return Math.abs(v).toFixed(d) + (mode.indexOf('nopercent') >= 0 ? '' : '%');
    }
    if (mode === 'nopercent') {
      return (v > 0 ? '+' : '') + v.toFixed(d);
    }
    if (mode === 'plain') {
      return v.toFixed(d);
    }
    if (mode === 'count') {
      /* 数量：整数 + 可选后缀 */
      var suf = el.getAttribute('data-suffix') || '';
      return Math.round(v) + suf;
    }
    /* 默认：带符号的百分比（用普通减号，不用 Unicode 负号） */
    return (v > 0 ? '+' : (v < 0 ? '-' : '')) + Math.abs(v).toFixed(d) + '%';
  }

  /* 涨跌色：中国习惯 涨红跌绿 */
  function applyColor(el, v) {
    if (el.getAttribute('data-nocolor') !== null) return;
    var cls = el.className || '';
    /* 已明确指定了颜色 class 就不覆盖 */
    if (/\b(up|down|mute)\b/.test(cls)) {
      /* 但如果值和 class 矛盾，以数据为准 */
      var shouldUp = v > 0.0001, shouldDown = v < -0.0001;
      var hasUp = /\bup\b/.test(cls), hasDown = /\bdown\b/.test(cls);
      if ((shouldUp && hasDown) || (shouldDown && hasUp)) {
        el.className = cls.replace(/\b(up|down|mute)\b/g, '').trim() +
          ' ' + (shouldUp ? 'up' : (shouldDown ? 'down' : 'mute'));
      }
      return;
    }
    if (v > 0.0001) el.className = (cls + ' up').trim();
    else if (v < -0.0001) el.className = (cls + ' down').trim();
  }

  /* ---------------- 执行填充 ---------------- */
  var filled = 0, missed = [];

  function fillAll() {
    var nodes = document.querySelectorAll('[data-live]');
    Array.prototype.forEach.call(nodes, function (el) {
      var path = el.getAttribute('data-live');
      var v = lookup(path);
      if (v === null || v === undefined) { missed.push(path); return; }
      var txt = fmt(v, el);
      if (txt === null) { missed.push(path); return; }
      el.textContent = txt;
      applyColor(el, v);
      filled++;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fillAll);
  } else {
    fillAll();
  }

  /* 调试用：控制台可查 */
  window.LiveNumbers = {
    fill: fillAll,
    filled: function () { return filled; },
    missed: function () { return missed; },
    lookup: lookup,
    derived: DERIVED
  };
})();
