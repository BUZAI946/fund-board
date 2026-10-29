/* ===========================================================
   持仓跟踪器
   两种输入模式：
     A「按买入日」— 选基金 + 买入日 + 投入金额 → 用 seq 推算（精度约 3~4 交易日）
     B「按份额」  — 选基金 + 当前份额 + 总成本 → 用真实 nav 计算（绝对精确）
   记录存 localStorage：fundboard_holdings
   =========================================================== */
(function () {
  'use strict';
  var D = window.DATA, U = window.UI;
  if (!D || !U) return;

  var formHost = document.getElementById('pfForm');
  if (!formHost) return;

  var KEY = 'fundboard_holdings';
  var axis = D.axis || [];
  var WIN_START = axis[0], WIN_END = axis[axis.length - 1];

  /* ---------------- 数据存取 ---------------- */
  function load() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function save(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) {}
  }
  var list = load();

  function getF(code) {
    for (var i = 0; i < D.funds.length; i++) if (D.funds[i].code === code) return D.funds[i];
    return null;
  }

  /* ---------------- 日期 → seq 索引（最近点吸附）---------------- */
  function nearestIdx(dateStr) {
    if (!dateStr) return axis.length - 1;
    var target = +dateStr.replace(/-/g, '');
    var best = 0, bestDiff = Infinity;
    for (var i = 0; i < axis.length; i++) {
      var v = +axis[i].replace(/-/g, '');
      var d = Math.abs(v - target);
      if (d < bestDiff) { bestDiff = d; best = i; }
    }
    return best;
  }

  /* ---------------- 单条持仓 → 计算 ---------------- */
  function calcOne(h) {
    var f = getF(h.code);
    if (!f) return null;

    if (h.mode === 'shares') {
      /* 模式 B：份额 + 成本，用真实单位净值 */
      var nav = f.nav;
      if (!nav) return null;
      var value = h.shares * nav;
      return {
        h: h, f: f,
        cost: h.cost, value: value,
        pnl: value - h.cost,
        ret: h.cost ? (value / h.cost - 1) * 100 : null,
        navNow: nav, navDate: f.last,
        note: '按份额 × 单位净值'
      };
    }

    /* 模式 A：买入日 + 金额，用 seq 推算 */
    if (!f.seq || f.seq.length < 2) return null;
    var iBuy = nearestIdx(h.date);
    var iNow = f.seq.length - 1;
    var ratio = f.seq[iNow] / f.seq[iBuy];
    var value2 = h.cost * ratio;
    return {
      h: h, f: f,
      cost: h.cost, value: value2,
      pnl: value2 - h.cost,
      ret: (ratio - 1) * 100,
      boughtAt: axis[iBuy], snapped: axis[iBuy] !== h.date,
      note: '按净值变化推算'
    };
  }

  /* =========================================================
     录入表单
     ========================================================= */
  var draft = { mode: 'amount', code: '', date: '', cost: 1000, shares: '', note: '' };

  function renderForm() {
    var html = '<div class="pf-form">';

    /* 模式切换 */
    html += '<div class="pf-tabs">' +
      '<button class="pf-tab' + (draft.mode === 'amount' ? ' on' : '') + '" data-m="amount">' +
        '按买入日录 <small>（扫码式：知道哪天投了多少钱）</small></button>' +
      '<button class="pf-tab' + (draft.mode === 'shares' ? ' on' : '') + '" data-m="shares">' +
        '按份额录 <small>（精确：知道现在持有多少份）</small></button>' +
      '</div>';

    /* 选基金 */
    html += '<div class="pf-row"><label>基金</label>' +
      '<select class="sim-select" id="pfCode" style="max-width:420px">' +
      '<option value="">选择一只基金…</option>' +
      D.funds.slice().sort(function (a, b) { return b.ret250 - a.ret250; }).map(function (f) {
        return '<option value="' + f.code + '"' +
          (draft.code === f.code ? ' selected' : '') + '>' +
          f.code + ' ' + f.name.slice(0, 18) + '（' + f.secName + '）</option>';
      }).join('') + '</select></div>';

    if (draft.mode === 'amount') {
      /* 买入日 */
      html += '<div class="pf-row"><label>买入日期</label>' +
        '<input type="date" class="pf-input" id="pfDate" value="' + (draft.date || WIN_END) +
        '" min="' + WIN_START + '" max="' + WIN_END + '">' +
        '<span class="pf-hint">可选范围 ' + WIN_START + ' ~ ' + WIN_END + '</span></div>';

      /* 投入金额 */
      html += '<div class="pf-row"><label>投入金额</label>' +
        '<input type="number" class="pf-input" id="pfCost" value="' + draft.cost +
        '" min="100" step="100">' +
        '<span class="pf-unit">元</span>' +
        '<span class="pf-presets">' +
          [1000, 5000, 10000, 50000].map(function (v) {
            return '<button class="pf-pre' + (draft.cost === v ? ' on' : '') +
              '" data-c="' + v + '">' + U.comma(v) + '</button>';
          }).join('') +
        '</span></div>';
    } else {
      /* 份额 */
      html += '<div class="pf-row"><label>当前份额</label>' +
        '<input type="number" class="pf-input" id="pfShares" value="' + draft.shares +
        '" min="0" step="0.01" placeholder="例：3572.15">' +
        '<span class="pf-hint">在基金 App 的「我的持仓」里能看到</span></div>';

      /* 总成本 */
      html += '<div class="pf-row"><label>买入总成本</label>' +
        '<input type="number" class="pf-input" id="pfCost2" value="' + draft.cost +
        '" min="0" step="100">' +
        '<span class="pf-unit">元</span>' +
        '<span class="pf-hint">含手续费实际扣的钱</span></div>';
    }

    /* 备注 */
    html += '<div class="pf-row"><label>备注</label>' +
      '<input type="text" class="pf-input pf-note-in" id="pfNote" value="' +
      U.esc(draft.note || '') + '" placeholder="可选，例：定投第3期" maxlength="20"></div>';

    /* 按钮 */
    html += '<div class="pf-actions">' +
      '<button class="btn on" id="pfAdd">+ 加入持仓</button>' +
      (list.length ? '<button class="btn" id="pfClear">清空全部</button>' : '') +
      '</div>';

    html += '</div>';

    /* 实时预览 */
    if (draft.mode === 'amount' && draft.code && draft.date) {
      var preview = calcOne({ mode: 'amount', code: draft.code, date: draft.date, cost: draft.cost });
      if (preview) {
        html += '<div class="pf-preview">' +
          '<span>→ 这笔现在约值</span>' +
          '<b class="n">' + U.comma(preview.value) + ' 元</b>' +
          '<span class="' + (preview.pnl >= 0 ? 'up' : 'down') + '">（' +
            (preview.pnl >= 0 ? '+' : '') + U.comma(preview.pnl) + ' 元 · ' +
            U.fmt(preview.ret) + '）</span>' +
          (preview.snapped ? '<span class="pf-snap">日期已吸附到 ' + preview.boughtAt + '</span>' : '') +
          '</div>';
      }
    } else if (draft.mode === 'shares' && draft.code && draft.shares > 0) {
      var p2 = calcOne({ mode: 'shares', code: draft.code, shares: draft.shares, cost: draft.cost });
      if (p2) {
        html += '<div class="pf-preview">' +
          '<span>→ 这笔现在约值</span>' +
          '<b class="n">' + U.comma(p2.value) + ' 元</b>' +
          '<span class="' + (p2.pnl >= 0 ? 'up' : 'down') + '">（' +
            (p2.pnl >= 0 ? '+' : '') + U.comma(p2.pnl) + ' 元 · ' +
            U.fmt(p2.ret) + '）</span>' +
          '<span class="pf-snap">按单位净值 ' + U.fmtNum(p2.navNow, 4) + '（' + p2.navDate + '）</span>' +
          '</div>';
      }
    }

    formHost.innerHTML = html;
    bindForm();
  }

  function bindForm() {
    Array.prototype.forEach.call(formHost.querySelectorAll('.pf-tab'), function (b) {
      b.addEventListener('click', function () {
        draft.mode = b.getAttribute('data-m');
        renderForm();
      });
    });

    var sel = document.getElementById('pfCode');
    if (sel) sel.addEventListener('change', function () { draft.code = sel.value; renderForm(); });

    var dt = document.getElementById('pfDate');
    if (dt) dt.addEventListener('change', function () { draft.date = dt.value; renderForm(); });

    var c1 = document.getElementById('pfCost');
    if (c1) c1.addEventListener('input', function () {
      var v = +c1.value; if (!isNaN(v) && v >= 0) draft.cost = v;
      refreshPreview();
    });

    var c2 = document.getElementById('pfCost2');
    if (c2) c2.addEventListener('input', function () {
      var v = +c2.value; if (!isNaN(v) && v >= 0) draft.cost = v;
      refreshPreview();
    });

    var sh = document.getElementById('pfShares');
    if (sh) sh.addEventListener('input', function () {
      draft.shares = sh.value; refreshPreview();
    });

    var nt = document.getElementById('pfNote');
    if (nt) nt.addEventListener('input', function () { draft.note = nt.value; });

    Array.prototype.forEach.call(formHost.querySelectorAll('.pf-pre'), function (b) {
      b.addEventListener('click', function () {
        draft.cost = +b.getAttribute('data-c');
        renderForm();
      });
    });

    var add = document.getElementById('pfAdd');
    if (add) add.addEventListener('click', doAdd);

    var clr = document.getElementById('pfClear');
    if (clr) clr.addEventListener('click', function () {
      if (confirm('确定清空全部 ' + list.length + ' 条持仓记录？此操作不能撤销。')) {
        list = []; save(list); renderAll();
      }
    });
  }

  /* 只重画预览行，避免输入框失焦 */
  function refreshPreview() {
    var old = formHost.querySelector('.pf-preview');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var html = '';
    if (draft.mode === 'amount' && draft.code && draft.date) {
      var p = calcOne({ mode: 'amount', code: draft.code, date: draft.date, cost: draft.cost });
      if (p) {
        html = '<div class="pf-preview"><span>→ 这笔现在约值</span>' +
          '<b class="n">' + U.comma(p.value) + ' 元</b>' +
          '<span class="' + (p.pnl >= 0 ? 'up' : 'down') + '">（' +
            (p.pnl >= 0 ? '+' : '') + U.comma(p.pnl) + ' 元 · ' + U.fmt(p.ret) + '）</span>' +
          (p.snapped ? '<span class="pf-snap">日期已吸附到 ' + p.boughtAt + '</span>' : '') +
          '</div>';
      }
    } else if (draft.mode === 'shares' && draft.code && draft.shares > 0) {
      var p2 = calcOne({ mode: 'shares', code: draft.code, shares: +draft.shares, cost: draft.cost });
      if (p2) {
        html = '<div class="pf-preview"><span>→ 这笔现在约值</span>' +
          '<b class="n">' + U.comma(p2.value) + ' 元</b>' +
          '<span class="' + (p2.pnl >= 0 ? 'up' : 'down') + '">（' +
            (p2.pnl >= 0 ? '+' : '') + U.comma(p2.pnl) + ' 元 · ' + U.fmt(p2.ret) + '）</span>' +
          '<span class="pf-snap">按单位净值 ' + U.fmtNum(p2.navNow, 4) + '</span></div>';
      }
    }

    if (html) {
      var wrap = document.createElement('div');
      wrap.innerHTML = html;
      if (wrap.firstChild) formHost.appendChild(wrap.firstChild);
    }
  }

  function doAdd() {
    if (!draft.code) { alert('请先选择一只基金。'); return; }

    if (draft.mode === 'amount') {
      if (!draft.date) { alert('请选择买入日期。'); return; }
      if (!(draft.cost > 0)) { alert('请输入大于 0 的投入金额。'); return; }
      list.push({
        id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        mode: 'amount', code: draft.code, date: draft.date,
        cost: draft.cost, note: draft.note || ''
      });
    } else {
      var sh = parseFloat(draft.shares);
      if (!(sh > 0)) { alert('请输入大于 0 的份额。'); return; }
      if (!(draft.cost > 0)) { alert('请输入买入总成本。'); return; }
      list.push({
        id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        mode: 'shares', code: draft.code, shares: sh,
        cost: draft.cost, note: draft.note || ''
      });
    }

    save(list);
    draft.cost = draft.cost;   /* 保留金额，方便连续录入 */
    draft.note = '';
    renderAll();
  }

  /* =========================================================
     汇总
     ========================================================= */
  function renderSummary(rows) {
    var host = document.getElementById('pfSummary');
    if (!host) return;

    /* 净值日期 */
    var nd = document.getElementById('pfNavDate');
    if (nd) {
      var cnt = {}, bestD = '', bestN = 0;
      D.funds.forEach(function (f) {
        if (!f.last) return;
        cnt[f.last] = (cnt[f.last] || 0) + 1;
        if (cnt[f.last] > bestN) { bestN = cnt[f.last]; bestD = f.last; }
      });
      nd.textContent = bestD || '—';
    }

    if (!rows.length) {
      host.innerHTML = '<div class="card card-pad watch-empty">' +
        '<div class="we-ico">📋</div>' +
        '<div class="we-t">还没有录入任何持仓</div>' +
        '<div class="we-d">在上面选一只基金、填上你买入的日期和金额，' +
        '就能看到这笔钱现在值多少、赚了多少。<br>' +
        '<b>记录只存你自己电脑，不会有任何人看到。</b></div>' +
        '<div class="we-links">' +
        '<a class="btn on" href="商品基金.html">看商品 ' + D.groups.commodity.n + ' 只 →</a> ' +
        '<a class="btn" href="股票基金.html">看股票 ' + D.groups.stock.n + ' 只 →</a> ' +
        '<a class="btn" href="债券基金.html">看债券 ' + D.groups.fund.n + ' 只 →</a>' +
        '</div></div>';
      ['pfListBox', 'pfStructBox', 'pfRiskBox'].forEach(function (id) {
        var b = document.getElementById(id);
        if (b) b.style.display = 'none';
      });
      return;
    }

    ['pfListBox', 'pfStructBox', 'pfRiskBox'].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.style.display = '';
    });

    var totalCost = 0, totalValue = 0;
    rows.forEach(function (r) { totalCost += r.cost; totalValue += r.value; });
    var totalPnl = totalValue - totalCost;
    var totalRet = totalCost ? (totalValue / totalCost - 1) * 100 : 0;

    /* 加权波动率（近似，忽略相关性） */
    var wVol2 = 0, wMdd = 0, nonCashVal = 0;
    rows.forEach(function (r) {
      var w = totalValue ? r.value / totalValue : 0;
      if (r.f.vol) wVol2 += Math.pow(w * r.f.vol, 2);
      if (r.f.mddAll) wMdd += w * Math.abs(r.f.mddAll);
    });

    host.innerHTML =
      '<div class="pf-sum-grid">' +
        '<div class="pf-sum-item">' +
          '<span>累计投入</span>' +
          '<b class="n">' + U.comma(totalCost) + '</b><small>元</small>' +
        '</div>' +
        '<div class="pf-sum-item pf-sum-main">' +
          '<span>现在市值</span>' +
          '<b class="n">' + U.comma(totalValue) + '</b><small>元</small>' +
          '<div class="pfs-pnl ' + (totalPnl >= 0 ? 'up' : 'down') + '">' +
            (totalPnl >= 0 ? '赚 +' : '亏 ') + U.comma(Math.abs(totalPnl)) + ' 元 · ' +
            U.fmt(totalRet) + '</div>' +
        '</div>' +
        '<div class="pf-sum-item">' +
          '<span>记录笔数</span>' +
          '<b class="n">' + rows.length + '</b><small>笔</small>' +
        '</div>' +
        '<div class="pf-sum-item">' +
          '<span>加权波动率</span>' +
          '<b class="n">' + Math.sqrt(wVol2).toFixed(2) + '</b><small>%</small>' +
          '<div class="pfs-note">越高越颠</div>' +
        '</div>' +
      '</div>';
  }

  /* =========================================================
     明细表
     ========================================================= */
  function renderTable(rows) {
    var host = document.getElementById('pfTable');
    if (!host) return;
    if (!rows.length) { host.innerHTML = ''; return; }

    var totalValue = rows.reduce(function (a, r) { return a + r.value; }, 0);

    var h = '<thead><tr>' +
      '<th class="left">基金</th><th class="left">买入信息</th>' +
      '<th>投入</th><th>现在值</th><th>盈亏</th><th>收益率</th><th>占比</th>' +
      '<th class="left">操作</th></tr></thead><tbody>';

    rows.forEach(function (r) {
      var f = r.f, pct = totalValue ? r.value / totalValue * 100 : 0;
      var buyInfo = r.h.mode === 'amount'
        ? '买入日 ' + r.boughtAt + (r.snapped ? ' <span class="pf-snap2">(已吸附)</span>' : '')
        : '持有 ' + U.fmtNum(r.h.shares, 2) + ' 份';

      h += '<tr>' +
        '<td class="left">' +
          '<a class="fund-link" href="基金详情/' + f.code + '.html">' +
            U.esc(f.name.slice(0, 16)) + '</a>' +
          '<div class="pf-td-sub">' + f.code + ' · ' + f.secName +
            (r.h.note ? ' · ' + U.esc(r.h.note) : '') + '</div>' +
        '</td>' +
        '<td class="left pf-td-sub" style="font-size:11.5px">' + buyInfo + '</td>' +
        '<td>' + U.comma(r.cost) + '</td>' +
        '<td>' + U.comma(r.value) + '</td>' +
        '<td class="' + (r.pnl >= 0 ? 'up' : 'down') + '">' +
          (r.pnl >= 0 ? '+' : '') + U.comma(r.pnl) + '</td>' +
        '<td class="' + (r.ret >= 0 ? 'up' : 'down') + '">' + U.fmt(r.ret) + '</td>' +
        '<td>' + pct.toFixed(1) + '%</td>' +
        '<td class="left"><button class="wc-del2 pf-del" data-id="' + r.h.id + '">删除</button></td>' +
        '</tr>';
    });

    h += '</tbody>';
    host.innerHTML = h;

    Array.prototype.forEach.call(host.querySelectorAll('.pf-del'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-id');
        list = list.filter(function (x) { return x.id !== id; });
        save(list);
        renderAll();
      });
    });
  }

  /* =========================================================
     结构分析（板块 / 大类）
     ========================================================= */
  function renderStruct(rows) {
    var totalValue = rows.reduce(function (a, r) { return a + r.value; }, 0);
    if (!totalValue) return;

    /* 按板块聚合 */
    var bySec = {}, byGrp = {};
    rows.forEach(function (r) {
      var v = r.value;
      bySec[r.f.secName] = (bySec[r.f.secName] || 0) + v;
      byGrp[r.f.grp] = (byGrp[r.f.grp] || 0) + v;
    });

    function bars(obj, hostId, colorFn) {
      var host = document.getElementById(hostId);
      if (!host) return;
      var arr = Object.keys(obj).map(function (k) { return { k: k, v: obj[k] }; })
        .sort(function (a, b) { return b.v - a.v; });
      var max = arr.length ? arr[0].v : 1;
      host.innerHTML = arr.map(function (x) {
        var pct = x.v / totalValue * 100;
        return '<div class="pf-bar-row">' +
          '<span class="pf-bar-name">' + x.k + '</span>' +
          '<span class="pf-bar-track"><i style="width:' + (x.v / max * 100) +
            '%;background:' + colorFn(x.k) + '"></i></span>' +
          '<b class="pf-bar-val">' + pct.toFixed(1) + '%</b>' +
          '</div>';
      }).join('');
    }

    var GRP_COLOR = { fund: '#3d8bfd', stock: '#ff8a5c', commodity: '#f5b942' };
    var GRP_NAME = { fund: '债券基金', stock: '股票基金', commodity: '商品基金' };

    bars(bySec, 'pfSecBars', function () { return '#3d8bfd'; });

    /* 大类：用中文名 */
    var grpCn = {};
    Object.keys(byGrp).forEach(function (k) { grpCn[GRP_NAME[k] || k] = byGrp[k]; });
    bars(grpCn, 'pfGrpBars', function (k) {
      for (var g in GRP_NAME) if (GRP_NAME[g] === k) return GRP_COLOR[g];
      return '#7b8fb0';
    });

    /* 结构点评 */
    var note = document.getElementById('pfStructNote');
    if (note) {
      var secN = Object.keys(bySec).length;
      var grpN = Object.keys(byGrp).length;
      var maxSec = '', maxPct = 0;
      Object.keys(bySec).forEach(function (k) {
        var p = bySec[k] / totalValue * 100;
        if (p > maxPct) { maxPct = p; maxSec = k; }
      });

      var msg;
      if (secN === 1) {
        msg = '<b class="up">⚠️ 你只持有一个板块（' + maxSec + '）。</b>' +
          '这不叫"分散"，这叫"单押"。<b>这个板块跌，你就全跌。</b>' +
          '哪怕买了 5 只不同基金，只要都在同一个板块，风险是一样的。';
        note.className = 'note danger';
      } else if (maxPct >= 70) {
        msg = '<b class="up">⚠️ 你的钱有 ' + maxPct.toFixed(0) + '% 压在「' + maxSec +
          '」上。</b>另一个板块合计只占 ' + (100 - maxPct).toFixed(0) + '%。' +
          '这种结构下，' + maxSec + ' 的涨跌基本决定了你的全部收益。';
        note.className = 'note warn';
      } else if (secN >= 4) {
        msg = '<b class="down">✅ 分散得不错：' + secN + ' 个板块、' + grpN +
          ' 个大类，最大单一板块占 ' + maxPct.toFixed(0) + '%。</b>' +
          '但要注意：<b>板块数量不等于分散效果</b>——两个高度相关的板块（比如 A股宽基和行业主题，相关性 0.84）' +
          '放一起，等于没分散。具体看<a href="总览.html#corrMatrix">相关性矩阵</a>。';
        note.className = 'note good';
      } else {
        msg = '<b>你有 ' + secN + ' 个板块、' + grpN + ' 个大类的持仓</b>，' +
          '最大单一板块占 ' + maxPct.toFixed(0) + '%。' +
          '分散度中等——如果想更稳，可以把最大那块削一点，补到相关性低的板块上。';
        note.className = 'note';
      }
      note.innerHTML = msg;
    }
  }

  /* =========================================================
     风险
     ========================================================= */
  function renderRisk(rows) {
    var host = document.getElementById('pfRisk');
    if (!host) return;
    var totalValue = rows.reduce(function (a, r) { return a + r.value; }, 0);
    if (!totalValue) { host.innerHTML = ''; return; }

    /* 加权回撤：各腿回撤 × 各自权重 */
    var wMdd = 0;
    /* 最惨的那一只：要记录它的"那一笔市值"和回撤，
       不能用总市值 × 它的回撤（那是错的，会算出远大于实际的数） */
    var worst = null;
    rows.forEach(function (r) {
      var w = r.value / totalValue;
      if (r.f.mddAll) wMdd += w * Math.abs(r.f.mddAll);
      if (r.f.mddAll && (!worst || r.f.mddAll < worst.f.mddAll)) worst = r;
    });

    var worstCase = totalValue * (1 - wMdd / 100);
    /* 正确算法：只有那一笔会打这么深的回撤，其余不受影响 */
    var singleLoss = worst ? worst.value * Math.abs(worst.f.mddAll) / 100 : 0;
    var singleLeft = worst ? worst.value - singleLoss : 0;

    host.innerHTML =
      '<div class="pf-risk-grid">' +
        '<div class="pf-risk-item">' +
          '<div class="pfr-lbl">正常回调（约 -3%）</div>' +
          '<div class="pfr-val up">-' + U.comma(totalValue * 0.03) + ' 元</div>' +
          '<div class="pfr-sub">你的 ' + U.comma(totalValue) + ' 元变成 ' +
            U.comma(totalValue * 0.97) + ' 元，属噪音</div>' +
        '</div>' +
        '<div class="pf-risk-item">' +
          '<div class="pfr-lbl">各腿同时打历史最深</div>' +
          '<div class="pfr-val up">-' + U.comma(totalValue - worstCase) + ' 元</div>' +
          '<div class="pfr-sub">变成 ' + U.comma(worstCase) + ' 元（加权 -' +
            wMdd.toFixed(2) + '%）</div>' +
        '</div>' +
        '<div class="pf-risk-item">' +
          '<div class="pfr-lbl">最惨那一只打历史最深</div>' +
          '<div class="pfr-val up">-' + U.comma(singleLoss) + ' 元</div>' +
          '<div class="pfr-sub">' + (worst ? U.esc(worst.f.name.slice(0, 10)) : '—') +
            ' 那笔 ' + U.comma(worst ? worst.value : 0) + ' 元 → ' +
            U.comma(singleLeft) + ' 元（' + (worst ? U.fmt(worst.f.mddAll) : '—') + '）</div>' +
        '</div>' +
      '</div>' +
      '<div class="note warn" style="margin-top:16px;margin-bottom:0">' +
        '<b>怎么读这三个数：</b><br>' +
        '· <b>「各腿同时打历史最深」是极端上限</b>——现实中债券和股票很少同时打最惨，' +
        '所以实际大概率没这么惨。<b>但你必须能接受这个数，才叫仓位合适。</b><br>' +
        '· 加权回撤 <b class="n">' + wMdd.toFixed(2) + '%</b> 是按你的实际权重算的，' +
        '比单独看每只基金更接近真相。<br>' +
        '· <b style="color:#f5b942">如果你看到这些数字睡不着，说明仓位重了，' +
        '而不是这些基金不好。</b>' +
      '</div>';
  }

  /* =========================================================
     总渲染
     ========================================================= */
  function renderAll() {
    var rows = list.map(calcOne).filter(Boolean);

    /* 净值日期 */
    var nd = document.getElementById('pfNavDate');
    if (nd) {
      var cnt = {}, bestD = '', bestN = 0;
      D.funds.forEach(function (f) {
        if (!f.last) return;
        cnt[f.last] = (cnt[f.last] || 0) + 1;
        if (cnt[f.last] > bestN) { bestN = cnt[f.last]; bestD = f.last; }
      });
      nd.textContent = bestD || '—';
    }

    renderForm();
    renderSummary(rows);
    renderTable(rows);
    if (rows.length) {
      renderStruct(rows);
      renderRisk(rows);
    }
  }

  renderAll();
})();
