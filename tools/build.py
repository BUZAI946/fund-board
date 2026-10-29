# -*- coding: utf-8 -*-
"""解析真实数据 -> 指标 + 历史情景概率回测 + 板块聚合 -> data.json"""
import os, re, json, math, ast, datetime, statistics as st

BASE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(BASE, 'raw')
DAY = datetime.timedelta(days=1)

POOL = {
    'gold':    ['000217', '000216', '002611', '000307', '000218', '518880', '159934'],
    'silver':  ['161226', '019005'],
    'oil':     ['501018', '161129', '160723', '162411', '160416'],
    'metal':   ['007910', '004432', '160221', '013081'],
    'overseas':['006479', '000834', '050025', '006075', '270042'],
    'hk':      ['000071', '000948', '012348', '012804'],
    'ashare':  ['000051', '000962', '001592', '011608'],
    'sector':  ['003095', '161725', '008888', '001594', '007466'],
    'bond':    ['110017', '003376', '000015', '001512'],
    'cash':    ['000198', '000509'],
}
CODES = [c for v in POOL.values() for c in v]

type_map = {}
_s = open(os.path.join(BASE, 'all_funds.js'), encoding='utf-8').read()
_s = _s[_s.find('['):_s.rfind(']') + 1]
for r in ast.literal_eval(_s):
    type_map[r[0]] = {'name': r[2], 'ftype': r[3]}


def dstr(ms):  # pingzhongdata 时间戳 +1 天 = 真实净值日期
    return (datetime.datetime.utcfromtimestamp(ms / 1000) + DAY).strftime('%Y-%m-%d')


def grab(txt, name):
    m = re.search(r'var\s+' + name + r'\s*=\s*(.*?);\s*(?:/\*|var\s|$)', txt, re.S)
    if not m:
        return None
    v = m.group(1).strip()
    try:
        return json.loads(v)
    except Exception:
        try:
            return float(v.strip('"'))
        except Exception:
            return None


def fnum(x, d=4):
    return None if x is None else round(float(x), d)


def rsi(series, n=14):
    if len(series) < n + 1:
        return None
    g = [max(series[i] - series[i - 1], 0) for i in range(1, len(series))]
    l = [max(series[i - 1] - series[i], 0) for i in range(1, len(series))]
    ag, al = sum(g[:n]) / n, sum(l[:n]) / n
    for i in range(n, len(g)):
        ag = (ag * (n - 1) + g[i]) / n
        al = (al * (n - 1) + l[i]) / n
    if al == 0:
        return 100.0 if ag > 0 else 50.0
    return 100 - 100 / (1 + ag / al)


def mdd(vals):
    pk = -1e18; m = 0.0
    for v in vals:
        pk = max(pk, v)
        if pk > 0:
            m = min(m, v / pk - 1)
    return m * 100


def ma(v, n):
    return sum(v[-n:]) / n if len(v) >= n else None


def ma_at(v, n, i):
    return None if i + 1 < n else sum(v[i + 1 - n:i + 1]) / n


def rsi_bucket(v):
    if v < 30: return '超卖(<30)'
    if v < 45: return '偏弱(30~45)'
    if v <= 55: return '中性(45~55)'
    if v <= 70: return '偏强(55~70)'
    return '超买(>70)'


