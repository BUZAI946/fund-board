/* ===========================================================
   再平衡提醒
   读 localStorage 里的持仓 → 算实际占比 → 对比目标 → 算偏离 → 给建议
   目标配置可选预设（组合J / 自定模板）或手动调
   =========================================================== */
(function () {
  'use strict';
  var D = window.DATA, U = window.UI;
  if (!D || !U) return;

  var host = document.getElementById('rbSetup');
  if (!host) return;

  var HKEY = 'fundboard_holdings';
  var TKEY = 'fundboard_target';
  var F = D.funds || [];

  function getF(code) {
    for (var i = 0; i < F.length; i++) if (F[i].code === code) return F[i];
    return null;
  }
  function loadH() {
    try {
      var a = JSON.parse(localStorage.getItem(HKEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function loadT() {
    try {
      var a = JSON.parse(localStorage.getItem(TKEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function saveT(arr) {
    try { localStorage.setItem(TKEY, JSON.stringify(arr)); } catch (e) {}
  }

  /* ---------------- 持仓 → 按板块聚合的市值 ---------------- */
  function calcHoldings() {
    var list = loadH();
    var bySec = {}, total = 0;
    list.forEach(function (h) {
      var f = getF(h.code);
      if (!f) return;
      var val;
      if (h.mode === 'shares') {
        val = h.shares * (f.nav || 1);
      } else {
        var iBuy = 0, bd = Infinity;
        var axis = D.axis || [];
        var tg = +String(h.date || '').replace(/-/g, '');
        for (var i = 0; i < axis.length; i++) {
          var d = Math.abs(+axis[i].replace(/-/g, '') - tg);
          if (d < bd) { bd = d; iBuy = i; }
        }
        val = h.cost * (f.seq[f.seq.length - 1] / f.seq[iBuy]);
      }
      bySec[f.sec] = (bySec[f.sec] || 0) + val;
      total += val;
    });
    return { bySec: bySec, total: total, count: list.length };
  }

  /* ---------------- 目标配置 ---------------- */
  var PRESETS = {
    J: {
      name: '建议组合 J（本看板推荐）',
      t: [
        { sec: 'bonds', w: 25, note: '短债 25%（001512）' },
        { sec: 'bonds', w: 20, note: '纯债 20%（000015）' },
        { sec: 'bondl', w: 15, note: '长债 15%（003376）' },
        { sec: 'us', w: 20, note: '标普500 20%（050025）' },
        { sec: 'cash', w: 20, note: '现金 20%' }
      ]
    },
    cons: {
      name: '保守型（债 70 / 股 20 / 现金 10）',
      t: [
        { sec: 'bonds', w: 45, note: '短债' },
        { sec: 'bondl', w: 25, note: '长债' },
        { sec: 'ashare', w: 10, note: 'A股宽基' },
        { sec: 'us', w: 10, note: '美国股市' },
        { sec: 'cash', w: 10, note: '现金' }
      ]
    },
    bal: {
      name: '均衡型（股 50 / 债 30 / 商品 10 / 现金 10）',
      t: [
        { sec: 'bonds', w: 20, note: '短债' },
        { sec: 'bondl', w: 10, note: '长债' },
        { sec: 'ashare', w: 20, note: 'A股宽基' },
        { sec: 'us', w: 15, note: '美国股市' },
        { sec: 'hk', w: 5, note: '中国香港' },
        { sec: 'dividend', w: 10, note: '红利低波' },
        { sec: 'gold', w: 10, note: '黄金' },
        { sec: 'cash', w: 10, note: '现金' }
      ]
    },
    aggr: {
      name: '激进型（股 80 / 商品 10 / 现金 10）',
      t: [
        { sec: 'ashare', w: 30, note: 'A股宽基' },
        { sec: 'us', w: 25, note: '美国股市' },
        { sec: 'hk', w: 10, note: '中国香港' },
        { sec: 'sector', w: 10, note: '行业主题' },
        { sec: 'emerging', w: 5, note: '新兴市场' },
        { sec: 'gold', w: 10, note: '黄金' },
        { sec: 'cash', w: 10, note: '现金' }
      ]
    }
  };

  var SECNAMES = {};
  (D.sectors || []).forEach(function (s) { SECNAMES[s.sec] = s.name; });
  SECNAMES['cash'] = '货币';

  var target = loadT();     /* [{sec, w}] */
  var hold = calcHoldings();

  /* 目标按板块合并（J 里 bonds 出现两次） */
  function normTarget() {
    var m = {};
    target.forEach(function (x) {
      m[x.sec] = (m[x.sec] || 0) + x.w;
    });
    var sum = Object.keys(m).reduce(function (a, k) { return a + m[k]; }, 0);
    var out = Object.keys(m).map(function (k) {
      return { sec: k, w: m[k] / sum * 100 };
    }).sort(function (a, b) { return b.w - a.w; });
    return out;
  }

  /* ---------------- 渲染设置 ---------------- */
  function renderSetup() {
    var noHold = hold.total <= 0;
    var html = '<div class="rb-setup">';

    /* 持仓状态 */
    html += '<div class="rb-row"><label>你的持仓</label><div class="rb-inline">';
    if (noHold) {
      html += '<span class="rb-warn">还没有录入持仓</span>' +
        '<a class="btn" href="持仓跟踪.html">去录入 →</a>';
    } else {
      html += '<span class="rb-ok">已录入 <b class="n">' + hold.count + '</b> 笔，' +
        '总市值 <b class="n">' + U.comma(hold.total) + '</b> 元</span>' +
        '<a class="btn" href="持仓跟踪.html">编辑持仓</a>';
    }
    html += '</div></div>';

    /* 目标配置预设 */
    html += '<div class="rb-row"><label>目标配置</label><div class="rb-chips">' +
      Object.keys(PRESETS).map(function (k) {
        return '<button class="rb-chip" data-preset="' + k + '">' +
          U.esc(PRESETS[k].name) + '</button>';
      }).join('') + '</div></div>';

    /* 当前目标明细 */
    if (target.length) {
      var nt = normTarget();
      html += '<div class="rb-row"><label>当前目标</label><div class="rb-target">' +
        nt.map(function (x) {
          return '<span class="rb-tchip">' + U.esc(SECNAMES[x.sec] || x.sec) +
            ' <b class="n">' + x.w.toFixed(0) + '</b>%</span>';
        }).join('') +
        '</div></div>';
    } else {
      html += '<div class="rb-row"><label></label><div class="rb-inline">' +
        '<span class="rb-warn">还没设目标配置，先点上面任一预设</span></div></div>';
    }

    html += '</div>';
    host.innerHTML = html;

    /* 绑定 */
    Array.prototype.forEach.call(host.querySelectorAll('[data-preset]'), function (b) {
      b.addEventListener('click', function () {
        var p = PRESETS[b.getAttribute('data-preset')];
        target = p.t.map(function (x) { return { sec: x.sec, w: x.w }; });
        saveT(target);
        renderAll();
      });
    });
  }

  /* ---------------- 偏离表 ---------------- */
  function renderDrift() {
    var host = document.getElementById('rbDrift');
    if (!host) return;

    if (!target.length || hold.total <= 0) {
      host.innerHTML = '<div class="sim-empty">' +
        (!target.length ? '先选一个目标配置' : '先录入你的持仓') +
        '，才能算偏离。</div>';
      return;
    }

    var nt = normTarget();
    var actual = {};
    Object.keys(hold.bySec).forEach(function (k) {
      actual[k] = hold.bySec[k] / hold.total * 100;
    });

    /* 合并所有出现过的板块 */
    var all = {};
    nt.forEach(function (x) { all[x.sec] = true; });
    Object.keys(actual).forEach(function (k) { all[k] = true; });

    var rows = Object.keys(all).map(function (k) {
      var t = 0, a = actual[k] || 0;
      nt.forEach(function (x) { if (x.sec === k) t = x.w; });
      return { sec: k, name: SECNAMES[k] || k, target: t, actual: a, drift: a - t };
    }).sort(function (x, y) { return Math.abs(y.drift) - Math.abs(x.drift); });

    var maxAbs = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.drift); })) || 1;

    var h = '<div class="rb-drift-head">' +
      '<span class="rdh-lbl">板块</span>' +
      '<span class="rdh-lbl">目标</span>' +
      '<span class="rdh-lbl">实际</span>' +
      '<span class="rdh-lbl rdh-drift">偏离</span>' +
      '<span class="rdh-bar"></span>' +
      '<span class="rdh-lbl rdh-note">判断</span>' +
      '</div>';

    rows.forEach(function (r) {
      var d = r.drift;
      var abs = Math.abs(d);
      var flag, tone;
      if (abs < 2) { flag = '正常'; tone = 'mute'; }
      else if (abs < 5) { flag = '轻微'; tone = 'mute'; }
      else if (abs < 15) { flag = d > 0 ? '偏多，该减' : '偏少，该加'; tone = d > 0 ? 'up' : 'down'; }
      else { flag = d > 0 ? '严重偏多' : '严重偏少'; tone = 'warn'; }

      h += '<div class="rb-drift-row">' +
        '<span class="rbr-name">' + U.esc(r.name) + '</span>' +
        '<span class="rbr-val">' + r.target.toFixed(0) + '%</span>' +
        '<span class="rbr-val">' + r.actual.toFixed(1) + '%</span>' +
        '<span class="rbr-drift ' + tone + '">' +
          (d > 0 ? '+' : '') + d.toFixed(1) + 'pp</span>' +
        '<span class="rbr-bar"><i style="width:' + (abs / maxAbs * 100) +
          '%;background:' + (d > 0 ? '#ff4d5e' : '#00c58e') + '"></i></span>' +
        '<span class="rbr-flag ' + tone + '">' + flag + '</span>' +
        '</div>';
    });

    host.innerHTML = h;

    /* 汇总判断 */
    var serious = rows.filter(function (r) { return Math.abs(r.drift) >= 5; });
    var sum = '<div class="rb-verdict ' + (serious.length ? 'warn' : 'ok') + '">';
    if (!serious.length) {
      sum += '<b>✅ 没有偏离超过 5 个百分点的板块，不需要动手。</b>' +
        '再平衡的价值在于"别让它偏到离谱"，不是为了每天微调。';
    } else if (serious.length <= 2) {
      sum += '<b>有 ' + serious.length + ' 个板块偏离超过 5 个百分点：' +
        serious.map(function (r) {
          return U.esc(r.name) + '（' + (r.drift > 0 ? '+' : '') + r.drift.toFixed(1) + 'pp）';
        }).join('、') + '</b><br>' +
        '建议先调整偏离最大的那一两个，<b>每次只动 1~2 项就够</b>，不要全部推倒重来。';
    } else {
      sum += '<b>⚠️ 有 ' + serious.length + ' 个板块偏离超过 5 个百分点，偏离比较多。</b><br>' +
        '可能的原因：① 很久没再平衡了；② 目标配置本身不适合你的实际持仓；' +
        '③ 某类资产涨跌太多。<b>先确认是哪一种，再决定动不动手。</b>';
    }
    sum += '</div>';
    host.innerHTML += sum;
  }

  /* ---------------- 操作建议 ---------------- */
  function renderAction() {
    var host = document.getElementById('rbAction');
    var box = document.getElementById('rbActionBox');
    if (!host) return;

    if (!target.length || hold.total <= 0) {
      if (box) box.style.display = 'none';
      return;
    }
    if (box) box.style.display = '';

    var nt = normTarget();
    var actual = {};
    Object.keys(hold.bySec).forEach(function (k) {
      actual[k] = hold.bySec[k] / hold.total * 100;
    });

    var acts = [];
    nt.forEach(function (x) {
      var a = actual[x.sec] || 0;
      var d = a - x.w;
      if (Math.abs(d) < 5) return;
      var money = Math.abs(d) / 100 * hold.total;
      acts.push({
        sec: x.sec, name: SECNAMES[x.sec] || x.sec,
        target: x.w, actual: a, drift: d,
        money: money, action: d > 0 ? '减' : '加'
      });
    });

    if (!acts.length) {
      host.innerHTML = '<div class="rb-noaction">' +
        '<b>✅ 所有板块偏离都在 5 个百分点以内，现在不需要操作。</b><br>' +
        '下一步：<b>每季度复查一次</b>，或者等你继续定投、仓位自然变化后再看。' +
        '</div>';
      return;
    }

    acts.sort(function (a, b) { return Math.abs(b.drift) - Math.abs(a.drift); });

    var totalMove = acts.reduce(function (a, x) { return a + x.money; }, 0) / 2;

    var h = '<div class="rb-act-intro">' +
      '按当前总市值 <b class="n">' + U.comma(hold.total) + '</b> 元计算，' +
      '需要调整约 <b class="n">' + U.comma(totalMove) + '</b> 元。' +
      '</div>';

    h += '<div class="rb-acts">';
    acts.forEach(function (x) {
      var tone = x.action === '减' ? 'up' : 'down';
      /* 该板块里有哪几只可选 */
      var cands = F.filter(function (f) { return f.sec === x.sec; })
        .sort(function (a, b) { return b.ret250 - a.ret250; }).slice(0, 3);

      h += '<div class="rb-act ' + tone + '">' +
        '<div class="rba-head">' +
          '<span class="rba-badge ' + tone + '">' + x.action + '</span>' +
          '<span class="rba-sec">' + U.esc(x.name) + '</span>' +
          '<b class="rba-money">' + U.comma(x.money) + ' 元</b>' +
        '</div>' +
        '<div class="rba-kv">目标 ' + x.target.toFixed(0) + '% → 实际 ' +
          x.actual.toFixed(1) + '%（偏离 ' + (x.drift > 0 ? '+' : '') +
          x.drift.toFixed(1) + 'pp）</div>' +
        (cands.length
          ? '<div class="rba-cands">可操作：' + cands.map(function (f) {
              return '<a class="fund-link" href="基金详情/' + f.code + '.html">' +
                U.esc(f.name.slice(0, 12)) + '</a>';
            }).join(' · ') + '</div>'
          : '') +
        '</div>';
    });
    h += '</div>';

    h += '<div class="note" style="margin-top:16px;margin-bottom:0">' +
      '<b>💡 优先用"新钱"补，而不是卖。</b><br>' +
      '如果你还在定投，把新投的钱<b>全部投向"偏少"的那一块</b>，' +
      '比卖掉"偏多"的更省事——<b>卖出要交赎回费，还可能踩到 7 天内 1.5% 的惩罚费率</b>。<br>' +
      '<b style="color:#f5b942">只有偏离超过 15 个百分点时，才值得动用卖出的手。</b>' +
      '</div>';

    host.innerHTML = h;
  }

  function renderAll() {
    hold = calcHoldings();
    renderSetup();
    renderDrift();
    renderAction();
  }

  renderAll();
})();
