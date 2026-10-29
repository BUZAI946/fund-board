/* 数据口径横幅：让用户随时知道"这些数字是哪段时间的" */
(function () {
  'use strict';
  var D = window.DATA;
  if (!D) return;
  var el = document.getElementById('dataBanner');
  if (!el) return;

  var axis = D.axis || [];
  var win0 = axis[0] || '?', win1 = axis[axis.length - 1] || '?';
  /* 注意：axis 是降采样序列（64 点），真实交易日数要看 axisFull（251 点 = 250 个间隔） */
  var n = (D.axisFull ? D.axisFull - 1 : (axis.length ? axis.length - 1 : 0));

  /* 最新净值日：取出现最多的日期 */
  var cnt = {}, bestD = '', bestN = 0;
  D.funds.forEach(function (f) {
    if (!f.last) return;
    cnt[f.last] = (cnt[f.last] || 0) + 1;
    if (cnt[f.last] > bestN) { bestN = cnt[f.last]; bestD = f.last; }
  });
  var qdii = D.funds.filter(function (f) { return f.last && f.last < bestD; }).length;

  el.className = 'data-banner';
  el.innerHTML =
    '<span class="db-ico">📅</span>' +
    '<span class="db-item">数据快照 <b>' + (D.builtAt || '—') + '</b></span>' +
    '<span class="db-sep">·</span>' +
    '<span class="db-item">收益窗口 <b>' + win0 + '</b> → <b>' + win1 + '</b>' +
      '（<b class="n">' + n + '</b> 个交易日）</span>' +
    '<span class="db-sep">·</span>' +
    '<span class="db-item">净值最新 <b>' + (bestD || '—') + '</b>' +
      (qdii ? '<span class="db-note">（' + qdii + ' 只 QDII 滞后 1~2 天）</span>' : '') +
    '</span>' +
    '<span class="db-pill">全站统一口径</span>' +
    '<span class="db-funds">全站 40 只均为基金：债券4 / 股票18 / 商品18，无个股</span>';
})();