def backtest(ac, cur_trend, cur_rsi):
    """历史情景回测：与当前'趋势+RSI区间'一致的历史时刻，未来H日上涨频率（向基准收缩）"""
    out = {}
    n = len(ac)
    for H, tag in [(5, 'w'), (20, 'm')]:
        if n < H + 120:
            out[tag] = {'p': None, 'n': 0, 'hits': 0, 'base': None, 'desc': '历史数据不足', 'sig': False}
            continue
        rows = []
        for i in range(60, n - H, 2):
            m20, m60 = ma_at(ac, 20, i), ma_at(ac, 60, i)
            rr = rsi(ac[max(0, i - 59):i + 1])
            if m20 is None or m60 is None or rr is None:
                continue
            rows.append({'t': m20 > m60, 'b': rsi_bucket(rr), 'up': ac[i + H] / ac[i] - 1 > 0,
                         'f': (ac[i + H] / ac[i] - 1) * 100})
        if len(rows) < 40:
            out[tag] = {'p': None, 'n': 0, 'hits': 0, 'base': None, 'desc': '历史数据不足', 'sig': False}
            continue
        base = sum(1 for x in rows if x['up']) / len(rows)
        tb = rsi_bucket(cur_rsi or 50)
        cond = [x for x in rows if x['t'] == cur_trend and x['b'] == tb]
        if len(cond) >= 40:
            used = cond
            desc = f'历史上有 {len(cond)} 个交易日与现在处境相同（{"20日均线在60日均线上方" if cur_trend else "20日均线在60日均线下方"} + RSI处于{tb}）'
        else:
            cond2 = [x for x in rows if x['t'] == cur_trend]
            if len(cond2) >= 40:
                used = cond2
                desc = f'历史上有 {len(cond2)} 个交易日与现在同处{"上升" if cur_trend else "下降"}趋势（样本不足时放宽条件）'
            else:
                used = rows
                desc = f'该基金全部 {len(rows)} 个历史交易日'
        hits = sum(1 for x in used if x['up'])
        p = hits / len(used)
        K = 20.0
        p_adj = (len(used) * p + K * base) / (len(used) + K)   # 向历史基准收缩，避免小样本极端值
        fs = [x['f'] for x in used]
        out[tag] = {'p': round(p_adj * 100, 1), 'raw': round(p * 100, 1), 'n': len(used), 'hits': hits,
                    'base': round(base * 100, 1), 'desc': desc,
                    'sig': len(used) >= 60 and abs(p_adj - 0.5) > 0.06,
                    'avg': round(sum(fs) / len(fs), 2), 'best': round(max(fs), 2), 'worst': round(min(fs), 2)}
    return out


def hold_win(ac, days):
    n = len(ac)
    if n < days + 60:
        return None
    tot = hit = 0
    for i in range(0, n - days, 5):
        tot += 1
        if ac[i + days] / ac[i] - 1 > 0:
            hit += 1
    return {'n': tot, 'win': round(hit / tot * 100, 1)} if tot >= 20 else None


