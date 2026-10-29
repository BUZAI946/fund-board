# -*- coding: utf-8 -*-
"""补充抓取：1) f10 最新净值（权威校验） 2) 上游资产实时行情（新浪）"""
import os, re, json, time, concurrent.futures as cf, requests, datetime

BASE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(BASE, 'raw')
import os, json
_CFG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pool.json')
CFG = json.load(open(_CFG_PATH, encoding='utf-8'))
# 板块 → 基金代码列表（唯一来源就是 pool.json）
POOL = {k: v['funds'] for k, v in CFG['sectors'].items()}
CODES = [c for v in POOL.values() for c in v]
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36'


def f10(code):
    p = os.path.join(RAW, 'f10_%s.json' % code)
    if os.path.exists(p):
        return code, 'cached'
    try:
        r = requests.get('https://api.fund.eastmoney.com/f10/lsjz',
                         params={'fundCode': code, 'pageIndex': 1, 'pageSize': 20},
                         headers={'User-Agent': UA, 'Referer': 'https://fundf10.eastmoney.com/jjjz_%s.html' % code},
                         timeout=20)
        j = r.json()
        L = (j.get('Data') or {}).get('LSJZList') or []
        if not L:
            return code, 'empty'
        json.dump({'total': j.get('TotalCount'), 'list': L}, open(p, 'w', encoding='utf-8'), ensure_ascii=False)
        return code, 'ok'
    except Exception as e:
        return code, 'err:%s' % e


SINA = {
    'gold_spot': 'hf_XAU', 'silver_spot': 'hf_XAG', 'wti': 'hf_CL', 'brent': 'hf_OIL',
    'au_sh': 'nf_AU0', 'ag_sh': 'nf_AG0', 'cu_sh': 'nf_CU0',
    'dji': 'gb_dji', 'ixic': 'gb_ixic', 'inx': 'gb_inx',
    'hsi': 'rt_hkHSI', 'hstech': 'rt_hkHSTECH',
    'sh000001': 'sh000001', 'sh000300': 'sh000300', 'sh000688': 'sh000688', 'sz399006': 'sz399006',
    'usdcny': 'fx_susdcny', 'usdcnh': 'fx_susdcnh',
}


def news():
    """抓最新财经新闻（东财基金资讯 + 新浪财经滚动）。
    只取标题/时间/链接，**不做任何自动因果判断** ——
    一条新闻影响哪个板块是人的判断，程序不该替用户下结论。
    """
    UA2 = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
           'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36')
    out = []

    # 东财基金资讯
    try:
        u = ('https://np-listapi.eastmoney.com/comm/web/getNewsByColumns'
             '?client=web&biz=web_news_col&column=345&order=1'
             '&needInteractData=0&page_index=1&page_size=20')
        r = requests.get(u, headers={'User-Agent': UA2}, timeout=20)
        if r.status_code == 200:
            j = r.json()
            for x in (j.get('data') or {}).get('list') or []:
                t = (x.get('title') or '').strip()
                if not t:
                    continue
                out.append({
                    'src': '东财',
                    'title': t,
                    'time': (x.get('showTime') or x.get('date') or '')[:19],
                    'url': x.get('url') or x.get('newsUrl') or '',
                })
    except Exception as e:
        print('  news eastern err:', type(e).__name__)

    # 新浪财经滚动
    try:
        u2 = ('https://feed.mix.sina.com.cn/api/roll/get'
              '?pageid=153&lid=2516&num=20&page=1')
        r2 = requests.get(u2, headers={'User-Agent': UA2}, timeout=20)
        if r2.status_code == 200:
            j2 = r2.json()
            for x in (j2.get('result') or {}).get('data') or []:
                t = (x.get('title') or '').strip()
                if not t:
                    continue
                import datetime as _dt
                ct = x.get('ctime')
                tstr = ''
                if ct:
                    try:
                        tstr = _dt.datetime.fromtimestamp(int(ct)).strftime('%Y-%m-%d %H:%M:%S')
                    except Exception:
                        tstr = ''
                out.append({
                    'src': '新浪',
                    'title': t,
                    'time': tstr,
                    'url': x.get('url') or '',
                })
    except Exception as e:
        print('  news sina err:', type(e).__name__)

    # 去重 + 按时间倒序（没时间的排后面）
    seen = set()
    uniq = []
    for x in out:
        k = x['title'][:26]
        if k in seen:
            continue
        seen.add(k)
        uniq.append(x)
    uniq.sort(key=lambda x: x['time'] or '0000', reverse=True)
    uniq = uniq[:24]

    json.dump({'ts': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
               'items': uniq},
              open(os.path.join(BASE, 'news_raw.json'), 'w', encoding='utf-8'),
              ensure_ascii=False)
    print('news ok:', len(uniq))
    return uniq


def market():
    out = {}
    items = list(SINA.items())
    for i in range(0, len(items), 8):
        chunk = items[i:i + 8]
        q = ','.join(v for _, v in chunk)
        try:
            r = requests.get('https://hq.sinajs.cn/list=' + q,
                             headers={'User-Agent': UA, 'Referer': 'https://finance.sina.com.cn'}, timeout=20)
            txt = r.content.decode('gbk', 'ignore')
            for line in txt.split('\n'):
                m = re.match(r'var hq_str_(\w+)="(.*)";', line.strip())
                if m:
                    out[m.group(1)] = m.group(2)
        except Exception as e:
            print('mkt err', e)
        time.sleep(0.3)
    json.dump({'ts': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'), 'raw': out},
              open(os.path.join(BASE, 'market_raw.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    return out


if __name__ == '__main__':
    # 【重要】不要写回 pool.json！
    # pool.json 是人工维护的唯一配置源，程序写回会把它降级成简版
    # （丢掉 sectors 结构、板块名、组合定义），导致 build.py KeyError。
    # 这里只导出基金代码列表供调试，不覆盖配置。
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        res = list(ex.map(f10, CODES))
    print('f10 ok:', sum(1 for _, s in res if s in ('ok', 'cached')), '/', len(CODES))
    print('f10 fail:', [(c, s) for c, s in res if s not in ('ok', 'cached')])
    m = market()
    print('market keys:', len(m))
    nw = news()
    for x in nw[:5]:
        print('  ·', (x['time'] or '')[:16], x['title'][:50])
    for k in ['hf_XAU', 'hf_XAG', 'hf_CL', 'gb_ixic', 'rt_hkHSI', 'sh000001', 'fx_susdcny']:
        print(' ', k, (m.get(k) or '')[:90])
