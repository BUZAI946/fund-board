# -*- coding: utf-8 -*-
"""生成多页面看板的共享数据 assets/data.js

新增：按"资产大类"把 10 个板块分成三组，供 fund/stock/commodity 三个页面各取所需
  稳健组(fund)  : 债券、货币           → 靠利息/票息赚钱，波动极小
  权益组(stock) : A股宽基、中国香港、海外美股、行业主题 → 买的是股票
  商品组(commodity): 黄金、白银、原油、有色 → 买的是大宗商品

口径铁律（与全队统一）：
  收益率 ret_250d（近250交易日·累计净值·分红再投）
  板块 = 等权金额买入持有的算术平均
  组合回测起点归一化 1.0（assert 守）
"""
import io, json, os, statistics as st

_TOOLS = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_TOOLS)
SRC = os.path.join(_TOOLS, 'data.js')          # build.py 的产物
OUTDIR = os.path.join(_ROOT, '_assets')        # 站点资源目录
OUT = os.path.join(OUTDIR, 'data.js')

# ===== 全部配置来自 pool.json（唯一来源）=====
_CFG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pool.json')
CFG = json.load(open(_CFG_PATH, encoding='utf-8'))

SECTORS_CFG = CFG['sectors']          # key -> {name, group, order, desc, funds}

# 板块中文名
SEC = {k: v['name'] for k, v in SECTORS_CFG.items()}
# 板块 → 大类
SEC2GRP = {k: v['group'] for k, v in SECTORS_CFG.items()}
# 按 order 排序的板块顺序（不含 cash，cash 单独处理）
SEC_ORDER = [k for k, v in sorted(SECTORS_CFG.items(), key=lambda x: x[1]['order'])
             if k != 'cash']
# 大类定义：key -> (板块列表, 标题, 说明)
GROUP = {}
for gk, gv in CFG['groups'].items():
    members = [k for k, v in sorted(SECTORS_CFG.items(), key=lambda x: x[1]['order'])
               if v['group'] == gk]
    GROUP[gk] = (members, gv['title'], gv['desc'])

# （CASH_ANN 移到 D 定义之后再算）

raw = io.open(SRC, encoding='utf-8').read()
D = json.loads(raw[raw.index('=') + 1:].strip().rstrip(';'))
F = D['funds']

# 现金收益率：从数据里取货基的七日年化（不再硬编码 0.902%）
_CASH_CODE = CFG.get('cash_yield_code', '000509')
CASH_ANN = (F.get(_CASH_CODE, {}).get('y7') or 0.902) / 100

nav_codes = [c for c, f in F.items() if f.get('kind') == 'nav']
maps = {c: {x['d']: x['v'] for x in F[c]['series'][-260:]} for c in nav_codes}
common = None
for c in nav_codes:
    s = set(maps[c])
    common = s if common is None else (common & s)
# 【关键修复】取 251 个点 = 250 个交易日间隔，这样首尾相除正好是"近250交易日收益"
# 原代码取 250 点只有 249 个间隔，导致走势图窗口与 ret_250d 字段差 1 天、
# 起点差 13 天（因为 ret_250d 用各基金自己的最近 251 点），
# 结果走势图算出来的收益和表格数字对不上（最大差 4.43pp）。已统一。
DS = sorted(common)[-251:]
N = len(DS)
assert N == 251, '公共交易日应为 251 个点（250 个间隔），实际 %d' % N


def win_ret(code):
    """统一口径：用 DS 窗口（251点=250个交易日间隔）算收益率。

    全站唯一收益口径。走势图、表格、板块平均、组合回测、归因
    必须全部走这个函数，否则会出现"走势图算出来 -5.9%，表格写 -10.2%"的矛盾。
    """
    try:
        return round((maps[code][DS[-1]] / maps[code][DS[0]] - 1) * 100, 2)
    except Exception:
        return None


def downsample(vals, stride=4):
    out = vals[::stride]
    if out[-1] != vals[-1]:
        out.append(vals[-1])
    return out