# ---------------- 单只基金 ----------------
def build_fund(code):
    txt = open(os.path.join(RAW, code + '.js'), encoding='utf-8').read()
    info = type_map.get(code, {'name': code, 'ftype': ''})
    d = {'code': code, 'name': info['name'], 'ftype': info['ftype']}
    m = re.search(r'var\s+fS_name\s*=\s*"([^"]*)"', txt)
    if m: d['name'] = m.group(1)
    ishb = 'var ishb=true' in txt
    for key, out in [('syl_1n', 'syl_1n'), ('syl_6y', 'syl_6y'), ('syl_3y', 'syl_3y'), ('syl_1y', 'syl_1y'),
                     ('fund_Rate', 'rate'), ('fund_minsg', 'minsg'), ('fund_sourceRate', 'srcRate')]:
        v = grab(txt, key)
        if isinstance(v, str):
            v = v.replace('%', '')
            try: v = float(v)
            except Exception: v = None
        d[out] = v
    fs = grab(txt, 'Data_fluctuationScale')
    if isinstance(fs, dict) and fs.get('series'):
        d['scale'] = fnum(fs['series'][-1]['y'], 2)
        d['scale_trend'] = [{'d': c, 'y': round(float(x['y']), 2), 'mom': x.get('mom')}
                            for c, x in zip(fs.get('categories', []), fs['series'])]
    pe = grab(txt, 'Data_performanceEvaluation')
    if isinstance(pe, dict):
        d['score'] = {'avr': pe.get('avr'), 'cats': pe.get('categories'), 'data': pe.get('data'), 'dsc': pe.get('dsc')}
    mgr = grab(txt, 'Data_currentFundManager')
    if isinstance(mgr, list) and mgr:
        g = mgr[0]
        pf = (g.get('power') or {}).get('profit') or {}
        mg = {'name': g.get('name'), 'star': g.get('star'), 'workTime': g.get('workTime'),
              'fundSize': g.get('fundSize'), 'avr': (g.get('power') or {}).get('avr')}
        if pf.get('series'):
            mg['cats'] = pf.get('categories')
            mg['data'] = [x.get('y') for x in pf['series'][0]['data']]
        d['manager'] = mg
    hs = grab(txt, 'Data_holderStructure')
    if isinstance(hs, dict) and hs.get('series'):
        d['holder'] = {'cats': hs.get('categories'), 'series': [{'name': x['name'], 'data': x['data']} for x in hs['series']]}
    aa = grab(txt, 'Data_assetAllocation')
    if isinstance(aa, dict) and aa.get('categories'):
        d['asset'] = {'cats': aa.get('categories'),
                      'series': [{'name': x['name'], 'data': x['data']} for x in aa.get('series', [])]}
    rsp = grab(txt, 'Data_rateInSimilarPersent')
    if isinstance(rsp, list) and rsp:
        last = rsp[-1]
        d['rank_pct'] = last[-1] if isinstance(last, list) else (last.get('y') if isinstance(last, dict) else None)
        if not isinstance(d.get('rank_pct'), (int, float)): d['rank_pct'] = None

    # ---- 货币基金 ----
    if ishb:
        s7 = grab(txt, 'Data_sevenDaysYearIncome') or []
        mc = grab(txt, 'Data_millionCopiesIncome') or []
        s7 = [(dstr(x[0]), float(x[1])) for x in s7 if len(x) >= 2]
        mc = [(dstr(x[0]), float(x[1])) for x in mc if len(x) >= 2]
        d['kind'] = 'money'
        d['last_date'] = s7[-1][0] if s7 else None
        d['start_date'] = s7[0][0] if s7 else None
        d['points'] = len(s7)
        d['y7'] = round(s7[-1][1], 4) if s7 else None
        d['million'] = round(mc[-1][1], 4) if mc else None
        d['y7_series'] = [{'d': a, 'v': round(b, 4)} for a, b in s7[-260:]]
        d['y7_min'] = round(min(v for _, v in s7[-260:]), 3) if s7 else None
        d['y7_max'] = round(max(v for _, v in s7[-260:]), 3) if s7 else None
        d['y7_avg'] = round(sum(v for _, v in s7[-260:]) / len(s7[-260:]), 3) if s7 else None
        d['nav'] = 1.0
        d['vol'] = 0.0
        d['prob'] = {'w': {'p': None, 'n': 0}, 'm': {'p': None, 'n': 0}}
        return d

    nw = grab(txt, 'Data_netWorthTrend') or []
    acw = grab(txt, 'Data_ACWorthTrend') or []
    if not nw:
        return None
    dates = [dstr(x['x']) for x in nw]
    nav = [float(x['y']) for x in nw]
    er = [float(x.get('equityReturn') or 0) for x in nw]
    acmap = {}
    for a in acw:
        try: acmap[dstr(a[0])] = float(a[1])
        except Exception: pass
    ac = [acmap.get(dt, nv) for dt, nv in zip(dates, nav)]

    # 用 f10 权威数据校验/补最新点
    fp = os.path.join(RAW, 'f10_%s.json' % code)
    if os.path.exists(fp):
        j = json.load(open(fp, encoding='utf-8'))
        for row in j['list']:
            dt, v = row['FSRQ'], float(row['DWJZ'])
            if dt > dates[-1]:
                dates.append(dt); nav.append(v); ac.append(float(row['LJJZ'] or v))
                er.append(float(row['JZZZL'] or 0))

    # 极端跳变处理：单日变动>25% 可能是份额折算（数据口径问题）也可能是真实暴跌。
    # 用东财官方「近1年收益率」做裁判：只有修复后更接近官方口径，才认定为折算并向前复权拼接。
    def _ret250(seq):
        return (seq[-1] / seq[-251] - 1) * 100 if len(seq) > 251 and seq[-251] > 0 else None
    jumps = [i for i in range(1, len(ac)) if ac[i - 1] > 0 and abs(ac[i] / ac[i - 1] - 1) > 0.25]
    cut = 0
    if jumps:
        raw250 = _ret250(ac)
        off = d.get('syl_1n')
        if off is not None and raw250 is not None and abs(off - raw250) > 12:
            backup = ac[:]
            for i in reversed(jumps):
                k = ac[i] / ac[i - 1]
                for j in range(i):
                    ac[j] *= k
            new250 = _ret250(ac)
            if new250 is None or abs(off - new250) >= abs(off - raw250):
                ac = backup          # 判定为真实波动，回滚
            else:
                cut = len(jumps)
    n = len(ac)
    d['kind'] = 'nav'
    d['truncated'] = bool(cut)
    d['start_date'] = dates[0]
    d['last_date'] = dates[-1]
    d['nav'] = fnum(nav[-1], 4)
    d['acnav'] = fnum(ac[-1], 4)
    d['chg1d'] = fnum(er[-1], 2)
    d['f10_check'] = True if os.path.exists(fp) else False

    def r(k):
        return fnum((ac[-1] / ac[-1 - k] - 1) * 100, 2) if n > k and ac[-1 - k] > 0 else None
    d['ret_5d'], d['ret_20d'], d['ret_60d'], d['ret_120d'], d['ret_250d'] = r(5), r(20), r(60), r(120), r(250)
    # 单位净值口径（不含分红再投），用于识别大额分红
    d['ret_250d_nav'] = fnum((nav[-1] / nav[-251] - 1) * 100, 2) if n > 251 and nav[-251] > 0 else None
    d['div_gap'] = (fnum(d['ret_250d'] - d['ret_250d_nav'], 2)
                    if d['ret_250d'] is not None and d['ret_250d_nav'] is not None else None)
    d['has_dividend'] = bool(d['div_gap'] is not None and abs(d['div_gap']) > 2)

    rets = [ac[i] / ac[i - 1] - 1 for i in range(1, n) if ac[i - 1] > 0]
    win = rets[-250:] if len(rets) >= 250 else rets
    if len(win) >= 20:
        sd = st.pstdev(win)
        d['vol'] = fnum(sd * math.sqrt(250) * 100, 2)
        d['mdd250'] = fnum(mdd(ac[-250:]) if n >= 250 else mdd(ac), 2)
        k = min(250, n - 1)
        d['ann_ret'] = fnum(((ac[-1] / ac[-1 - k]) ** (250 / k) - 1) * 100, 2) if n > 250 else None
        if d['ann_ret'] is not None and d['vol']:
            d['sharpe'] = fnum((d['ann_ret'] - 2.0) / (d['vol'] + 1e-9), 2)
            d['calmar'] = fnum(d['ann_ret'] / abs(d['mdd250']), 2) if d['mdd250'] else None
    d['mdd_all'] = fnum(mdd(ac), 2)
    # 技术指标统一基于复权（累计）净值，避免分红/拆分导致失真
    d['rsi14'] = fnum(rsi(ac[-90:]) if n >= 90 else rsi(ac), 1)
    d['ma5'], d['ma20'], d['ma60'] = fnum(ma(ac, 5), 4), fnum(ma(ac, 20), 4), fnum(ma(ac, 60), 4)
    d['dev_ma20'] = fnum((ac[-1] / ma(ac, 20) - 1) * 100, 2) if d['ma20'] else None
    d['dev_ma60'] = fnum((ac[-1] / ma(ac, 60) - 1) * 100, 2) if d['ma60'] else None
    w = ac[-min(250, n):]
    d['high52'], d['low52'] = fnum(max(w), 4), fnum(min(w), 4)
    d['pos52'] = fnum((ac[-1] - min(w)) / (max(w) - min(w)) * 100, 1) if max(w) > min(w) else None
    d['from_high'] = fnum((ac[-1] / max(w) - 1) * 100, 2)
    d['trend'] = 'up' if (d['ma20'] and d['ma60'] and d['ma20'] > d['ma60']) else 'down'
    d['prob'] = backtest(ac, d['trend'] == 'up', d['rsi14'])
    d['hold20'] = hold_win(ac, 20)
    d['hold250'] = hold_win(ac, 250)
    if d['vol']:
        d['sigma20'] = fnum(d['vol'] / 100 * math.sqrt(20 / 250) * 100, 2)
        d['band20'] = [fnum(nav[-1] * (1 - d['sigma20'] / 100), 4), fnum(nav[-1] * (1 + d['sigma20'] / 100), 4)]
    d['points'] = n
    d['series'] = [{'d': a, 'v': round(b, 4)} for a, b in list(zip(dates, ac))[-260:]]  # 复权(累计)净值
    return d


