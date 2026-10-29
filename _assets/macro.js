/* ===========================================================
   宏观雷达
   -----------------------------------------------------------
   设计原则（重要，不要改）：
   1. 不叫"预测"，叫"环境 + 敏感度"
   2. 新闻只列标题，不做自动利好/利空判断
      —— 同一条新闻对不同板块方向相反，自动标注只会误导
   3. 敏感度表明确标注"经验判断，非统计结论"
      —— 因为没有宏观变量的历史序列，跑不了回归
   =========================================================== */
(function () {
  'use strict';
  var D = window.DATA, U = window.UI;
  if (!D || !U) return;

  /* ================= 1. 当前环境 ================= */
  /* 只取 8 个最关键的，不是越多越好 */
  var KEY_VARS = [
    { key: 'XAU',   name: '伦敦金',     unit: '美元/盎司', why: '避险情绪 + 美元强弱的镜子' },
    { key: 'CL',    name: 'WTI 原油',   unit: '美元/桶',   why: '通胀的直接来源，也反映全球需求' },
    { key: 'CU',    name: '沪铜',       unit: '元/吨',    why: '「铜博士」，提前反映经济景气' },
    { key: 'IXIC',  name: '纳斯达克',   unit: '点',       why: '全球科技股的风向标' },
    { key: 'DJI',   name: '道琼斯',     unit: '点',       why: '美股传统蓝筹' },
    { key: 'HSI',   name: '恒生指数',   unit: '点',       why: '港股的定价锚' },
    { key: 'SH000001', name: '上证指数', unit: '点',     why: 'A 股整体水位' },
    { key: 'USDCNY', name: '美元兑人民币', unit: '',      why: '数字越大 = 人民币越弱 = QDII 基金越赚' }
  ];

  /* 从 D.market.items 里按 key 找 */
  var MKT = {};
  ((D.market && D.market.items) || []).forEach(function (x) {
    MKT[x.key] = x;
  });

  function renderMacro() {
    var host = document.getElementById('macroGrid');
    if (!host) return;

    var cards = KEY_VARS.map(function (v) {
      var it = MKT[v.key];
      if (!it) {
        return '<div class="mg-card mg-empty">' +
          '<div class="mg-name">' + v.name + '</div>' +
          '<div class="mg-val">—</div>' +
          '<div class="mg-why">暂未取到数据</div></div>';
      }
      var chg = it.chg;
      var tone = chg > 0 ? 'up' : (chg < 0 ? 'down' : '');
      var sign = chg > 0 ? '+' : '';
      var price = it.price;
      /* 价格格式：大数用千分位，小数保留 2 位 */
      var pTxt = price >= 1000
        ? U.comma(price)
        : (price >= 10 ? price.toFixed(2) : price.toFixed(4));

      return '<div class="mg-card">' +
        '<div class="mg-top">' +
          '<span class="mg-name">' + v.name + '</span>' +
          '<span class="mg-chg ' + tone + '">' + sign + chg.toFixed(2) + '%</span>' +
        '</div>' +
        '<div class="mg-val">' + pTxt +
          (v.unit ? '<small>' + v.unit + '</small>' : '') + '</div>' +
        '<div class="mg-why">' + v.why + '</div>' +
        '</div>';
    }).join('');

    host.innerHTML = '<div class="macro-grid">' + cards + '</div>';

    /* 环境解读 */
    var note = document.getElementById('macroNote');
    if (!note) return;

    var ups = [], downs = [];
    KEY_VARS.forEach(function (v) {
      var it = MKT[v.key];
      if (!it || !it.chg) return;
      (it.chg > 0 ? ups : downs).push(v.name);
    });

    var h = '<b>今天的环境：</b>';
    if (ups.length && downs.length) {
      h += '<b class="up">' + ups.join('、') + '</b> 在涨，' +
           '<b class="down">' + downs.join('、') + '</b> 在跌。';
    } else if (ups.length) {
      h += '主要资产普遍上涨（<b class="up">' + ups.join('、') + '</b>）。';
    } else if (downs.length) {
      h += '主要资产普遍下跌（<b class="down">' + downs.join('、') + '</b>）。';
    }

    h += '<br><b style="color:#e8eef8">但请注意：一天的涨跌是噪音，不是信号。</b>' +
      '单日 1% 以内的波动，绝大多数时候没有信息量。' +
      '真正需要关注的是<b>连续多周的方向</b>，而不是今天这一格。';

    note.className = 'note';
    note.innerHTML = h;
  }

  /* ================= 2. 敏感度矩阵 ================= */
  /* 每条：{变量, 板块, 敏感度 1-5, 方向, 说明}
     敏感度 5 = 几乎同向同幅，1 = 影响很小
     方向 +1 = 变量涨板块通常涨，-1 = 变量涨板块通常跌 */
  var SENS = [
    { v: '金价',   sec: 'gold',    s: 5, d: +1, note: '直接跟金价，几乎同幅' },
    { v: '金价',   sec: 'silver',  s: 5, d: +1, note: '跟金价但放大 1.5~2 倍' },
    { v: '金价',   sec: 'metal',   s: 2, d: +1, note: '间接（避险情绪传导）' },
    { v: '油价',   sec: 'oil',     s: 5, d: +1, note: '期货型几乎同幅' },
    { v: '油价',   sec: 'us',      s: 2, d: -1, note: '油价高→通胀→压制估值' },
    { v: '油价',   sec: 'metal',   s: 2, d: +1, note: '通胀预期推升商品' },
    { v: '铜价',   sec: 'metal',   s: 5, d: +1, note: '工业金属直接相关' },
    { v: '铜价',   sec: 'ashare',  s: 3, d: +1, note: '经济景气传导到周期股' },
    { v: '美元强弱', sec: 'gold',  s: 4, d: -1, note: '美元强→金价通常跌' },
    { v: '美元强弱', sec: 'emerging', s: 4, d: -1, note: '美元强→新兴市场资金流出' },
    { v: '美元强弱', sec: 'us',    s: 4, d: +1, note: '美元强→美股相对有吸引力' },
    { v: '人民币强弱', sec: 'us',  s: 4, d: -1, note: '人民币升值→QDII 收益被吃掉' },
    { v: '人民币强弱', sec: 'developed', s: 4, d: -1, note: '同上，QDII 通病' },
    { v: '人民币强弱', sec: 'gold', s: 3, d: -1, note: '黄金基金也是美元资产' },
    { v: '美债利率', sec: 'bondl', s: 5, d: -1, note: '利率涨→长债跌（久期效应）' },
    { v: '美债利率', sec: 'bonds', s: 2, d: -1, note: '短债对利率不敏感' },
    { v: '美债利率', sec: 'us',    s: 3, d: -1, note: '利率涨→成长股估值受压' },
    { v: '美股',    sec: 'us',     s: 5, d: +1, note: '直接跟踪' },
    { v: '美股',    sec: 'hk',     s: 3, d: +1, note: '全球风险偏好传导' },
    { v: '美股',    sec: 'ashare', s: 2, d: +1, note: '情绪面传导，A 股独立性较强' },
    { v: 'A股',     sec: 'ashare', s: 5, d: +1, note: '直接跟踪' },
    { v: 'A股',     sec: 'sector', s: 4, d: +1, note: '行业主题跟大盘同向但更颠' },
    { v: 'A股',     sec: 'dividend', s: 3, d: +1, note: '防守型，跟涨但涨得少' },
    { v: 'A股',     sec: 'convert', s: 4, d: +1, note: '股性部分跟正股' },
    { v: 'A股',     sec: 'metal',  s: 3, d: +1, note: '周期股联动' }
  ];

  var SECNAME = {};
  (D.sectors || []).forEach(function (s) { SECNAME[s.sec] = s.name; });

  function renderSens() {
    var host = document.getElementById('sensMatrix');
    if (!host) return;

    /* 按变量分组 */
    var byVar = {}, varOrder = [];
    SENS.forEach(function (x) {
      if (!byVar[x.v]) { byVar[x.v] = []; varOrder.push(x.v); }
      byVar[x.v].push(x);
    });

    var h = '<div class="sens-wrap">';
    varOrder.forEach(function (v) {
      var list = byVar[v].sort(function (a, b) { return b.s - a.s; });
      h += '<div class="sens-row">' +
        '<div class="sens-var">' + v + '</div>' +
        '<div class="sens-items">' +
        list.map(function (x) {
          var dirTxt = x.d > 0 ? '同向' : '反向';
          var dirCls = x.d > 0 ? 'up' : 'down';
          /* 敏感度用宽度表达 */
          var w = x.s / 5 * 100;
          return '<div class="sens-item">' +
            '<span class="si-sec">' + (SECNAME[x.sec] || x.sec) + '</span>' +
            '<span class="si-bar"><i style="width:' + w + '%"></i></span>' +
            '<span class="si-lv">' + x.s + '</span>' +
            '<span class="si-dir ' + dirCls + '">' + dirTxt + '</span>' +
            '<span class="si-note">' + x.note + '</span>' +
            '</div>';
        }).join('') +
        '</div></div>';
    });
    h += '</div>';

    h += '<div class="sens-legend">' +
      '<span><b>敏感度 1~5</b>：5 = 几乎同向同幅，1 = 影响很小</span>' +
      '<span><b>同向 / 反向</b>：变量涨的时候这个板块通常涨还是跌</span>' +
      '</div>';

    host.innerHTML = h;
  }

  /* ================= 3. 今日新闻 ================= */
  function renderNews() {
    var host = document.getElementById('newsList');
    var box = document.getElementById('newsBox');
    if (!host) return;

    var items = D.news || [];
    if (!items.length) {
      if (box) box.style.display = 'none';
      return;
    }

    var cnt = document.getElementById('newsCount');
    if (cnt) cnt.textContent = items.length;

    var ts = document.getElementById('newsTs');
    if (ts && D.market && D.market.ts) {
      ts.textContent = '抓取于 ' + D.market.ts;
    }

    host.innerHTML = '<div class="news-items">' +
      items.map(function (x, i) {
        var url = x.url || '';
        var title = U.esc(x.title);
        var inner =
          '<span class="ni-no">' + (i + 1) + '</span>' +
          '<span class="ni-body">' +
            '<span class="ni-title">' + title + '</span>' +
            '<span class="ni-meta">' + (x.time || '') +
              (x.src ? ' · ' + x.src : '') + '</span>' +
          '</span>';
        return url
          ? '<a class="ni" href="' + url + '" target="_blank" rel="noopener">' + inner + '</a>'
          : '<div class="ni">' + inner + '</div>';
      }).join('') +
      '</div>';
  }

  renderMacro();
  renderSens();
  renderNews();
})();