def risk_tag(v):
    if v is None:
        return '未知'
    if v <= 1.5:
        return '几乎不颠'
    if v <= 5:
        return '小颠簸'
    if v <= 12:
        return '中等颠簸'
    if v <= 22:
        return '很颠簸'
    return '极颠簸'


def verdict(r, v):
    if v is None or r is None:
        return '数据不足，不下结论'
    if v <= 1.5:
        return '几乎不颠簸，是"存钱的升级版"'
    if v <= 5:
        return '小幅波动，收益比货基明显高' if r > 3 else '小幅波动，但收益没比存钱强多少'
    if v <= 12:
        if r > 5:
            return '中等颠簸，收益对得起这个风险'
        return '中等颠簸，收益一般般' if r > 0 else '中等颠簸，这一年还亏了钱'
    if v <= 22:
        if r > 10:
            return '很颠簸，但这一年确实赚得多'
        return '很颠簸，赚得不多，性价比低' if r > 0 else '很颠簸，这一年还亏了钱'
    if r > 20:
        return '极颠簸，收益极高，但很大程度是赶上风口'
    return '极颠簸，收益配不上这么大的风险' if r > 0 else '极颠簸，这一年还亏了钱'


def warns(f):
    w = []
    ma, rsi, p52, h20 = f.get('mdd_all'), f.get('rsi14'), f.get('pos52'), (f.get('hold20') or {}).get('win')
    if ma is not None and ma < -50:
        w.append('历史最深跌过 %.0f%%，1万会变成 %d 元' % (ma, round(10000 * (1 + ma / 100))))
    if h20 is not None and h20 < 50:
        w.append('历史上随便买、拿20天，只有 %.0f%% 概率赚钱' % h20)
    if rsi is not None and rsi > 70:
        w.append('短期涨太快（RSI %.0f 超买），此时追进去历史胜率更低' % rsi)
    if rsi is not None and rsi < 30:
        w.append('短期跌太狠（RSI %.0f 超卖），但超卖不等于见底' % rsi)
    if p52 is not None and p52 > 90:
        w.append('正在近一年最高位附近（位置 %.0f%%）' % p52)
    if p52 is not None and p52 < 20:
        w.append('正在近一年最低位附近（位置 %.0f%%）' % p52)
    return w


# ---------- 基金 ----------
funds = []
for c in nav_codes:
    f = F[c]
    nav, acnav = f.get('nav') or 0, f.get('acnav') or 0
    v0 = maps[c][DS[0]]
    seq = [round(maps[c][d] / v0 * 100, 3) for d in DS]
    grp = next(g for g, (secs, _, _) in GROUP.items() if f['sec'] in secs)
    # 机构持有四期（2024-12-31 / 2025-06-30 / 2025-12-31 / 2026-06-30）
    holder = f.get('holder') or {}
    inst, instCats = None, holder.get('cats') or []
    for s in holder.get('series', []):
        if s.get('name') == '机构持有比例':
            inst = s.get('data')
    instDelta = round(inst[-1] - inst[0], 2) if inst and len(inst) >= 2 else None
    funds.append({
        'code': c, 'name': f['name'], 'sec': f['sec'], 'secName': SEC.get(f['sec'], f['sec']),
        'grp': grp, 'ftype': f.get('ftype'),
        'nav': f.get('nav'), 'acnav': f.get('acnav'),
        'navAcGap': round((acnav / nav - 1) * 100, 1) if nav else None,
        # 【统一口径】ret250 一律用 DS 窗口重算，保证走势图/表格/板块平均/组合回测
        # 全部基于同一段时间。不再直接取原始 ret_250d（那是各基金自己的最近251点，
        # 起点与 DS 不同，会造成走势图与表格数字打架）。
        'ret250': win_ret(c),
        'ret250nav': f.get('ret_250d_nav'),
        'divGap': f.get('div_gap'), 'hasDiv': f.get('has_dividend'),
        'ret5': f.get('ret_5d'), 'ret20': f.get('ret_20d'),
        'ret60': f.get('ret_60d'), 'ret120': f.get('ret_120d'),
        'vol': f.get('vol'), 'mdd250': f.get('mdd250'), 'mddAll': f.get('mdd_all'),
        'sharpe': f.get('sharpe'), 'calmar': f.get('calmar'),
        'rsi': f.get('rsi14'), 'trend': f.get('trend'),
        'fromHigh': f.get('from_high'), 'pos52': f.get('pos52'),
        'devMa20': f.get('dev_ma20'), 'devMa60': f.get('dev_ma60'),
        'scale': f.get('scale'), 'rankPct': f.get('rank_pct'),
        'rate': f.get('rate'), 'minsg': f.get('minsg'),
        'hold20': (f.get('hold20') or {}).get('win'),
        'hold250': (f.get('hold250') or {}).get('win'),
        'n250': (f.get('hold250') or {}).get('n'),
        'manager': (f.get('manager') or {}).get('name'),
        'star': (f.get('manager') or {}).get('star'),
        'start': f.get('start_date'), 'last': f.get('last_date'),
        'inst': inst, 'instCats': instCats, 'instDelta': instDelta,
        'riskTag': risk_tag(f.get('vol')),
        'verdict': verdict(win_ret(c), f.get('vol')),
        'warns': warns(f),
        'seq': downsample(seq),
    })


