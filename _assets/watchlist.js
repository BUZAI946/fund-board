/* 自选清单（localStorage 本地保存） */
(function () {
  'use strict';
  var D = window.DATA, U = window.UI;
  if (!D || !U) return;
  var KEY = 'fundboard_watchlist';

  function load() {
    try {
      var s = localStorage.getItem(KEY);
      var arr = s ? JSON.parse(s) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function save(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) {}
  }
  function getF(code) {
    for (var i = 0; i < D.funds.length; i++) if (D.funds[i].code === code) return D.funds[i];
    return null;
  }

  var list = load();
  var box = document.getElementById('watchBox');
  var tbox = document.getElementById('watchTableBox');

  function render() {
    if (!box) return;

    /* ---- 顶部：添加 + 统计 ---- */
    var valid = list.map(getF).filter(Boolean);

    var html = '<div class="watch-head">';
    html += '<div class="wh-add">' +
      '<select class="sim-select" id="watchSel" style="max-width:420px">' +
      '<option value="">+ 选择一只基金加入自选…</option>' +
      D.funds.slice().sort(function (a, b) { return b.ret250 - a.ret250; }).map(function (f) {
        var has = list.indexOf(f.code) >= 0;
        return '<option value="' + f.code + '"' + (has ? ' disabled' : '') + '>' +
          f.code + ' ' + f.name.slice(0, 18) + (has ? '（已在自选）' : '') + '</option>';
      }).join('') + '</select></div>';

    html += '<div class="wh-stat">' +
      '<span>已收藏 <b class="n hl">' + valid.length + '</b> 只</span>' +
      (valid.length ? '<button class="btn wh-clear" id="watchClear">清空全部</button>' : '') +
      '</div></div>';

    /* ---- 空状态 ---- */
    if (!valid.length) {
      html += '<div class="watch-empty">' +
        '<div class="we-ico">☆</div>' +
        '<div class="we-t">还没有收藏任何基金</div>' +
        '<div class="we-d">去任意基金详情页点「加入自选」，或者用上面的下拉框直接加。<br>' +
        '<b>收藏只存在你这台电脑的浏览器里</b>，不上传、不同步。</div>' +
        '<div class="we-links">' +
        '<a class="btn on" href="商品基金.html">看商品类 18 只 →</a> ' +
        '<a class="btn" href="股票基金.html">看股票类 18 只 →</a> ' +
        '<a class="btn" href="债券基金.html">看债券 4 只 →</a>' +
        '</div></div>';
      box.innerHTML = html;
      if (tbox) tbox.style.display = 'none';
      bind();
      return;
    }

    /* ---- 卡片列表 ---- */
    html += '<div class="watch-grid">';
    valid.forEach(function (f) {
      var tone = f.ret250 > 0 ? 'up' : (f.ret250 < 0 ? 'down' : 'mute');
      html += '<div class="watch-card">' +
        '<div class="wc-top">' +
          '<a class="wc-name" href="基金详情/' + f.code + '.html">' + U.esc(f.name) + '</a>' +
          '<button class="wc-del" data-c="' + f.code + '" title="移出自选">×</button>' +
        '</div>' +
        '<div class="wc-code">' + f.code + ' · ' + f.secName + '</div>' +
        '<div class="wc-ret ' + tone + '">' + U.fmt(f.ret250) + '<small>近250日</small></div>' +
        '<div class="wc-kv">' +
          '<div><span>波动</span><b>' + f.vol.toFixed(2) + '%</b></div>' +
          '<div><span>全历史最深</span><b class="down">' + U.fmt(f.mddAll) + '</b></div>' +
          '<div><span>夏普</span><b class="' + tone + '">' + U.fmtNum(f.sharpe, 2) + '</b></div>' +
        '</div>' +
        (f.warns && f.warns.length
          ? '<div class="wc-warn">' + U.esc(f.warns[0]) + '</div>' : '') +
        '</div>';
    });
    html += '</div>';

    box.innerHTML = html;
    if (tbox) tbox.style.display = '';

    bind();

    /* ---- 对比表 ---- */
    renderTable(valid);
  }

  function renderTable(valid) {
    var host = document.getElementById('watchTable');
    if (!host) return;

    var cols = [
      ['名称', function (f) { return '<a class="fund-link" href="基金详情/' + f.code + '.html">' +
        U.esc(f.name) + '</a>'; }, 'left'],
      ['代码', function (f) { return f.code; }],
      ['板块', function (f) { return f.secName; }],
      ['近250日', function (f) { return '<b class="' + (f.ret250 > 0 ? 'up' : 'down') + '">' +
        U.fmt(f.ret250) + '</b>'; }],
      ['波动率', function (f) { return f.vol.toFixed(2) + '%'; }],
      ['近250日最深', function (f) { return '<span class="down">' + U.fmt(f.mdd250) + '</span>'; }],
      ['全历史最深', function (f) { return '<b class="down">' + U.fmt(f.mddAll) + '</b>' +
        '<div style="font-size:10.5px;color:#7b8fb0">1万剩 ' +
        U.comma(U.worstLeft(f.mddAll)) + '</div>'; }],
      ['夏普', function (f) { return U.fmtNum(f.sharpe, 2); }],
      ['持有250天胜率', function (f) { return f.hold250 === null ? '—' :
        U.fmtNum(f.hold250, 1) + '%'; }],
      ['机构四期', function (f) { return f.instDelta === null ? '—' :
        '<span class="' + (f.instDelta > 0 ? 'up' : 'down') + '">' +
        (f.instDelta > 0 ? '+' : '') + U.fmtNum(f.instDelta, 1) + 'pp</span>'; }],
      ['操作', function (f) { return '<button class="wc-del2" data-c="' + f.code +
        '">移出</button>'; }, 'left']
    ];

    var h = '<thead><tr>' + cols.map(function (c) {
      return '<th class="' + (c[2] || '') + '">' + c[0] + '</th>';
    }).join('') + '</tr></thead><tbody>';

    valid.forEach(function (f) {
      h += '<tr>' + cols.map(function (c) {
        var v = c[1](f);
        return '<td class="' + (c[2] || '') + '">' + v + '</td>';
      }).join('') + '</tr>';
    });
    host.innerHTML = h + '</tbody>';

    Array.prototype.forEach.call(host.querySelectorAll('.wc-del2'), function (b) {
      b.addEventListener('click', function () {
        remove(b.getAttribute('data-c'));
      });
    });
  }

  function remove(code) {
    list = list.filter(function (c) { return c !== code; });
    save(list);
    render();
  }

  function bind() {
    var sel = document.getElementById('watchSel');
    if (sel) sel.addEventListener('change', function () {
      var v = sel.value;
      if (!v) return;
      if (list.indexOf(v) < 0) list.push(v);
      save(list);
      render();
    });

    Array.prototype.forEach.call(box.querySelectorAll('.wc-del'), function (b) {
      b.addEventListener('click', function () { remove(b.getAttribute('data-c')); });
    });

    var clr = document.getElementById('watchClear');
    if (clr) clr.addEventListener('click', function () {
      if (confirm('确定清空全部自选？这个操作不能撤销。')) {
        list = []; save(list); render();
      }
    });
  }

  render();
})();
