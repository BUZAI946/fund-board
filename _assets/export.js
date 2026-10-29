/* ===========================================================
   导出模块：真正的 Excel（.xlsx）+ 干净打印（PDF）
   设计原则：
     1) 导"底层数据"，不是抓页面 DOM —— 避免把 syl_1n / div_gap 这类
        字段名当成内容导出去（用户反馈"表里有英文函数"就是这个原因）。
     2) 生成真 .xlsx（ZIP + OOXML），Excel 打开就是带表头样式、
        列宽自适应、冻结首行、可筛选的漂亮表格。
     3) PDF 走"专用打印视图"：html[data-theme=light] + 专用打印样式，
        不依赖原页面那堆硬编码的深色内联样式。
   依赖：data.js
   =========================================================== */
(function () {
  'use strict';
  var D = window.DATA;
  if (!D) return;

  /* ===================================================================
     一、极简 ZIP 写入器（STORE 无压缩，够用且不依赖任何库）
     =================================================================== */
  var CRC_T = null;
  function crc32(buf) {
    if (!CRC_T) {
      CRC_T = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        CRC_T[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) {
      crc = CRC_T[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      else {
        out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F),
                 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }
    }
    return new Uint8Array(out);
  }

  function makeZip(files) {
    var now = new Date();
    var dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
    var dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

    var parts = [], central = [], offset = 0;

    files.forEach(function (f) {
      var nameB = utf8(f.name);
      var data = f.data;
      var crc = crc32(data);
      var len = data.length;

      var lh = new Uint8Array(30 + nameB.length);
      var dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034B50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0x0800, true);      /* UTF-8 文件名 */
      dv.setUint16(8, 0, true);           /* 存储、不压缩 */
      dv.setUint16(10, dosTime, true);
      dv.setUint16(12, dosDate, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, len, true);
      dv.setUint32(22, len, true);
      dv.setUint16(26, nameB.length, true);
      dv.setUint16(28, 0, true);
      lh.set(nameB, 30);
      parts.push(lh, data);

      var ch = new Uint8Array(46 + nameB.length);
      var dv2 = new DataView(ch.buffer);
      dv2.setUint32(0, 0x02014B50, true);
      dv2.setUint16(4, 20, true);
      dv2.setUint16(6, 20, true);
      dv2.setUint16(8, 0x0800, true);
      dv2.setUint16(10, 0, true);
      dv2.setUint16(12, dosTime, true);
      dv2.setUint16(14, dosDate, true);
      dv2.setUint32(16, crc, true);
      dv2.setUint32(20, len, true);
      dv2.setUint32(24, len, true);
      dv2.setUint16(28, nameB.length, true);
      dv2.setUint32(42, offset, true);
      ch.set(nameB, 46);
      central.push(ch);

      offset += lh.length + len;
    });

    var cSize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var eocd = new Uint8Array(22);
    var dv3 = new DataView(eocd.buffer);
    dv3.setUint32(0, 0x06054B50, true);
    dv3.setUint16(8, files.length, true);
    dv3.setUint16(10, files.length, true);
    dv3.setUint32(12, cSize, true);
    dv3.setUint32(16, offset, true);

    return new Blob(parts.concat(central, [eocd]), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  /* ===================================================================
     二、XLSX 生成器
     =================================================================== */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/\r?\n/g, '&#10;');
  }

  /* 列宽估算：汉字按 2，其他按 1 */
  function dispLen(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) n += (s.charCodeAt(i) > 255 ? 2 : 1);
    return n;
  }

  var STY = { TITLE: 4, HEADER: 1, TEXT: 2, NUM: 3, RED: 5, GREEN: 6, BOLD: 7 };

  var STYLES_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="6">' +
      '<font><sz val="10"/><name val="Microsoft YaHei"/></font>' +
      '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/></font>' +
      '<font><b/><sz val="15"/><color rgb="FF1F3A5F"/><name val="Microsoft YaHei"/></font>' +
      '<font><sz val="10"/><color rgb="FFC0392B"/><name val="Microsoft YaHei"/></font>' +
      '<font><sz val="10"/><color rgb="FF0E7A52"/><name val="Microsoft YaHei"/></font>' +
      '<font><b/><sz val="10"/><name val="Microsoft YaHei"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2">' +
      '<border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border>' +
        '<left style="thin"><color rgb="FFD6DCE6"/></left>' +
        '<right style="thin"><color rgb="FFD6DCE6"/></right>' +
        '<top style="thin"><color rgb="FFD6DCE6"/></top>' +
        '<bottom style="thin"><color rgb="FFD6DCE6"/></bottom>' +
        '<diagonal/>' +
      '</border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="8">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function colName(i) {
    var s = '';
    i++;
    while (i > 0) {
      var m = (i - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }

  /* 一个 sheet 的数据描述：
     { name, title, subtitle, headers:[str], rows:[[val,...]], types:[...] }
     types: 'txt' | 'num' | 'sig'（带正负色的数字） */
  function sheetXml(sh) {
    var headers = sh.headers, rows = sh.rows, types = sh.types || [];
    var nCol = headers.length;
    var ref = 'A1:' + colName(nCol - 1) + (rows.length + 2);

    /* 列宽 */
    var widths = headers.map(function (h, i) {
      var w = dispLen(String(h));
      rows.forEach(function (r) {
        var v = r[i];
        if (v === null || v === undefined) return;
        var t = typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v);
        var l = dispLen(t);
        if (l > w) w = l;
      });
      return Math.min(42, Math.max(8, w + 2.5));
    });

    var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="' + ref + '"/>' +
      /* 冻结前 2 行（标题 + 表头） */
      '<sheetViews><sheetView workbookViewId="0" showGridLines="0">' +
        '<pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/>' +
        '<selection pane="bottomLeft" activeCell="A3" sqref="A3"/>' +
      '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="16"/>' +
      '<cols>' + widths.map(function (w, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w.toFixed(1) + '" customWidth="1"/>';
      }).join('') + '</cols>' +
      '<sheetData>';

    /* 第 1 行：标题 */
    x += '<row r="1" ht="26" customHeight="1">' +
      '<c r="A1" s="' + STY.TITLE + '" t="inlineStr"><is><t>' +
      esc(sh.title || sh.name) + '</t></is></c></row>';

    /* 第 2 行：表头 */
    x += '<row r="2" ht="22" customHeight="1">';
    headers.forEach(function (h, i) {
      x += '<c r="' + colName(i) + '2" s="' + STY.HEADER + '" t="inlineStr"><is><t>' +
        esc(h) + '</t></is></c>';
    });
    x += '</row>';

    /* 数据行 */
    rows.forEach(function (r, ri) {
      var rn = ri + 3;
      x += '<row r="' + rn + '" ht="16" customHeight="1">';
      for (var i = 0; i < nCol; i++) {
        var v = r[i];
        var t = types[i] || 'txt';
        var ref2 = colName(i) + rn;
        if (v === null || v === undefined || v === '') {
          x += '<c r="' + ref2 + '" s="' + STY.TEXT + '"/>';
        } else if (typeof v === 'number' && isFinite(v)) {
          var st = STY.NUM;
          if (t === 'sig') st = v > 0.0001 ? STY.RED : (v < -0.0001 ? STY.GREEN : STY.NUM);
          x += '<c r="' + ref2 + '" s="' + st + '"><v>' + (Math.round(v * 10000) / 10000) + '</v></c>';
        } else {
          x += '<c r="' + ref2 + '" s="' + STY.TEXT + '" t="inlineStr"><is><t>' +
            esc(v) + '</t></is></c>';
        }
      }
      x += '</row>';
    });

    x += '</sheetData>' +
      '<autoFilter ref="A2:' + colName(nCol - 1) + (rows.length + 2) + '"/>' +
      '</worksheet>';
    return x;
  }

  function buildXlsx(sheets) {
    var files = [];
    var overrides = '';

    sheets.forEach(function (sh, i) {
      var idx = i + 1;
      files.push({ name: 'xl/worksheets/sheet' + idx + '.xml', data: utf8(sheetXml(sh)) });
      overrides += '<Override PartName="/xl/worksheets/sheet' + idx +
        '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    });

    files.push({
      name: '[Content_Types].xml',
      data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        overrides +
        '</Types>')
    });

    files.push({
      name: '_rels/.rels',
      data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>')
    });

    var sheetTags = '', relTags = '';
    sheets.forEach(function (sh, i) {
      sheetTags += '<sheet name="' + esc(sh.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
      relTags += '<Relationship Id="rId' + (i + 1) +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
    });

    files.push({
      name: 'xl/workbook.xml',
      data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets>' + sheetTags + '</sheets></workbook>')
    });

    files.push({
      name: 'xl/_rels/workbook.xml.rels',
      data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        relTags +
        '<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>')
    });

    files.push({ name: 'xl/styles.xml', data: utf8(STYLES_XML) });

    return makeZip(files);
  }

  /* ===================================================================
     三、组织数据（从 DATA 直接取，不抓 DOM）
     =================================================================== */
  function num(v, d) {
    if (v === null || v === undefined || isNaN(v)) return null;
    var p = Math.pow(10, d === undefined ? 2 : d);
    return Math.round(v * p) / p;
  }

  function groupName(g) {
    return { fund: '基金·稳健型', stock: '股票·权益型', commodity: '商品型' }[g] || g;
  }

  function trendName(t) {
    return { up: '上升', down: '下降', flat: '横盘' }[t] || (t || '—');
  }

  function buildSheets() {
    var sheets = [];

    /* ---------- Sheet 1：全部基金（全字段）---------- */
    var F = D.funds.slice().sort(function (a, b) { return b.ret250 - a.ret250; });
    var h1 = ['代码', '名称', '类型', '板块', '大类', '数据截至',
      '单位净值', '累计净值',
      '近5日(%)', '近20日(%)', '近60日(%)', '近120日(%)', '近250日(%)', '近250日·单位净值口径(%)',
      '分红口径差(pp)', '波动率(%)', '近250日最深(%)', '全历史最深(%)',
      '夏普比率', '卡玛比率', '持有20日胜率(%)', '持有250日胜率(%)',
      'RSI14', '52周位置(%)', '距52周高点(%)', '偏离MA20(%)', '偏离MA60(%)', '趋势',
      '同类排名·超越(%)', '东财评级', '机构持有(%)', '机构四期变化(pp)',
      '规模(亿元)', '费率(%)', '起购(元)', '基金经理', '是否分红'];
    var t1 = ['txt', 'txt', 'txt', 'txt', 'txt', 'txt',
      'num', 'num',
      'sig', 'sig', 'sig', 'sig', 'sig', 'sig',
      'num', 'num', 'num', 'num',
      'num', 'num', 'num', 'num',
      'num', 'num', 'num', 'num', 'num', 'txt',
      'num', 'num', 'num', 'sig',
      'num', 'num', 'num', 'txt', 'txt'];
    var r1 = F.map(function (f) {
      return [f.code, f.name, f.ftype || '', f.secName, groupName(f.grp), f.last || '',
        num(f.nav, 4), num(f.acnav, 4),
        num(f.ret5), num(f.ret20), num(f.ret60), num(f.ret120), num(f.ret250), num(f.ret250nav),
        num(f.divGap), num(f.vol), num(f.mdd250), num(f.mddAll),
        num(f.sharpe), num(f.calmar), num(f.hold20), num(f.hold250),
        num(f.rsi), num(f.pos52), num(f.fromHigh), num(f.devMa20), num(f.devMa60), trendName(f.trend),
        num(f.rankPct), num(f.star), num(f.inst && f.inst.length ? f.inst[f.inst.length - 1] : null),
        num(f.instDelta),
        num(f.scale), num(f.rate), num(f.minsg), f.manager || '', f.hasDiv ? '是' : '否'];
    });
    sheets.push({
      name: '全部基金', title: '全部基金明细（近250交易日口径）',
      headers: h1, rows: r1, types: t1
    });

    /* ---------- Sheet 2：九大板块 ---------- */
    var h2 = ['板块', '所属大类', '基金只数', '近一年平均(%)', '最好的一只(%)', '最差的一只(%)',
      '内部极差(pp)', '平均波动率(%)', '买齐一篮子回撤(%)', '单只最惨回撤(%)'];
    var t2 = ['txt', 'txt', 'num', 'sig', 'sig', 'sig', 'num', 'num', 'num', 'num'];
    var r2 = D.sectors.slice().sort(function (a, b) { return b.arith - a.arith; }).map(function (s) {
      return [s.name, groupName(s.grp), s.n, num(s.arith), num(s.best), num(s.worst),
        num(s.spread), num(s.vol), num(s.mddCombo), num(s.mddWorst)];
    });
    sheets.push({
      name: '九大板块', title: '九大板块聚合（等权金额买入持有口径）',
      headers: h2, rows: r2, types: t2
    });

    /* ---------- Sheet 3：组合回测 ---------- */
    var h3 = ['组合', '近一年(%)', '年化波动(%)', '最大回撤(%)', '夏普比率', '说明'];
    var t3 = ['txt', 'sig', 'num', 'num', 'num', 'txt'];
    var DESC = {
      A: '4只债券均配，一点股票都不碰',
      B: '长债为主 + 纯债 + 标普500 + 红利低波',
      C: 'A股 + 港股 + 债券 + 黄金 六腿分散',
      D: '九大板块各买一点',
      E: '全部买黄金（单押）',
      F: '全部买原油（单押）',
      G: '四类高波动品种均配',
      H: '原方案：长债 30%',
      J: '★ 本看板建议组合：债60 + 标普20 + 现金20',
      I: '对照：单买一只长债（003376）'
    };
    var r3 = Object.keys(D.plans).map(function (k) {
      var p = D.plans[k];
      return [k + ' ' + (p.name || ''), num(p.r250), num(p.vol), num(p.mdd), num(p.sharpe), DESC[k] || ''];
    });
    sheets.push({
      name: '组合回测', title: '10 种买法的真实回测（起点归一为 100）',
      headers: h3, rows: r3, types: t3
    });

    /* ---------- Sheet 4：建议组合归因 ---------- */
    var h4 = ['标的', '代码', '权重(%)', '自身收益(%)', '贡献(pp)'];
    var t4 = ['txt', 'txt', 'num', 'sig', 'sig'];
    var r4 = D.attribution.legs.map(function (l) {
      return [l.name, l.code, num(l.w), num(l.ret), num(l.contrib, 3)];
    });
    r4.push(['合计', '', 100, null, num(D.attribution.total, 3)]);
    sheets.push({
      name: '组合归因', title: '建议组合 J 收益归因（各腿贡献）',
      headers: h4, rows: r4, types: t4
    });

    /* ---------- Sheet 5：相关性矩阵 ---------- */
    var C = D.correlations;
    var h5 = ['板块'].concat(C.names);
    var t5 = ['txt'].concat(C.names.map(function () { return 'num'; }));
    var r5 = C.names.map(function (nm, i) {
      return [nm].concat(C.matrix[i].map(function (v) { return num(v, 3); }));
    });
    sheets.push({
      name: '相关性矩阵', title: '九大板块日收益相关系数（+1 同涨同跌，-1 反向）',
      headers: h5, rows: r5, types: t5
    });

    /* ---------- Sheet 6：实时行情 ---------- */
    var h6 = ['品种', '最新价', '涨跌(%)', '单位', '时间'];
    var t6 = ['txt', 'num', 'sig', 'txt', 'txt'];
    var r6 = D.market.items.map(function (m) {
      return [m.name, num(m.price, 4), num(m.chg), m.unit || '', D.market.ts || ''];
    });
    sheets.push({
      name: '实时行情', title: '宏观与大宗商品行情快照',
      headers: h6, rows: r6, types: t6
    });

    /* ---------- Sheet 7：数据说明 ---------- */
    var h7 = ['项目', '内容'];
    var t7 = ['txt', 'txt'];
    var axis = D.axis || [];
    var r7 = [
      ['数据快照时间', D.builtAt || ''],
      ['行情时间', D.market.ts || ''],
      ['收益窗口起', axis[0] || ''],
      ['收益窗口止', axis[axis.length - 1] || ''],
      ['窗口交易日数', (D.axisFull || axis.length) - 1],
      ['基金数量', D.funds.length],
      ['板块数量', D.sectors.length],
      ['收益率口径', '近250交易日 · 累计净值 · 含分红再投'],
      ['板块平均口径', '等权金额买入持有的算术平均（不按净值水平加权）'],
      ['走势图口径', '与表格完全一致：同一 DS 窗口，win_ret() 单一入口'],
      ['组合回测口径', '金额加权收益率 Σ(w/Σw)×(P_t/P_0)，起点归一为 1.0'],
      ['相关性口径', '250 个交易日的日收益率 Pearson 相关系数'],
      ['同类排名字段', 'rateInSimilarPersent＝超越同类的百分比，越大越好'],
      ['数据来源', '天天基金（东方财富）公开接口 + 东财 F10 双源校验 + 新浪财经行情'],
      ['免责声明', '仅供数据学习与展示，不构成投资建议。基金投资有风险。']
    ];
    sheets.push({
      name: '数据说明', title: '口径与来源说明（务必先读这一页）',
      headers: h7, rows: r7, types: t7
    });

    return sheets;
  }

  /* ===================================================================
     四、导出入口
     =================================================================== */
  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    if (a.style) a.style.display = 'none';
    if (document.body && document.body.appendChild) document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try {
        URL.revokeObjectURL(url);
        if (a.parentNode) a.parentNode.removeChild(a);
      } catch (e) {}
    }, 500);
  }

  function exportXLSX() {
    try {
      var sheets = buildSheets();
      var blob = buildXlsx(sheets);
      var d = new Date();
      var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0');
      download(blob, '基金数据看板-' + stamp + '.xlsx');
      toast('已导出 Excel：' + sheets.length + ' 个工作表，' + D.funds.length + ' 只基金');
    } catch (e) {
      console.error(e);
      alert('导出失败：' + (e && e.message ? e.message : e));
    }
  }

  /* 轻提示（全程防御：任何一步失败都不能影响"文件已下载"这件事） */
  function toast(msg) {
    try {
      var el = document.getElementById('expToast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'expToast';
        el.className = 'exp-toast';
        if (document.body && document.body.appendChild) document.body.appendChild(el);
      }
      el.textContent = msg;
      if (el.classList && el.classList.add) el.classList.add('show');
      clearTimeout(el._t);
      el._t = setTimeout(function () {
        if (el.classList && el.classList.remove) el.classList.remove('show');
      }, 3200);
    } catch (e) { /* 静默：提示失败不影响导出 */ }
  }

  /* ===================================================================
     五、PDF：专用打印视图
     =================================================================== */
  var PRINT_CSS = [
    '@page{size:A4;margin:12mm 10mm}',
    'html{background:#fff!important}',
    'body{background:#fff!important;color:#111!important;',
    '  font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif;',
    '  -webkit-print-color-adjust:exact;print-color-adjust:exact}',
    /* 隐藏所有交互与装饰 */
    '.topbar,.ticker,.to-top,.side-nav,.tool-box,.search-trigger,.search-mask,',
    '.read-progress,.gloss-tip,.quiz-mem,.sim-presets,.btnbar,.exp-toast,',
    '.chart-card .legend,.prev-next,#sPrevNext,.qr-foot,.db-pill,.sim-foot,' +
    '.no-print{display:none!important}',
    /* 全部文字强制深色（先统一，再恢复语义色） */
    'h1,h2,h3,h4,h5,p,span,b,strong,em,i,li,td,th,div,a,small,label{color:#1b2433!important}',
    /* 恢复语义色（红涨绿跌金强调） */
    '.up,.n.up,.hl-up,.num-cell.up,.bc-ret.up,.k-val[style*="ff4d5e"]{color:#c0392b!important}',
    '.down,.n.down,.hl-down,.num-cell.down,.bc-ret.down{color:#0e7a52!important}',
    '.hl,.n.hl{color:#9a6400!important}',
    /* 卡片白底细边 */
    '.card,.kpi,.plan-card,.term,.chart-card,.tbl-wrap,.bond-card,.memo-card,',
    '.heat-cell,.quiz-q,.quiz-result,.rel-card,.cal-body,.dca-stat,.sim-kpi,.sim-item,',
    '.stress-tbl,.panel,.num-wall,.nw-item{',
    '  background:#fff!important;background-image:none!important;',
    '  border:1px solid #d9dfe9!important;box-shadow:none!important;',
    '  break-inside:avoid;page-break-inside:avoid}',
    '.bond-card::before,.bond-card::after,.card::before,.card::after,',
    '.kpi::before,.kpi::after,.plan-card::before,.plan-card::after,',
    '.memo-card::before,.memo-card::after,.term::before{display:none!important}',
    /* 表格 */
    'table{width:100%;border-collapse:collapse;font-size:9.5pt}',
    'thead th{background:#1f3a5f!important;color:#fff!important;',
    '  padding:5px 6px;border:1px solid #1f3a5f!important;font-weight:700}',
    'tbody td{padding:4px 6px;border:1px solid #d9dfe9!important;color:#1b2433!important}',
    'tbody tr:nth-child(even) td{background:#f5f7fb!important}',
    /* 标题 */
    'h1{font-size:20pt;margin:0 0 6px}',
    'h2{font-size:13pt;margin:14px 0 6px;padding-left:8px;border-left:4px solid #1f3a5f}',
    'h3,h4{font-size:11pt;margin:10px 0 4px}',
    '.kicker{font-size:8pt;color:#7b8aa3!important;letter-spacing:1.5px;margin-bottom:2px}',
    /* 区块 */
    'section.block{padding:10px 0!important;border-top:1px solid #e7ebf2!important;',
    '  break-inside:avoid;page-break-inside:avoid}',
    '.wrap{max-width:none!important;padding:0!important}',
    /* 网格在纸上折成 2 列 */
    '.grid.g2,.grid.g3,.grid.g4{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important}',
    '.entry-grid{grid-template-columns:1fr 1fr 1fr!important}',
    '.hero{padding:14px 0 10px!important}',
    /* 图表保持可见 */
    '.chart-card svg{max-width:100%;height:auto}',
    'svg text{fill:#334155!important}',
    'svg line[stroke="#1a2740"]{stroke:#e2e8f0!important}',
    'svg line[stroke="#465a78"]{stroke:#94a3b8!important}',
    /* 可折叠内容全展开 */
    '.faq-a{max-height:none!important;overflow:visible!important}',
    '.faq-item{break-inside:avoid}',
    '.reveal{opacity:1!important;transform:none!important;animation:none!important}',
    '*{animation:none!important;transition:none!important;box-shadow:none!important;text-shadow:none!important}',
    /* 页脚免责 */
    'footer{margin-top:12px;padding-top:8px;border-top:1px solid #d9dfe9;font-size:8pt;color:#64748b!important}',
    'footer b,footer div{color:#64748b!important}'
  ].join('\n');

  function exportPDF() {
    var main = document.querySelector('main');
    if (!main) { alert('没找到正文内容。'); return; }

    var title = (document.title || '基金股票看板').split('·')[0].trim();
    var base = document.querySelector('link[rel="stylesheet"]');
    var href = base ? base.getAttribute('href') : '_assets/style.css';

    /* 克隆正文（SVG 会被作为标记一并复制，图表不丢） */
    var clone = main.cloneNode(true);

    /* 移除正文里的交互残留 */
    Array.prototype.forEach.call(
      clone.querySelectorAll('.btnbar,.to-top,.prev-next,.btn,.sim-presets,.qr-foot,.quiz-list button'),
      function (n) { if (n.parentNode) n.parentNode.removeChild(n); });

    /* 把所有折叠面板展开 */
    Array.prototype.forEach.call(clone.querySelectorAll('.faq-item'), function (n) {
      n.classList.add('open');
    });
    Array.prototype.forEach.call(clone.querySelectorAll('.reveal'), function (n) {
      n.classList.add('in');
    });

    var html = '<!DOCTYPE html><html lang="zh-CN" data-theme="light"><head>' +
      '<meta charset="UTF-8"><title>' + title + '</title>' +
      '<link rel="stylesheet" href="' + href + '">' +
      '<style>' + PRINT_CSS + '</style>' +
      '</head><body class="print-body">' +
      '<div class="wrap" style="max-width:1240px;margin:0 auto;padding:0 18px">' +
      '<div class="no-print" style="position:sticky;top:0;z-index:9;background:#fff;' +
        'padding:10px 0;border-bottom:1px dashed #cbd5e1;margin-bottom:10px;' +
        'display:flex;gap:12px;align-items:center">' +
        '<button onclick="window.print()" style="padding:9px 20px;border-radius:8px;' +
          'border:none;background:#1f3a5f;color:#fff;font-size:13px;font-weight:700;' +
          'cursor:pointer;font-family:inherit">🖨 打印 / 另存为 PDF</button>' +
        '<span style="font-size:12px;color:#64748b">' +
          '在打印对话框里把「目标打印机」选成「另存为 PDF」即可保存' +
        '</span></div>' +
      '<div style="padding:16px 0 10px;border-bottom:2px solid #1f3a5f;margin-bottom:14px">' +
        '<h1 style="margin:0 0 6px">' + title + '</h1>' +
        '<div style="font-size:9.5pt;color:#475569">' +
          '数据快照 ' + (D.builtAt || '—') +
          ' · 收益窗口 ' + ((D.axis || [])[0] || '?') + ' → ' +
          ((D.axis || [])[D.axis.length - 1] || '?') +
          '（' + ((D.axisFull || 250) - 1) + ' 个交易日）' +
          ' · 全站统一口径' +
        '</div>' +
      '</div>' +
      clone.innerHTML +
      '<div style="margin-top:16px;padding-top:10px;border-top:1px solid #d9dfe9;' +
        'font-size:8.5pt;color:#64748b;line-height:1.7">' +
        '<b>数据来源：</b>天天基金（东方财富）公开接口 · 东财 F10 官方净值双源校验 · 新浪财经行情<br>' +
        '<b>免责声明：</b>本报告仅供数据学习与展示，不构成投资建议。基金投资有风险，入市需谨慎。' +
        '历史业绩不代表未来表现。' +
      '</div>' +
      '</div>' +
      /* 自动触发打印：不能只挂在 onload 上（document.write 后 load 可能已过，
         会导致 onload 永不触发 = 用户点了没反应）。这里三路保险：
         ① readyState 已 complete 就直接延时调用
         ② 否则监听 load
         ③ 页面顶部放一个手动按钮兜底 */
      '<script>(function(){' +
        'var done=false;' +
        'function go(){if(done)return;done=true;try{window.focus();window.print();}catch(e){}}' +
        'if(document.readyState==="complete"){setTimeout(go,320);}' +
        'else{window.addEventListener("load",function(){setTimeout(go,320);});}' +
        'setTimeout(go,1500);' +   /* 最迟 1.5 秒一定弹出，防止事件丢失 */
      '})();<\/script>' +
      '</body></html>';

    var win = window.open('', '_blank');
    if (!win) {
      alert('浏览器拦截了弹出窗口。请允许本页面弹窗后重试。');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    toast('已打开打印视图，在弹窗里选择「另存为 PDF」即可');
  }

  /* 暴露 */
  window.SiteExport = { xlsx: exportXLSX, pdf: exportPDF, buildSheets: buildSheets };

})();