def norm(vals, rev=False):
    lo, hi = min(vals), max(vals)
    if rev:
        return [1 - ((x - lo) / (hi - lo)) if hi > lo else .5 for x in vals]
    return [((x - lo) / (hi - lo)) if hi > lo else .5 for x in vals]


vv = norm([x['vol'] for x in funds], rev=True)
mm = norm([abs(x['mdd250']) for x in funds], rev=True)
ss = norm([x['sharpe'] for x in funds])
zz = norm([x['scale'] for x in funds])
ww = norm([x['hold250'] for x in funds])
for i, x in enumerate(funds):
    x['score'] = round((vv[i] * .30 + mm[i] * .25 + ss[i] * .20 + zz[i] * .10 + ww[i] * .15) * 100, 1)

# ---------- 板块 ----------
sectors = []
for sec in SEC_ORDER:
    cs = [c for c in nav_codes if F[c]['sec'] == sec]
    if not cs:
        continue
    grow = [[maps[c][d] / maps[c][DS[0]] for d in DS] for c in cs]
    idx = [st.mean(g[i] for g in grow) * 100 for i in range(N)]
    # 【统一口径】板块平均必须用与走势图相同的 DS 窗口重算，
    # 不能再用原始 ret_250d（那是各基金自己的最近251点，起点不同）。
    rets = [win_ret(c) for c in cs]
    peak, mddc = idx[0], 0.0
    for x in idx:
        peak = max(peak, x)
        mddc = min(mddc, x / peak - 1)
    mdd_combo = round(mddc * 100, 2)
    mdd_worst = round(min([F[c]['mdd250'] for c in cs]), 2)
    grp = next(g for g, (secs, _, _) in GROUP.items() if sec in secs)
    sectors.append({
        'sec': sec, 'name': SEC[sec], 'grp': grp, 'n': len(cs),
        'arith': round(st.mean(rets), 2),
        'worst': round(min(rets), 2), 'best': round(max(rets), 2),
        'spread': round(max(rets) - min(rets), 2),
        'vol': round(st.mean([F[c]['vol'] for c in cs]), 2),
        'mddCombo': mdd_combo, 'mddWorst': mdd_worst,
        'mddGap': round(abs(mdd_worst) - abs(mdd_combo), 2),
        'ret20': round(st.mean([F[c]['ret_20d'] for c in cs]), 2),
        'seq': downsample([round(x, 3) for x in idx]),
        'codes': cs,
    })

# ---------- 组合回测 ----------
# 组合定义来自 pool.json
PLANS = {}
PLAN_VERDICT = {}
for pk, pv in CFG['plans'].items():
    PLANS[pk] = (pv['name'], ([(c, w) for c, w in pv['legs']], pv.get('cash', 0)), pv.get('note', ''))
    PLAN_VERDICT[pk] = pv.get('verdict', '')


