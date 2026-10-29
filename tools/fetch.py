# -*- coding: utf-8 -*-
"""批量抓取东方财富基金公开数据（pingzhongdata）"""
import os, re, sys, json, time, concurrent.futures as cf
import requests

BASE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(BASE, 'raw')
os.makedirs(RAW, exist_ok=True)

# 基金全量列表（用于取基金名称/类型），缺失时自动下载
ALL = os.path.join(BASE, 'all_funds.js')
if not os.path.exists(ALL):
    print('下载基金全量列表…')
    r = requests.get('https://fund.eastmoney.com/js/fundcode_search.js',
                     headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://fund.eastmoney.com/'}, timeout=60)
    open(ALL, 'w', encoding='utf-8').write(r.text)

import os, json
_CFG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pool.json')
CFG = json.load(open(_CFG_PATH, encoding='utf-8'))
# 板块 → 基金代码列表（唯一来源就是 pool.json）
POOL = {k: v['funds'] for k, v in CFG['sectors'].items()}
CODES = [c for v in POOL.values() for c in v]

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36'


def fetch(code):
    path = os.path.join(RAW, code + '.js')
    # 【坑1 修复】原代码只要文件存在就返回 'cached'，导致不联网永远拿旧数据，
    # 而且会打印 "OK: 42/42" 假装成功。现在加过期判断：
    # 文件修改时间超过 MAX_AGE_HOURS 小时就重新抓。
    MAX_AGE_HOURS = 6
    if os.path.exists(path) and os.path.getsize(path) > 5000:
        age_h = (time.time() - os.path.getmtime(path)) / 3600
        if age_h < MAX_AGE_HOURS:
            return code, 'cached'
        # 过期了，继续往下走重新抓
    url = f'https://fund.eastmoney.com/pingzhongdata/{code}.js'
    # 【抗限流】东财会对短时间高频请求返回 514/429。
    # 策略：最多试 5 次，遇到 514/429 时指数退避（3s/6s/12s/24s），
    # 其他错误短暂等待。实测连续抓两轮会触发，所以退避必须够长。
    RATE_LIMIT = (514, 429, 503)
    for attempt in range(5):
        try:
            r = requests.get(
                url,
                headers={'User-Agent': UA,
                         'Referer': f'https://fund.eastmoney.com/{code}.html'},
                timeout=25
            )
            if r.status_code == 200 and 'fS_name' in r.text:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(r.text)
                return code, 'ok'
            if r.status_code in RATE_LIMIT:
                wait = 3 * (2 ** attempt)      # 3, 6, 12, 24, 48 秒
                print(f'  [限流] {code} 返回 {r.status_code}，等待 {wait}s 后重试（第 {attempt+1}/5 次）')
                time.sleep(wait)
                continue
            return code, f'bad_{r.status_code}'
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return code, 'fail'


if __name__ == '__main__':
    # 并发从 8 降到 4：实测 8 线程连续跑两轮会触发 514，4 线程更稳
    with cf.ThreadPoolExecutor(max_workers=4) as ex:
        res = list(ex.map(fetch, CODES))
    ok = [c for c, s in res if s in ('ok', 'cached')]
    bad = [(c, s) for c, s in res if s not in ('ok', 'cached')]
    print('OK:', len(ok), '/', len(CODES))
    print('FAIL:', bad)

    # 【关键】有缺失就让脚本失败退出，避免下游 build.py 拿半套数据算出错误结果。
    # GitHub Actions 会因为非 0 退出码标红，旧的 data.js 保持不变。
    if bad:
        print('')
        print('!! 有 %d 只基金抓取失败，中止后续构建（避免用残缺数据覆盖站点）' % len(bad))
        for c, st in bad:
            print('   %s: %s' % (c, st))
        sys.exit(1)