# ---------------- 板块聚合 ----------------
def build_sector(sec, funds):
    nav_f = [f for f in funds if f.get('kind') == 'nav' and f.get('series')]
    if not nav_f:  # 货币类：无净值走势，用 7 日年化聚合
        mf = [f for f in funds if f.get('kind') == 'money']
        y7 = [f['y7'] for f in mf if f.get('y7') is not None]
        s1 = [f.get('syl_1n') for f in mf if f.get('syl_1n') is not None]
        return {'sec': sec, 'series': None, 'ret_5d': None, 'ret_20d': None, 'ret_60d': None,
                'ret_120d': None, 'ret_250d': (round(sum(s1) / len(s1), 2) if s1 else None),
                'vol': 0.0, 'mdd250': 0.0, 'avg_20d': None, 'prob': None, 'n_funds': len(funds),
                'y7_avg': round(sum(y7) / len(y7), 3) if y7 else None, 'money': True}
    maps = [{x['d']: x['v'] for x in f['series']} for f in nav_f]
    dates = sorted(set.intersection(*[set(m) for m in maps]))[-300:]
    if len(dates) < 30:
        dates = sorted(set.union(*[set(m) for m in maps]))[-300:]
    idx = []
    for dt in dates:
        vals = []
        for m in maps:
            v = m.get(dt)
            if v is None:
                v = None
                for k in sorted(m):
                    if k <= dt: v = m[k]
                    else: break
            if v: vals.append(v)
        if vals: idx.append(sum(vals) / len(vals))
    base = idx[0]
    series = [{'d': dt, 'v': round(v / base * 100, 3)} for dt, v in zip(dates, idx)]
    vals = [x['v'] for x in series]
    n = len(vals)

    def r(k):
        return round((vals[-1] / vals[-1 - k] - 1) * 100, 2) if n > k else None
    rets = [vals[i] / vals[i - 1] - 1 for i in range(1, n)]
    v20 = [x['ret_20d'] for x in nav_f if x.get('ret_20d') is not None]
    ps = [x['prob']['m']['p'] for x in nav_f if (x.get('prob', {}).get('m') or {}).get('p') is not None]
    return {
        'sec': sec, 'dates': dates[:0], 'series': series,
        'ret_5d': r(5), 'ret_20d': r(20), 'ret_60d': r(60), 'ret_120d': r(120), 'ret_250d': r(250),
        'vol': round(st.pstdev(rets[-250:]) * math.sqrt(250) * 100, 2) if len(rets) >= 20 else None,
        'mdd250': round(mdd(vals), 2),
        'avg_20d': round(sum(v20) / len(v20), 2) if v20 else None,
        'prob': round(sum(ps) / len(ps), 1) if ps else None,
        'n_funds': len(funds),
    }