def backtest(plan, cash_w):
    """组合回测：等权金额买入持有（金额权重）

    正确公式：r_t = Σ(w_i / Σw) × (P_i,t / P_i,0)
    错误公式（曾误用）：Σ(w_i·P_i,t) / Σ(w_i·P_i,0)
      → 后者会让"每份净值更贵"的基金在分子分母中各占更大权重，
        等于按净值水平偷偷加杠杆。净值是无量纲的任意数，毫无投资含义。

    反例证明：A 基金 1.0→1.1(+10%)、B 基金 10.0→9.0(-10%)，各投 50%
      真实买入：5万/1.0=5万份→5.5万；5万/10=0.5万份→4.5万；合计10万→0%
      错误公式算出 -8.18%，正确公式算出 0.00%
    """
    wsum = sum(w for _, w in plan)
    assert wsum > 0, '权重和必须为正'
    seq = []
    for i, d in enumerate(DS):
        growth = sum((w / wsum) * (maps[c][d] / maps[c][DS[0]]) for c, w in plan)
        v = growth * (1 - cash_w) + cash_w * ((1 + CASH_ANN) ** (i / 250))
        seq.append(v)
    assert abs(seq[0] - 1.0) < 1e-9, '组合起点必须为1.0，实际 %r' % seq[0]
    rets = [seq[i + 1] / seq[i] - 1 for i in range(len(seq) - 1)]
    vol = st.pstdev(rets) * (250 ** .5) * 100
    peak, mdd = seq[0], 0
    for x in seq:
        peak = max(peak, x)
        mdd = min(mdd, x / peak - 1)
    r = round((seq[-1] / seq[0] - 1) * 100, 2)
    return {
        'n': len(seq), 'start': DS[0], 'end': DS[-1],
        'r250': r, 'vol': round(vol, 2), 'mdd': round(mdd * 100, 2),
        'sharpe': round((r - 2) / vol, 2) if vol else None,
        'seq': downsample([round(x * 100, 3) for x in seq]),
    }


plans = {}
for k, (nm, pc, note) in PLANS.items():
    plan, cw = pc
    b = backtest(plan, cw)
    # 【权重归一化】部分组合在定义时用了 1/1/1/1 这种写法（回测内部会按 wsum 归一，
    # 算得没错），但导出的 w 字段不自洽（合计 400%）。这里统一归一成 0~1 的小数，
    # 保证「legs 权重 + cash = 100%」这条不变量恒成立。数据校验页会验证它。
    _wsum = sum(w for _, w in plan) or 1
    _legs_norm = [{'code': c, 'w': round(w / _wsum * (1 - cw), 6)} for c, w in plan]
    b.update({'key': k, 'name': nm, 'note': note, 'verdict': PLAN_VERDICT[k],
              'legs': _legs_norm, 'cash': cw})
    plans[k] = b

# ---------- 货币 ----------
cash = [{'code': c, 'name': f['name'], 'yield7': f.get('y7'), 'million': f.get('million')}
        for c, f in F.items() if f.get('kind') == 'money']

# ---------- 单位/累计净值差距 ----------
gap = sorted([x for x in funds if x['navAcGap'] is not None], key=lambda x: -abs(x['navAcGap']))[:8]

# ---------- 资产大类汇总 ----------
groups = {}
for g, (secs, title, desc) in GROUP.items():
    ss_ = [s for s in sectors if s['grp'] == g]
    ff = [x for x in funds if x['grp'] == g]
    groups[g] = {
        'key': g, 'title': title, 'desc': desc,
        'secs': [s['sec'] for s in ss_],
        'n': len(ff), 'nSec': len(ss_),
        'avg': round(st.mean([x['ret250'] for x in ff]), 2) if ff else None,
        'vol': round(st.mean([x['vol'] for x in ff]), 2) if ff else None,
        'worstMdd': round(min([x['mddAll'] for x in ff]), 2) if ff else None,
        'best': round(max([x['ret250'] for x in ff]), 2) if ff else None,
        'worst': round(min([x['ret250'] for x in ff]), 2) if ff else None,
    }


