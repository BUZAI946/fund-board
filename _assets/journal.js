/* ===========================================================
   决策日志
   记录每次买入/卖出的理由，回看时算现在的盈亏
   localStorage: fundboard_journal
   =========================================================== */
(function () {
  'use strict';
  var D = window.DATA, U = window.UI;
  if (!D || !U) return;

  var formHost = document.getElementById('jnForm');
  var listHost = document.getElementById('jnList');
  if (!formHost) return;

  var KEY = 'fundboard_journal';
  var F = D.funds || [];

  function getF(code) {
    for (var i = 0; i < F.length; i++) if (F[i].code === code) return F[i];
    return null;
  }
  function load() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function save(a) {
    try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {}
  }

  var entries = load();

  /* ---------------- 常用理由模板 ---------------- */
  var REASONS = [
    '看好这个板块的长期逻辑',
    '最近涨得好，怕错过',
    '跌了很多，觉得该反弹了',
    '朋友/博主推荐',
    '为了分散持仓',
    '按定投计划执行',
    '板块轮动，换到这个',
    '其他（自己写）'
  ];
  var WRONG_WHEN = [
    '这个板块的长期逻辑被证伪（比如政策变了）',
    '跌超过 20%',
    '跑输同类平均超过 10 个百分点',
    '持有满 1 年还没赚钱',
    '基金经理换了',
    '其他（自己写）'
  ];

  /* ---------------- 表单 ---------------- */
  function renderForm() {
    var today = new Date();
    var ds = today.getFullYear() + '-' +
      ('0' + (today.getMonth() + 1)).slice(-2) + '-' +
      ('0' + today.getDate()).slice(-2);

    var html = '<div class="jn-form">';

    html += '<div class="jn-row"><label>操作</label><div class="jn-inline">' +
      '<span class="jn-presets">' +
        '<button class="jn-pre on" data-type="buy">买入</button>' +
        '<button class="jn-pre" data-type="sell">卖出</button>' +
      '</span>' +
      '<input type="date" class="sc-input" id="jnDate" value="' + ds + '" style="width:150px">' +
      '</div></div>';

    html += '<div class="jn-row"><label>基金</label><div class="jn-inline">' +
      '<select class="sim-select" id="jnCode" style="max-width:400px">' +
      '<option value="">选择一只基金…</option>' +
      F.slice().sort(function (a, b) { return b.ret250 - a.ret250; }).map(function (f) {
        return '<option value="' + f.code + '">' + f.code + ' ' +
          f.name.slice(0, 18) + '（' + f.secName + '）</option>';
      }).join('') + '</select>' +
      '<input type="number" class="sc-input" id="jnAmt" placeholder="金额" style="width:110px">' +
      '<span class="sc-hint">元</span></div></div>';

    html += '<div class="jn-row"><label>为什么买</label><div class="jn-chips" id="jnReasonChips">' +
      REASONS.map(function (r) {
        return '<button class="jn-chip" data-reason="' + U.esc(r) + '">' + U.esc(r) + '</button>';
      }).join('') + '</div></div>';

    html += '<div class="jn-row"><label></label><div class="jn-inline">' +
      '<textarea class="jn-textarea" id="jnReason" rows="2" ' +
      'placeholder="写具体一点。比如：原油近一年涨 65%，但我判断这是地缘冲突带来的短期溢价，不可持续——所以只配 5% 试水。"></textarea>' +
      '</div></div>';

    html += '<div class="jn-row"><label>什么情况我认错</label><div class="jn-chips" id="jnWrongChips">' +
      WRONG_WHEN.map(function (r) {
        return '<button class="jn-chip" data-wrong="' + U.esc(r) + '">' + U.esc(r) + '</button>';
      }).join('') + '</div></div>';

    html += '<div class="jn-row"><label></label><div class="jn-inline">' +
      '<textarea class="jn-textarea" id="jnWrong" rows="2" ' +
      'placeholder="这一栏最重要。写不出这一栏，说明你根本没想过会错——那就是在赌，不是在投资。"></textarea>' +
      '</div></div>';

    html += '<div class="jn-actions">' +
      '<button class="btn on" id="jnAdd">+ 记下这一笔</button>' +
      '<span class="sc-hint" id="jnHint">三种字段里，<b>「什么情况我认错」最有价值</b></span>' +
      '</div>';

    html += '</div>';
    formHost.innerHTML = html;
    bindForm();
  }

  function bindForm() {
    /* 类型切换 */
    Array.prototype.forEach.call(formHost.querySelectorAll('[data-type]'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(formHost.querySelectorAll('[data-type]'), function (x) {
          x.classList.remove('on');
        });
        b.classList.add('on');
      });
    });

    /* 理由点选 */
    Array.prototype.forEach.call(formHost.querySelectorAll('[data-reason]'), function (b) {
      b.addEventListener('click', function () {
        var ta = document.getElementById('jnReason');
        var txt = b.getAttribute('data-reason');
        if (!ta) return;
        /* 「其他」清空让用户写 */
        if (txt.indexOf('其他') === 0) { ta.value = ''; ta.focus(); return; }
        ta.value = ta.value ? ta.value + '；' + txt : txt;
        ta.focus();
      });
    });
    Array.prototype.forEach.call(formHost.querySelectorAll('[data-wrong]'), function (b) {
      b.addEventListener('click', function () {
        var ta = document.getElementById('jnWrong');
        var txt = b.getAttribute('data-wrong');
        if (!ta) return;
        if (txt.indexOf('其他') === 0) { ta.value = ''; ta.focus(); return; }
        ta.value = ta.value ? ta.value + '；' + txt : txt;
        ta.focus();
      });
    });

    var add = document.getElementById('jnAdd');
    if (add) add.addEventListener('click', doAdd);
  }

  function doAdd() {
    var code = (document.getElementById('jnCode') || {}).value;
    var date = (document.getElementById('jnDate') || {}).value;
    var amt = parseFloat((document.getElementById('jnAmt') || {}).value);
    var reason = ((document.getElementById('jnReason') || {}).value || '').trim();
    var wrong = ((document.getElementById('jnWrong') || {}).value || '').trim();
    var type = 'buy';
    var tb = formHost.querySelector('[data-type].on');
    if (tb) type = tb.getAttribute('data-type');

    if (!code) { alert('请选择一只基金。'); return; }
    if (!date) { alert('请选择日期。'); return; }
    if (!reason) { alert('请写买入理由（可以点上面的模板）。'); return; }

    var f = getF(code);
    entries.unshift({
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      type: type, code: code, name: f ? f.name : code,
      secName: f ? f.secName : '',
      date: date,
      amt: isNaN(amt) ? null : amt,
      reason: reason,
      wrong: wrong || '（没写——这说明你没想过会错）',
      createdAt: new Date().toISOString()
    });
    save(entries);

    /* 清空输入 */
    var ta1 = document.getElementById('jnReason');
    var ta2 = document.getElementById('jnWrong');
    var am = document.getElementById('jnAmt');
    if (ta1) ta1.value = '';
    if (ta2) ta2.value = '';
    if (am) am.value = '';

    renderList();
  }

  /* ---------------- 计算这条记录现在的表现 ---------------- */
  function calcPerf(e) {
    var f = getF(e.code);
    if (!f) return null;

    /* 买入日 → seq 索引 */
    var axis = D.axis || [];
    var iBuy = 0, bd = Infinity;
    var tg = +String(e.date).replace(/-/g, '');
    for (var i = 0; i < axis.length; i++) {
      var d = Math.abs(+axis[i].replace(/-/g, '') - tg);
      if (d < bd) { bd = d; iBuy = i; }
    }
    /* 如果日期在窗口之前，无法计算 */
    if (tg < +String(axis[0]).replace(/-/g, '')) {
      return { outOfRange: true, f: f };
    }
    var ratio = f.seq[f.seq.length - 1] / f.seq[iBuy];
    return {
      f: f, ratio: ratio,
      ret: (ratio - 1) * 100,
      days: Math.round((new Date() - new Date(e.date)) / 86400000)
    };
  }

  /* ---------------- 列表 ---------------- */
  function renderList() {
    if (!listHost) return;

    if (!entries.length) {
      listHost.innerHTML = '<div class="card card-pad watch-empty">' +
        '<div class="we-ico">📓</div>' +
        '<div class="we-t">还没有任何记录</div>' +
        '<div class="we-d">下次买入前，先在上面写一条。<br>' +
        '<b>重点不是记住你买了什么，是记住你当时为什么买。</b></div>' +
        '</div>';
      return;
    }

    var h = '<div class="jn-entries">';
    entries.forEach(function (e) {
      var p = calcPerf(e);
      var isBuy = e.type === 'buy';
      var perfHtml = '';

      if (p && !p.outOfRange) {
        var tone = p.ret >= 0 ? 'up' : 'down';
        perfHtml = '<div class="jn-perf ' + tone + '">' +
          '<b>' + U.fmt(p.ret) + '</b>' +
          '<span>持有 ' + p.days + ' 天</span>' +
          '</div>';
      } else if (p && p.outOfRange) {
        perfHtml = '<div class="jn-perf mute"><b>—</b>' +
          '<span>早于数据窗口</span></div>';
      }

      /* 是否该验收了（超过 90 天） */
      var days = Math.round((new Date() - new Date(e.date)) / 86400000);
      var shouldReview = days >= 90;

      h += '<div class="jn-entry ' + (isBuy ? 'buy' : 'sell') + '">' +
        '<div class="jn-e-head">' +
          '<span class="jn-badge ' + (isBuy ? 'buy' : 'sell') + '">' +
            (isBuy ? '买入' : '卖出') + '</span>' +
          '<a class="jn-e-name fund-link" href="基金详情/' + e.code + '.html">' +
            U.esc(e.name.slice(0, 18)) + '</a>' +
          '<span class="jn-e-meta">' + e.date +
            (e.amt ? ' · ' + U.comma(e.amt) + ' 元' : '') +
            (e.secName ? ' · ' + U.esc(e.secName) : '') + '</span>' +
          (perfHtml) +
          '<button class="jn-del" data-id="' + e.id + '" title="删除">×</button>' +
        '</div>' +
        '<div class="jn-e-body">' +
          '<div class="jn-field">' +
            '<span class="jn-fl">当时的理由</span>' +
            '<p>' + U.esc(e.reason) + '</p>' +
          '</div>' +
          '<div class="jn-field jn-field-warn">' +
            '<span class="jn-fl">说好什么情况认错</span>' +
            '<p>' + U.esc(e.wrong) + '</p>' +
          '</div>' +
        '</div>' +
        (shouldReview
          ? '<div class="jn-review">' +
            '<b>⏰ 这条已经记了 ' + days + ' 天，该验收了。</b>' +
            '问自己：当时写的理由，现在还成立吗？如果理由变了，' +
            '<b style="color:#f5b942">现在就该重新决策，而不是因为"已经亏了"继续拿着。</b>' +
            '</div>'
          : '') +
        '</div>';
    });
    h += '</div>';

    /* 统计 */
    var buys = entries.filter(function (x) { return x.type === 'buy'; }).length;
    var sc = '<div class="jn-stats">' +
      '<span>共 <b class="n">' + entries.length + '</b> 条记录</span>' +
      '<span>买入 <b class="n">' + buys + '</b> · 卖出 <b class="n">' +
        (entries.length - buys) + '</b></span>' +
      '<span>最早 ' + (entries.length ? entries[entries.length - 1].date : '—') + '</span>' +
      '</div>';

    listHost.innerHTML = sc + h;

    Array.prototype.forEach.call(listHost.querySelectorAll('[data-id]'), function (b) {
      b.addEventListener('click', function () {
        if (!confirm('删除这条记录？')) return;
        var id = b.getAttribute('data-id');
        entries = entries.filter(function (x) { return x.id !== id; });
        save(entries);
        renderList();
      });
    });
  }

  renderForm();
  renderList();
})();
