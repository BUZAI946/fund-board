# -*- coding: utf-8 -*-
"""补充抓取：1) f10 最新净值（权威校验） 2) 上游资产实时行情（新浪）"""
import os, re, json, time, concurrent.futures as cf, requests, datetime

BASE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(BASE, 'raw')
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
    json.dump(POOL, open(os.path.join(BASE, 'pool.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        res = list(ex.map(f10, CODES))
    print('f10 ok:', sum(1 for _, s in res if s in ('ok', 'cached')), '/', len(CODES))
    print('f10 fail:', [(c, s) for c, s in res if s not in ('ok', 'cached')])
    m = market()
    print('market keys:', len(m))
    for k in ['hf_XAU', 'hf_XAG', 'hf_CL', 'gb_ixic', 'rt_hkHSI', 'sh000001', 'fx_susdcny']:
        print(' ', k, (m.get(k) or '')[:90])
