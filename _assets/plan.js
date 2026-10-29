/* ===========================================================
   定投计划表
   设金额 + 周期 + 标的配比 → 生成可执行清单（可打勾）
   记录存 localStorage：fundboard_dcaplan
   =========================================================== */
(function () {
  'use strict';
  var D = window.DATA, U = window.UI;
  if (!D || !U) return;

  var host = document.getElementById('plSetup');
  if (!host) return;

  var KEY = 'fundboard_dcaplan';
  var F = D.funds || [];
  var SECNAMES = {};
  (D.sectors || []).forEach(function (s) { SECNAMES[s.sec] = s.name; });
  SECNAMES['cash'] = '货币';

  function getF(code) {
    for (var i = 0; i < F.length; i++) if (F[i].code === code) return F[i];
    return null;
  }
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || 'null');
      return o && typeof o === 'object' ? o : null;
    } catch (e) { return null; }
  }
  function save(o) {
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  }

  /* ---------------- 状态 ---------------- */
  var cfg = load() || {
    amount: 1000,
    freq: 'month',      /* month / week */
    day: 10,            /* 每月几号 / 每周几 */
    start: '',
    months: 12,
    legs: [
      { code: '001512', w: 45 },
      { code: '050025', w: 35 },
      { code: '000217', w: 20 }
    ],
    done: []            /* 已完成的期号 */
  };
  if (!cfg.done) cfg.done = [];

  /* 起始日默认下个月 1 号 */
  if (!cfg.start) {
    var d = new Date();
    d.setMonth(d.getMonth() + 1, 1);
    cfg.start = d.getFullYear() + '-' +
      ('0' + (d.getMonth() + 1)).slice(-2) + '-01';
  }

  var FREQ_NAME = { month: '每月', week: '每周' };
  var WEEK_NAME = ['日', '一', '二', '三', '四', '五', '六'];

  /* ---------------- 生成日期序列 ---------------- */
  function genDates() {
    var out = [];
    var p = cfg.start.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);

    if (cfg.freq === 'month') {
      var n = Math.max(1, Math.min(60, cfg.months));
      for (var i = 0; i < n; i++) {
        var dd = new Date(d.getFullYear(), d.getMonth() + i, 1);
        var maxDay = new Date(dd.getFullYear(), dd.getMonth() + 1, 0).getDate();
        dd.setDate(Math.min(cfg.day, maxDay));
        out.push({
          i: i + 1,
          date: dd.getFullYear() + '-' + ('0' + (dd.getMonth() + 1)).slice(-2) +
            '-' + ('0' + dd.getDate()).slice(-2),
          label: (dd.getMonth() + 1) + '月'
        });
      }
    } else {
      var n2 = Math.max(1, Math.min(120, cfg.months * 4));
      for (var j = 0; j < n2; j++) {
        var t = new Date(d.getTime() + j * 7 * 86400000);
        out.push({
          i: j + 1,
          date: t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) +
            '-' + ('0' + t.getDate()).slice(-2),
          label: (t.getMonth() + 1) + '/' + t.getDate()
        });
      }
    }
    return out;
  }

  /* ---------------- 设置区 ---------------- */
  function renderSetup() {
    var html = '<div class="pl-setup">';

    /* 金额 + 周期 */
    html += '<div class="pl-row"><label>每期投入</label><div class="pl-inline">' +
      '<input type="number" class="sc-input" id="plAmt" value="' + cfg.amount +
        '" min="100" step="100" style="width:110px"> <span class="sc-hint">元</span>' +
      '<span class="pl-presets">' +
        [500, 1000, 2000, 5000].map(function (v) {
          return '<button class="pl-pre' + (cfg.amount === v ? ' on' : '') +
            '" data-amt="' + v + '">' + U.comma(v) + '</button>';
        }).join('') +
      '</span></div></div>';

    html += '<div class="pl-row"><label>频率</label><div class="pl-inline">' +
      '<span class="pl-presets">' +
        '<button class="pl-pre' + (cfg.freq === 'month' ? ' on' : '') + '" data-freq="month">每月</button>' +
        '<button class="pl-pre' + (cfg.freq === 'week' ? ' on' : '') + '" data-freq="week">每周</button>' +
      '</span>' +
      '<span class="sc-hint">每' + (cfg.freq === 'month' ? '月' : '周') + '</span>' +
      (cfg.freq === 'month'
        ? '<input type="number" class="sc-input" id="plDay" value="' + cfg.day +
          '" min="1" max="28" style="width:66px"> <span class="sc-hint">号（建议发工资后 2~3 天，1~28 号）</span>'
        : '<select class="sc-input" id="plDayW" style="width:auto">' +
          WEEK_NAME.map(function (w, i) {
            return '<option value="' + i + '"' + (cfg.day === i ? ' selected' : '') +
              '>周' + w + '</option>';
          }).join('') + '</select>') +
      '</div></div>';

    html += '<div class="pl-row"><label>开始日期</label><div class="pl-inline">' +
      '<input type="date" class="sc-input" id="plStart" value="' + cfg.start +
        '" style="width:150px">' +
      '<span class="sc-hint">共投</span>' +
      '<input type="number" class="sc-input" id="plMonths" value="' + cfg.months +
        '" min="1" max="60" style="width:66px"> <span class="sc-hint">' +
        (cfg.freq === 'month' ? '个月' : '个月（约 ' + (cfg.months * 4) + ' 期）') + '</span>' +
      '</div></div>';

    /* 标的配比 */
    html += '<div class="pl-row"><label>投什么</label><div class="pl-legs" id="plLegs">';
    var wsum = cfg.legs.reduce(function (a, x) { return a + x.w; }, 0) || 1;
    cfg.legs.forEach(function (leg, idx) {
      var f = getF(leg.code);
      if (!f) return;
      var pct = leg.w / wsum * 100;
      var money = Math.round(cfg.amount * leg.w / wsum);
      html += '<div class="pl-leg">' +
        '<div class="pll-top">' +
          '<span class="pll-name">' + U.esc(f.name.slice(0, 14)) +
            ' <span class="tcode">' + f.code + '</span></span>' +
          '<button class="pll-del" data-del="' + idx + '">×</button>' +
        '</div>' +
        '<div class="pll-mid">' +
          '<input type="range" class="sc-range pll-range" data-leg="' + idx +
            '" min="0" max="100" step="5" value="' + Math.round(pct) + '">' +
          '<b class="pll-pct">' + pct.toFixed(0) + '%</b>' +
        '</div>' +
        '<div class="pll-bot">每期 <b class="n">' + U.comma(money) + '</b> 元 · ' +
          U.esc(f.secName) + '</div>' +
        '</div>';
    });
    html += '<button class="cmp-add" id="plAddLeg" style="min-height:96px">+ 加一只</button>';
    html += '</div></div>';

    /* 加基金下拉 */
    html += '<div class="pl-row"><label></label><div class="pl-inline">' +
      '<select class="sim-select" id="plNewCode" style="max-width:320px">' +
      '<option value="">+ 选择一只加入计划…</option>' +
      F.slice().sort(function (a, b) { return b.ret250 - a.ret250; }).map(function (f) {
        var has = cfg.legs.some(function (x) { return x.code === f.code; });
        return '<option value="' + f.code + '"' + (has ? ' disabled' : '') + '>' +
          f.code + ' ' + f.name.slice(0, 18) + (has ? ' 已加' : '') + '</option>';
      }).join('') + '</select></div></div>';

    /* 汇总 */
    var dates = genDates();
    var per = cfg.amount;
    var total = per * dates.length;
    html += '<div class="pl-sum">' +
      '<div class="pls-item"><span>每期</span><b class="n">' + U.comma(per) + '</b><small>元</small></div>' +
      '<div class="pls-item"><span>期数</span><b class="n">' + dates.length + '</b><small>期</small></div>' +
      '<div class="pls-item pls-hl"><span>累计投入</span><b class="n">' +
        U.comma(total) + '</b><small>元</small></div>' +
      '<div class="pls-item"><span>已完成</span><b class="n">' +
        cfg.done.length + '</b><small>期</small></div>' +
      '</div>';

    html += '<div class="pl-actions">' +
      '<button class="btn on" id="plSave">保存计划</button>' +
      (cfg.done.length ? '<button class="btn" id="plResetDone">清空打勾记录</button>' : '') +
      '</div>';

    html += '</div>';
    host.innerHTML = html;
    bindSetup();
  }

  function bindSetup() {
    function upd(key, val, rebuild) {
      cfg[key] = val;
      save(cfg);
      if (rebuild) renderAll(); else { renderSetup(); renderTable(); }
    }

    var a = document.getElementById('plAmt');
    if (a) a.addEventListener('input', function () {
      var v = +a.value;
      if (!isNaN(v) && v > 0) { cfg.amount = v; save(cfg); renderTable(); }
    });

    var dy = document.getElementById('plDay');
    if (dy) dy.addEventListener('input', function () {
      var v = Math.max(1, Math.min(28, +dy.value || 1));
      cfg.day = v; save(cfg); renderTable();
    });

    var dyw = document.getElementById('plDayW');
    if (dyw) dyw.addEventListener('change', function () {
      cfg.day = +dyw.value; save(cfg); renderTable();
    });

    var st = document.getElementById('plStart');
    if (st) st.addEventListener('change', function () {
      cfg.start = st.value; save(cfg); renderTable();
      renderSetup();
    });

    var mo = document.getElementById('plMonths');
    if (mo) mo.addEventListener('input', function () {
      var v = Math.max(1, Math.min(60, +mo.value || 1));
      cfg.months = v; save(cfg); renderTable();
      renderSetup();
    });

    Array.prototype.forEach.call(host.querySelectorAll('[data-amt]'), function (b) {
      b.addEventListener('click', function () {
        upd('amount', +b.getAttribute('data-amt'), true);
      });
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-freq]'), function (b) {
      b.addEventListener('click', function () {
        upd('freq', b.getAttribute('data-freq'), true);
      });
    });

    /* 配比滑块 */
    Array.prototype.forEach.call(host.querySelectorAll('.pll-range'), function (r) {
      r.addEventListener('input', function () {
        var idx = +r.getAttribute('data-leg');
        if (cfg.legs[idx]) {
          cfg.legs[idx].w = +r.value;
          save(cfg);
          renderSetup();
          renderTable();
        }
      });
    });

    /* 删除标的 */
    Array.prototype.forEach.call(host.querySelectorAll('[data-del]'), function (b) {
      b.addEventListener('click', function () {
        var idx = +b.getAttribute('data-del');
        cfg.legs.splice(idx, 1);
        save(cfg);
        renderAll();
      });
    });

    /* 加标的 */
    var nw = document.getElementById('plNewCode');
    if (nw) nw.addEventListener('change', function () {
      if (!nw.value) return;
      cfg.legs.push({ code: nw.value, w: 20 });
      save(cfg);
      renderAll();
    });

    var sv = document.getElementById('plSave');
    if (sv) sv.addEventListener('click', function () {
      save(cfg);
      sv.textContent = '✓ 已保存';
      setTimeout(function () { sv.textContent = '保存计划'; }, 1500);
    });

    var rd = document.getElementById('plResetDone');
    if (rd) rd.addEventListener('click', function () {
      if (confirm('清空所有打勾记录？')) { cfg.done = []; save(cfg); renderAll(); }
    });
  }

  /* ---------------- 计划表 ---------------- */
  function renderTable() {
    var host2 = document.getElementById('plTable');
    var box = document.getElementById('plTableBox');
    if (!host2) return;

    if (!cfg.legs.length) {
      host2.innerHTML = '<div class="sim-empty">先添加至少一只基金。</div>';
      return;
    }
    if (box) box.style.display = '';

    var dates = genDates();
    var wsum = cfg.legs.reduce(function (a, x) { return a + x.w; }, 0) || 1;

    var h = '<div class="pl-table-wrap"><table class="dca-t2 pl-tbl"><thead><tr>' +
      '<th class="left" style="width:44px">✓</th>' +
      '<th class="left">期</th>' +
      '<th class="left">日期</th>' +
      '<th>金额</th>' +
      cfg.legs.map(function (leg) {
        var f = getF(leg.code);
        return '<th>' + (f ? U.esc(f.name.slice(0, 8)) : leg.code) + '</th>';
      }).join('') +
      '</tr></thead><tbody>';

    dates.forEach(function (d) {
      var isDone = cfg.done.indexOf(d.i) >= 0;
      h += '<tr class="' + (isDone ? 'pl-done' : '') + '">' +
        '<td class="left"><input type="checkbox" class="pl-check" data-i="' + d.i + '"' +
          (isDone ? ' checked' : '') + '></td>' +
        '<td class="left">' + d.i + '</td>' +
        '<td class="left dca-date">' + d.date + '</td>' +
        '<td>' + U.comma(cfg.amount) + '</td>' +
        cfg.legs.map(function (leg) {
          var money = Math.round(cfg.amount * leg.w / wsum);
          return '<td>' + U.comma(money) + '</td>';
        }).join('') +
        '</tr>';
    });

    /* 合计 */
    h += '<tr class="dca-sum">' +
      '<td class="left" colspan="3">合计 ' + dates.length + ' 期</td>' +
      '<td>' + U.comma(cfg.amount * dates.length) + '</td>' +
      cfg.legs.map(function (leg) {
        var money = Math.round(cfg.amount * leg.w / wsum);
        return '<td>' + U.comma(money * dates.length) + '</td>';
      }).join('') +
      '</tr>';

    host2.innerHTML = h + '</tbody></table></div>';

    Array.prototype.forEach.call(host2.querySelectorAll('.pl-check'), function (c) {
      c.addEventListener('change', function () {
        var i = +c.getAttribute('data-i');
        var idx = cfg.done.indexOf(i);
        if (c.checked && idx < 0) cfg.done.push(i);
        else if (!c.checked && idx >= 0) cfg.done.splice(idx, 1);
        save(cfg);
        var row = c.closest('tr');
        if (row) row.className = c.checked ? 'pl-done' : '';
        /* 更新已完成计数 */
        var all = host.querySelectorAll('.pls-item b');
        if (all[3]) all[3].textContent = cfg.done.length;
      });
    });
  }

  function renderAll() {
    renderSetup();
    renderTable();
  }

  renderAll();
})();