# ---------------- 行情 ----------------
def parse_market():
    p = os.path.join(BASE, 'market_raw.json')
    if not os.path.exists(p):
        return {}
    raw = json.load(open(p, encoding='utf-8'))
    r = raw['raw']
    out = {'ts': raw['ts'], 'items': []}

    def f(k):
        return (r.get(k) or '').split(',')

    def add(name, key, price, chg, unit, note, src='新浪财经'):
        try:
            out['items'].append({'name': name, 'key': key, 'price': round(float(price), 3),
                                 'chg': round(float(chg), 2), 'unit': unit, 'note': note, 'src': src})
        except Exception:
            pass

    x = f('hf_XAU');  add('伦敦金（现货黄金）', 'XAU', x[0], (float(x[0]) / float(x[7]) - 1) * 100 if len(x) > 7 and float(x[7] or 0) else 0, '美元/盎司', '国际金价基准')
    x = f('hf_XAG');  add('伦敦银（现货白银）', 'XAG', x[0], (float(x[0]) / float(x[7]) - 1) * 100 if len(x) > 7 and float(x[7] or 0) else 0, '美元/盎司', '国际银价基准')
    x = f('hf_CL');   add('纽约原油（WTI）', 'CL', x[0], (float(x[0]) / float(x[7]) - 1) * 100 if len(x) > 7 and float(x[7] or 0) else 0, '美元/桶', '国际油价基准')
    x = f('nf_AU0');  add('沪金主力', 'AU', x[6], (float(x[6]) / float(x[10]) - 1) * 100 if len(x) > 10 and float(x[10] or 0) else 0, '元/克', '上海期货交易所黄金')
    x = f('nf_AG0');  add('沪银主力', 'AG', x[6], (float(x[6]) / float(x[10]) - 1) * 100 if len(x) > 10 and float(x[10] or 0) else 0, '元/千克', '上海期货交易所白银')
    x = f('nf_CU0');  add('沪铜主力', 'CU', x[6], (float(x[6]) / float(x[10]) - 1) * 100 if len(x) > 10 and float(x[10] or 0) else 0, '元/吨', '工业金属风向标')
    x = f('gb_dji');  add('道琼斯指数', 'DJI', x[1], x[2], '点', '美股蓝筹')
    x = f('gb_ixic'); add('纳斯达克指数', 'IXIC', x[1], x[2], '点', '美股科技')
    x = f('gb_inx');  add('标普500指数', 'INX', x[1], x[2], '点', '美股大盘')
    x = f('rt_hkHSI');    add('恒生指数', 'HSI', x[6], x[8], '点', '中国香港市场')
    x = f('rt_hkHSTECH'); add('恒生科技指数', 'HSTECH', x[6], x[8], '点', '中国香港科技股')
    x = f('sh000001'); add('上证指数', 'SH000001', x[3], (float(x[3]) / float(x[2]) - 1) * 100, '点', 'A股大盘')
    x = f('sh000300'); add('沪深300', 'SH000300', x[3], (float(x[3]) / float(x[2]) - 1) * 100, '点', 'A股核心资产')
    x = f('sh000688'); add('科创50', 'SH000688', x[3], (float(x[3]) / float(x[2]) - 1) * 100, '点', 'A股硬科技')
    x = f('sz399006'); add('创业板指', 'SZ399006', x[3], (float(x[3]) / float(x[2]) - 1) * 100, '点', 'A股成长股')
    x = f('fx_susdcny'); add('美元/人民币', 'USDCNY', x[1], 0, '', '中间价')
    return out