# ---------- 相关性矩阵（9 板块两两日收益相关系数）----------
# 用全量 250 日的日收益率算 Pearson 相关，不是用降采样序列
sec_daily = {}
for sec in SEC_ORDER:
    cs = [c for c in nav_codes if F[c]['sec'] == sec]
    if not cs:
        continue
    grow = [[maps[c][d] / maps[c][DS[0]] for d in DS] for c in cs]
    idx = [st.mean(g[i] for g in grow) for i in range(N)]
    rets = [idx[i] / idx[i - 1] - 1 for i in range(1, N)]
    sec_daily[sec] = rets


def pearson(a, b):
    n = min(len(a), len(b))
    ma, mb = sum(a[:n]) / n, sum(b[:n]) / n
    num = sum((a[i] - ma) * (b[i] - mb) for i in range(n))
    da = sum((a[i] - ma) ** 2 for i in range(n)) ** .5
    db = sum((b[i] - mb) ** 2 for i in range(n)) ** .5
    return num / (da * db) if da and db else 0.0


corr_seq = [x for x in SEC_ORDER if x in sec_daily]
corr_matrix = []
for a in corr_seq:
    row = []
    for b in corr_seq:
        row.append(round(pearson(sec_daily[a], sec_daily[b]), 3))
    corr_matrix.append(row)

correlations = {
    'secs': corr_seq,
    'names': [SEC[x] for x in corr_seq],
    'matrix': corr_matrix,
}

# ---------- 建议组合 J 的收益归因（每条腿贡献多少 pp）----------
# 归因用建议组合 J（从配置读，不再硬编码）
_J = CFG['plans']['J']
_J_SUM = sum(w for _, w in _J['legs'])
J_CASH = _J.get('cash', 0)
J_LEGS = [(c, w / _J_SUM * (1 - J_CASH)) for c, w in _J['legs']]
attr = []
for code, w in J_LEGS:
    ret = win_ret(code)
    attr.append({
        'code': code, 'name': F[code]['name'], 'w': round(w * 100, 1),
        'ret': ret, 'contrib': round(w * ret, 3),
        'sec': F[code]['sec'],
    })
attr.append({
    'code': CFG.get('cash_yield_code', '000509'), 'name': '现金（货币基金）', 'w': round(J_CASH * 100, 1),
    'ret': round(CASH_ANN * 100, 3), 'contrib': round(J_CASH * CASH_ANN * 100, 3),
    'sec': 'cash',
})
attribution = {
    'legs': attr,
    'total': round(sum(a['contrib'] for a in attr), 2),
}

# ---------- 定投模拟所需：板块日收益序列（已在上方 sec_daily）----------
# 不必额外导出，前端用 sectors[].seq 近似即可；精确模拟放在前端用每日收益
daily_returns = {k: [round(x * 100, 4) for x in v] for k, v in sec_daily.items()}

out = {
    'builtAt': D['built_at'],
    'axis': downsample(DS),
    'axisFull': N,
    'groups': groups,
    'market': D['market'],
    'sectors': sectors,
    'funds': funds,
    'plans': plans,
    'navGapTop': gap,
    'cash': cash,
    'correlations': correlations,
    'attribution': attribution,
    'dailyReturns': daily_returns,
}

os.makedirs(OUTDIR, exist_ok=True)
blob = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
io.open(OUT, 'w', encoding='utf-8').write('window.DATA=' + blob + ';\n')

print('公共交易日 %d 天：%s ~ %s' % (N, DS[0], DS[-1]))
print('基金 %d 只 / 板块 %d 个 / 组合 %d 种 / 货基 %d 只' % (len(funds), len(sectors), len(plans), len(cash)))
print('输出 %s  %d 字节' % (OUT, len(blob.encode('utf-8'))))
print()
for g, v in groups.items():
    print('  %-10s %-24s %2d只 / %d板块  平均%7.2f%%  波动%5.2f%%  最惨个基%7.2f%%'
          % (g, v['title'], v['n'], v['nSec'], v['avg'], v['vol'], v['worstMdd']))
print()
for k, v in plans.items():
    print('  %s %-22s %7.2f%%  波动%5.2f%%  回撤%7.2f%%  夏普%s'
          % (k, v['name'], v['r250'], v['vol'], v['mdd'], v['sharpe']))
