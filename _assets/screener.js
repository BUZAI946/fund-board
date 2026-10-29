/* ===========================================================
   基金筛选器
   所有条件都是「与」关系。实时出结果。
   =========================================================== */
(function () {
  'use strict';
  var D = window.DATA, U = window.UI;
  if (!D || !U) return;

  var formHost = document.getElementById('scForm');
  var tableHost = document.getElementById('scTable');
  if (!formHost) return;

  var F = D.funds || [];
  var SECS = (D.sectors || []).slice().sort(function (a, b) { return b.arith - a.arith; });
  var GRPS = D.groups || {};

  /* ---------------- 条件状态 ---------------- */
  var st = {
    secs: [],          /* 空数组 = 不限 */
    grps: [],
    retMin: null, retMax: null,
    volMax: null,      /* 默认不限，让用户自己收紧 */
    mddMax: null,
    sharpeMin: null,
    holdMin: null,     /* 持有250天胜率下限 */
    noDiv: false,      /* 只要没分过红的（口径更干净） */
    scaleMin: null
  };

  var ALL_SEC_META = {};
  SECS.forEach(function (s) { ALL_SEC_META[s.sec] = s; });

  /* ---------------- 筛选 ---------------- */
  function filter() {
    return F.filter(function (f) {
      if (st.secs.length && st.secs.indexOf(f.sec) < 0) return false;
      if (st.grps.length && st.grps.indexOf(f.grp) < 0) return false;
      if (st.retMin !== null && f.ret250 < st.retMin) return false;
      if (st.retMax !== null && f.ret250 > st.retMax) return false;
      if (st.volMax !== null && f.vol > st.volMax) return false;
      if (st.mddMax !== null && Math.abs(f.mddAll) > st.mddMax) return false;
      if (st.sharpeMin !== null && (f.sharpe === null || f.sharpe < st.sharpeMin)) return false;
      if (st.holdMin !== null && (f.hold250 === null || f.hold250 < st.holdMin)) return false;
      if (st.noDiv && f.hasDiv) return false;
      if (st.scaleMin !== null && (f.scale === null || f.scale < st.scaleMin)) return false;
      return true;
    }).sort(function (a, b) { return b.ret250 - a.ret250; });
  }

  /* ---------------- 表单 ---------------- */
  function renderForm() {
    var html = '<div class="sc-form">';

    /* 大类 */
    html += '<div class="sc-row"><label>大类</label><div class="sc-chips">' +
      Object.keys(GRPS).map(function (g) {
        return '<button class="sc-chip' + (st.grps.indexOf(g) >= 0 ? ' on' : '') +
          '" data-grp="' + g + '">' + U.esc(GRPS[g].name) + '</button>';
      }).join('') + '</div></div>';

    /* 板块 */
    html += '<div class="sc-row"><label>板块</label><div class="sc-chips">' +
      '<button class="sc-chip' + (st.secs.length === 0 ? ' on' : '') + '" data-sec-all="1">全部</button>' +
      SECS.map(function (s) {
        return '<button class="sc-chip' + (st.secs.indexOf(s.sec) >= 0 ? ' on' : '') +
          '" data-sec="' + s.sec + '">' + U.esc(s.name) +
          '<small>' + F.filter(function (f) { return f.sec === s.sec; }).length + '</small></button>';
      }).join('') + '</div></div>';

    /* 数值条件 */
    html += '<div class="sc-row"><label>近一年收益</label>' +
      '<div class="sc-inline">' +
        '至少 <input type="number" class="sc-input" id="scRetMin" value="' +
          (st.retMin === null ? '' : st.retMin) + '" step="5" placeholder="不限"> %' +
        ' 至多 <input type="number" class="sc-input" id="scRetMax" value="' +
          (st.retMax === null ? '' : st.retMax) + '" step="5" placeholder="不限"> %' +
      '</div></div>';

    html += '<div class="sc-row"><label>波动率上限</label>' +
      '<div class="sc-inline">' +
        '<input type="range" class="sc-range" id="scVol" min="0" max="60" step="1" value="' +
          (st.volMax === null ? 60 : st.volMax) + '">' +
        '<b class="sc-val" id="scVolVal">' +
          (st.volMax === null ? '不限' : st.volMax + '%') + '</b>' +
        '<span class="sc-hint">债券 1% / 宽基 28% / 白银 58%</span>' +
      '</div></div>';

    html += '<div class="sc-row"><label>最深回撤不超过</label>' +
      '<div class="sc-inline">' +
        '<input type="range" class="sc-range" id="scMdd" min="0" max="90" step="5" value="' +
          (st.mddMax === null ? 90 : st.mddMax) + '">' +
        '<b class="sc-val" id="scMddVal">' +
          (st.mddMax === null ? '不限' : '-' + st.mddMax + '%') + '</b>' +
        '<span class="sc-hint">这是"全历史最深"，比近一年狠得多</span>' +
      '</div></div>';

    html += '<div class="sc-row"><label>夏普比率至少</label>' +
      '<div class="sc-inline">' +
        '<input type="number" class="sc-input" id="scSharpe" value="' +
          (st.sharpeMin === null ? '' : st.sharpeMin) + '" step="0.1" placeholder="不限">' +
        '<span class="sc-hint">每担 1 份风险换多少超额收益，&gt;0.5 算不错</span>' +
      '</div></div>';

    /* 开关 */
    html += '<div class="sc-row"><label>其他</label><div class="sc-chips">' +
      '<button class="sc-chip' + (st.noDiv ? ' on' : '') + '" data-tog="noDiv">' +
        '只看没分过红的</button>' +
      '</div></div>';

    /* 操作 */
    html += '<div class="sc-actions">' +
      '<button class="btn" id="scReset">重置全部条件</button>' +
      '<span class="sc-count">符合条件 <b class="n">' + filter().length + '</b> 只</span>' +
      '</div>';

    html += '</div>';
    formHost.innerHTML = html;
    bind();
  }

  function bind() {
    /* 大类 */
    Array.prototype.forEach.call(formHost.querySelectorAll('[data-grp]'), function (b) {
      b.addEventListener('click', function () {
        var g = b.getAttribute('data-grp');
        var i = st.grps.indexOf(g);
        if (i >= 0) st.grps.splice(i, 1); else st.grps.push(g);
        refresh();
      });
    });

    /* 板块 */
    Array.prototype.forEach.call(formHost.querySelectorAll('[data-sec]'), function (b) {
      b.addEventListener('click', function () {
        var s = b.getAttribute('data-sec');
        var i = st.secs.indexOf(s);
        if (i >= 0) st.secs.splice(i, 1); else st.secs.push(s);
        refresh();
      });
    });
    var allb = formHost.querySelector('[data-sec-all]');
    if (allb) allb.addEventListener('click', function () {
      st.secs = [];
      refresh();
    });

    /* 数值 */
    function num(id, key) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function () {
        var v = el.value.trim();
        st[key] = v === '' ? null : parseFloat(v);
        refreshResult();
      });
    }
    num('scRetMin', 'retMin');
    num('scRetMax', 'retMax');
    num('scSharpe', 'sharpeMin');

    /* 滑块 */
    var vol = document.getElementById('scVol');
    if (vol) vol.addEventListener('input', function () {
      st.volMax = +vol.value >= 60 ? null : +vol.value;
      var v = document.getElementById('scVolVal');
      if (v) v.textContent = st.volMax === null ? '不限' : st.volMax + '%';
      refreshResult();
    });

    var mdd = document.getElementById('scMdd');
    if (mdd) mdd.addEventListener('input', function () {
      st.mddMax = +mdd.value >= 90 ? null : +mdd.value;
      var v = document.getElementById('scMddVal');
      if (v) v.textContent = st.mddMax === null ? '不限' : '-' + st.mddMax + '%';
      refreshResult();
    });

    /* 开关 */
    var tog = formHost.querySelector('[data-tog]');
    if (tog) tog.addEventListener('click', function () {
      st.noDiv = !st.noDiv;
      refresh();
    });

    /* 重置 */
    var rst = document.getElementById('scReset');
    if (rst) rst.addEventListener('click', function () {
      st = { secs: [], grps: [], retMin: null, retMax: null, volMax: null,
             mddMax: null, sharpeMin: null, holdMin: null, noDiv: false, scaleMin: null };
      refresh();
    });
  }

  /* ---------------- 结果表 ---------------- */
  function renderTable() {
    if (!tableHost) return;
    var rows = filter();

    /* 更新计数 */
    var cnt = formHost.querySelector('.sc-count b');
    if (cnt) cnt.textContent = rows.length;

    if (!rows.length) {
      tableHost.innerHTML = '<tbody><tr><td style="padding:30px;text-align:center;color:#7b8fb0">' +
        '没有符合条件的基金。条件放宽一点试试。</td></tr></tbody>';
      return;
    }

    var h = '<thead><tr>' +
      '<th class="left">#</th><th class="left">基金</th><th class="left">板块</th>' +
      '<th>近一年</th><th>波动</th><th>近一年最深</th><th>全历史最深</th>' +
      '<th>夏普</th><th>持有250天胜率</th><th>规模</th>' +
      '</tr></thead><tbody>';

    rows.forEach(function (f, i) {
      var m = ALL_SEC_META[f.sec];
      h += '<tr>' +
        '<td class="left">' + (i + 1) + '</td>' +
        '<td class="left"><a class="fund-link" href="基金详情/' + f.code + '.html">' +
          U.esc(f.name.slice(0, 20)) + '</a>' +
          '<div class="pf-td-sub">' + f.code + '</div></td>' +
        '<td class="left"><a class="fund-link" href="板块/' +
          U.esc(f.secName || (m ? m.name : '')) + '.html" style="font-size:11.5px">' +
          U.esc(f.secName || (m ? m.name : '')) + '</a></td>' +
        '<td class="' + (f.ret250 > 0 ? 'up' : 'down') + '"><b>' + U.fmt(f.ret250) + '</b></td>' +
        '<td>' + f.vol.toFixed(2) + '%</td>' +
        '<td class="up">' + U.fmt(f.mdd250) + '</td>' +
        '<td class="up"><b>' + U.fmt(f.mddAll) + '</b>' +
          '<div class="pf-td-sub">1万剩 ' + U.comma(U.worstLeft(f.mddAll)) + '</div></td>' +
        '<td class="' + (f.sharpe > 0.5 ? 'up' : (f.sharpe < 0 ? 'down' : '')) + '">' +
          U.fmtNum(f.sharpe, 2) + '</td>' +
        '<td>' + (f.hold250 === null ? '—' : U.fmtNum(f.hold250, 1) + '%') + '</td>' +
        '<td>' + (f.scale === null ? '—' : U.fmtNum(f.scale, 1) + '亿') + '</td>' +
        '</tr>';
    });

    tableHost.innerHTML = h + '</tbody>';

    /* 说明 */
    var note = document.getElementById('scNote');
    if (note) {
      var n = rows.length;
      if (n >= 5 && n <= 15) {
        note.className = 'note good';
        note.innerHTML = '<b>✅ 筛出 ' + n + ' 只，这个数量正好。</b>' +
          '现在你可以横向比较，然后看哪只的<b>板块你还没配过</b>——' +
          '同板块的基金买一只就够了。';
      } else if (n > 15) {
        note.className = 'note';
        note.innerHTML = '<b>筛出 ' + n + ' 只，还是有点多。</b>' +
          '建议加一个条件：把"最深回撤"上限收紧，或者只留 2~3 个板块。<br>' +
          '<b style="color:#f5b942">筛出太多等于没筛——你最后还是会在里面挑那只"最近涨得好"的。</b>';
      } else if (n > 0) {
        note.className = 'note warn';
        note.innerHTML = '<b>⚠️ 只筛出 ' + n + ' 只。</b>' +
          '这么严格的条件，说明你不是在筛选，是在给想买的那只找理由。<br>' +
          '<b style="color:#e8eef8">建议放宽条件</b>——好的筛选应该留下 5~15 只。';
      } else {
        note.className = 'note danger';
        note.innerHTML = '<b>❌ 一只都没有。</b>条件互斥了。' +
          '放宽最严格的那个（通常是"回撤"或"夏普"）。';
      }
    }
  }

  function refreshResult() { renderTable(); }
  function refresh() { renderForm(); renderTable(); }

  renderForm();
  renderTable();
})();