if __name__ == '__main__':
    out_f = {}
    for sec, codes in POOL.items():
        for c in codes:
            d = build_fund(c)
            if not d:
                print('MISS', c); continue
            d['sec'] = sec
            out_f[c] = d
    sectors = {}
    for sec, codes in POOL.items():
        fl = [out_f[c] for c in codes if c in out_f]
        sectors[sec] = build_sector(sec, fl)
    data = {'funds': out_f, 'sectors': sectors, 'market': parse_market(),
            'pool': POOL, 'built_at': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
    json.dump(data, open(os.path.join(BASE, 'data.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    with open(os.path.join(BASE, 'data.js'), 'w', encoding='utf-8') as fj:
        fj.write('window.FUND_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';')
    print('funds', len(out_f), 'sectors', len(sectors))
    for k, v in sectors.items():
        if not v: print(k,'EMPTY'); continue
        print(k, 'n', v['n_funds'], '20d', v['ret_20d'], '250d', v['ret_250d'], 'vol', v['vol'], 'prob', v['prob'])
    print('market items', len(data['market'].get('items', [])))
    for it in data['market'].get('items', [])[:8]:   # 坑3修复：漏跑 fetch_extra 时不再 KeyError
        print('  ', it['name'], it['price'], it['chg'], it['unit'])
