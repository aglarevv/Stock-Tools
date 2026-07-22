#!/usr/bin/env python3
"""
AKShare 数据桥接脚本 — 供 Node.js 后端通过子进程调用
多数据源自动降级：东方财富 → 同花顺 → 新浪/腾讯

用法：
  echo '{"action":"kline","symbol":"000001"}' | python3 akshare_bridge.py
  python3 akshare_bridge.py '{"action":"industries"}'

所有输出为单行 JSON，包含 ok 和 data/error 字段。
"""

import sys
import json
import traceback
import random
import os

# 禁用系统代理
for key in ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy"]:
    os.environ.pop(key, None)

try:
    import akshare as ak
except ImportError:
    ak = None


def try_sources(*fns):
    """多数据源降级：依次尝试"""
    errors = []
    for name, fn in fns:
        try:
            result = fn()
            if result is not None and (not hasattr(result, 'empty') or not result.empty):
                return result, None
        except Exception as e:
            errors.append(f"[{name}] {e}")
    return None, "; ".join(errors) if errors else "所有数据源均失败"

# ═══════════════════════════════════════════════════════════════════
# 格式化函数
# ═══════════════════════════════════════════════════════════════════

def fmt_kline(row):
    """标准化K线输出"""
    return {
        "date": str(row.get("日期", "")),
        "open": float(row.get("开盘", 0) or 0),
        "close": float(row.get("收盘", 0) or 0),
        "high": float(row.get("最高", 0) or 0),
        "low": float(row.get("最低", 0) or 0),
        "volume": float(row.get("成交量", 0) or 0),
        "amount": float(row.get("成交额", 0) or 0),
        "amplitude": float(row.get("振幅", 0) or 0),
        "changePercent": float(row.get("涨跌幅", 0) or 0),
        "turnoverRate": float(row.get("换手率", 0) or 0),
    }


def fmt_quote(row):
    """标准化行情输出"""
    return {
        "code": str(row.get("代码", "")),
        "name": str(row.get("名称", "")),
        "price": float(row.get("最新价", 0) or 0),
        "open": float(row.get("今开", 0) or 0),
        "high": float(row.get("最高", 0) or 0),
        "low": float(row.get("最低", 0) or 0),
        "prevClose": float(row.get("昨收", 0) or 0),
        "change": float(row.get("涨跌额", 0) or 0),
        "changePercent": float(row.get("涨跌幅", 0) or 0),
        "volume": float(row.get("成交量", 0) or 0),
        "amount": float(row.get("成交额", 0) or 0),
        "amplitude": float(row.get("振幅", 0) or 0),
        "turnoverRate": float(row.get("换手率", 0) or 0),
        "pe": float(row.get("市盈率-动态", 0) or 0) or None,
        "totalMarketCap": float(row.get("总市值", 0) or 0) or None,
        "circulatingMarketCap": float(row.get("流通市值", 0) or 0) or None,
    }


# 预定义的高流动性A股列表（各行业龙头，确保有完整K线数据）
FALLBACK_STOCKS = [
    ("000001", "平安银行"), ("000002", "万科A"), ("000333", "美的集团"),
    ("000651", "格力电器"), ("000858", "五粮液"), ("002415", "海康威视"),
    ("002475", "立讯精密"), ("300059", "东方财富"), ("300124", "汇川技术"),
    ("300274", "阳光电源"), ("300750", "宁德时代"), ("600000", "浦发银行"),
    ("600036", "招商银行"), ("600085", "同仁堂"), ("600104", "上汽集团"),
    ("600276", "恒瑞医药"), ("600309", "万华化学"), ("600519", "贵州茅台"),
    ("600585", "海螺水泥"), ("600690", "海尔智家"), ("600809", "山西汾酒"),
    ("600887", "伊利股份"), ("600900", "长江电力"), ("600941", "中国移动"),
    ("601012", "隆基绿能"), ("601088", "中国神华"), ("601166", "兴业银行"),
    ("601318", "中国平安"), ("601398", "工商银行"), ("601857", "中国石油"),
    ("601899", "紫金矿业"), ("603259", "药明康德"), ("688111", "金山办公"),
    ("688981", "中芯国际"),
]


# ── 必盈API配置 ──
BIYING_LICENCE = "71A8595A-EE20-4676-BE62-266679583A70"


def get_random_kline(kline_count=500):
    """随机获取一只A股的K线数据（用于训练）

    从东方财富获取全量股票随机挑选，如果失败则从预定义龙头股列表随机抽取。
    """
    try:
        # 先尝试从必盈API获取全量股票并随机挑选
        try:
            import urllib.request, json as _json, ssl
            url = f"https://api.biyingapi.com/hslt/list/{BIYING_LICENCE}"
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            resp = urllib.request.urlopen(req, timeout=15, context=ctx)
            all_stocks = _json.loads(resp.read().decode("utf-8"))
            if all_stocks and isinstance(all_stocks, list):
                import random as _random
                _random.shuffle(all_stocks)
                for s in all_stocks[:50]:
                    dm = s.get("dm", "")
                    code = dm.replace(".SH", "").replace(".SZ", "").replace(".BJ", "")
                    name = s.get("mc", "")
                    klines = get_kline(code, "daily", None, None, kline_count=kline_count)
                    if klines and len(klines) >= 20:
                        klines = klines[-kline_count:]
                        return {
                            "ok": True,
                            "data": {
                                "code": code, "name": name,
                                "price": klines[-1]["close"],
                                "klines": klines,
                            }
                        }
        except Exception:
            pass  # 降级到预定义列表

        # 从预定义列表随机选
        import random as _random
        shuffled = FALLBACK_STOCKS[:]
        _random.shuffle(shuffled)
        for code, name in shuffled:
            klines = get_kline(code, "daily", None, None, kline_count=kline_count)
            if klines and len(klines) >= 20:
                klines = klines[-kline_count:]
                return {
                    "ok": True,
                    "data": {
                        "code": code, "name": name,
                        "price": klines[-1]["close"],
                        "klines": klines,
                    }
                }

        return get_embedded_kline()  # 降级到内置示例数据

    except Exception as e:
        return get_embedded_kline()  # 任何异常都降级到内置示例数据


# ── 终极降级：内置示例K线数据 ──
def get_embedded_kline():
    """返回一批内置的示例K线数据（当所有数据源均不可用时）"""
    import random as _r
    base = 18.50
    klines = []
    for i in range(500):
        o = round(base + _r.uniform(-0.5, 0.5), 2)
        c = round(o + _r.uniform(-0.8, 0.8), 2)
        h = round(max(o, c) + _r.uniform(0, 0.4), 2)
        l = round(min(o, c) - _r.uniform(0, 0.4), 2)
        base = c
        from datetime import datetime, timedelta
        d = (datetime(2022, 1, 4) + timedelta(days=i)).strftime("%Y-%m-%d")
        klines.append({"date": d, "open": o, "close": c, "high": h, "low": l, "volume": _r.randint(500, 5000) * 10000})
    return {
        "ok": True,
        "data": {
            "code": "000000", "name": "示例数据",
            "price": klines[-1]["close"], "klines": klines,
        }
    }


def _fetch_baostock(symbol, start_date, end_date):
    """通过 baostock 获取A股历史K线，返回标准 DataFrame"""
    import baostock as bs
    import pandas as _pd
    import os, sys
    # baostock 要求 YYYY-MM-DD 格式
    sd = f"{start_date[:4]}-{start_date[4:6]}-{start_date[6:8]}" if len(start_date) == 8 else start_date
    ed = f"{end_date[:4]}-{end_date[4:6]}-{end_date[6:8]}" if len(end_date) == 8 else end_date
    prefix = "sh" if symbol.startswith(("6", "9")) else "sz"
    full_code = f"{prefix}.{symbol}"
    # 抑制 baostock 的 stdout 输出（login/logout 日志污染 JSON）
    old_stdout = sys.stdout
    sys.stdout = open(os.devnull, 'w')
    lg = bs.login()
    sys.stdout.close()
    sys.stdout = old_stdout
    if lg.error_code != "0":
        return None
    try:
        sys.stdout = open(os.devnull, 'w')
        rs = bs.query_history_k_data_plus(
            full_code,
            "date,open,high,low,close,volume",
            start_date=sd, end_date=ed,
            frequency="d", adjustflag="2")
        if rs.error_code != "0":
            return None
        rows = []
        while rs.next():
            row = rs.get_row_data()
            if row[0]: rows.append(row)
        if not rows:
            return None
        df = _pd.DataFrame(rows, columns=["date", "open", "high", "low", "close", "volume"])
        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = _pd.to_numeric(df[col])
        df.rename(columns={"date": "日期", "open": "开盘", "high": "最高",
                           "low": "最低", "close": "收盘", "volume": "成交量"}, inplace=True)
        return df
    finally:
        sys.stdout = open(os.devnull, 'w')
        bs.logout()
        sys.stdout.close()
        sys.stdout = old_stdout


def get_kline(symbol, period, start, end, sina_symbol=None, kline_count=2000):
    """获取A股历史K线（仅使用 baostock）"""
    if not start:
        import datetime
        today = datetime.date.today()
        start = (today - datetime.timedelta(days=int(kline_count * 1.5))).strftime("%Y-%m-%d")
        end = today.strftime("%Y-%m-%d")
    try:
        df = _fetch_baostock(symbol, start, end)
        if df is not None and not df.empty:
            return [fmt_kline(row) for _, row in df.iterrows()]
    except Exception:
        pass
    return None


def get_quotes(symbols):
    """获取A股实时行情（通过 biyingapi）"""
    import urllib.request, json as _json, ssl
    results = []
    try:
        url = f"https://api.biyingapi.com/hslt/list/{BIYING_LICENCE}"
        ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        resp = urllib.request.urlopen(req, timeout=15, context=ctx)
        data = _json.loads(resp.read().decode("utf-8"))
        # biyingapi returns {dm, mc} but no price/spot. Return with placeholder prices.
        for sym in symbols:
            clean = sym.replace(".SH","").replace(".SZ","").replace(".BJ","")
            for item in data:
                dm = item.get("dm","").replace(".SH","").replace(".SZ","").replace(".BJ","")
                if dm == clean:
                    results.append({
                        "code": sym, "name": item.get("mc",""),
                        "price": 0, "open": 0, "high": 0, "low": 0,
                        "prevClose": 0, "change": 0, "changePercent": 0,
                        "volume": 0, "amount": 0,
                    })
                    break
    except Exception:
        pass
    return results


def search_stock(keyword):
    """搜索股票（通过 biyingapi 股票列表）"""
    import urllib.request, json as _json, ssl
    results = []
    try:
        url = f"https://api.biyingapi.com/hslt/list/{BIYING_LICENCE}"
        ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        resp = urllib.request.urlopen(req, timeout=15, context=ctx)
        data = _json.loads(resp.read().decode("utf-8"))
        kw = keyword.lower().strip()
        for item in data:
            dm = item.get("dm", "")
            mc = item.get("mc", "")
            code_clean = dm.replace(".SH","").replace(".SZ","").replace(".BJ","")
            if kw in mc.lower() or kw in code_clean.lower():
                market = "sh" if ".SH" in dm else "sz" if ".SZ" in dm else "bj"
                results.append({"code": code_clean, "name": mc, "category": "stock", "market": market})
                if len(results) >= 20:
                    break
    except Exception:
        pass
    return results


def get_industries(top_n=None):
    """获取行业板块列表（仅使用 biyingapi）"""
    return _fetch_biying_sectors(top_n, "industry")


def _fetch_biying_sectors(top_n=None, board_type="concept"):
    """从必盈API获取概念/行业指数列表"""
    import urllib.request, json as _json, ssl
    try:
        url = f"https://api.biyingapi.com/hslt/sectorslist/{BIYING_LICENCE}"
        ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        resp = urllib.request.urlopen(req, timeout=10, context=ctx)
        data = _json.loads(resp.read().decode("utf-8"))
        boards = []
        for i, item in enumerate(data[:top_n] if top_n else data):
            boards.append({
                "code": item.get("dm", ""), "name": item.get("mc", ""),
                "rank": i + 1, "price": 0, "change": 0, "changePercent": 0,
                "volume": 0, "amount": 0, "turnoverRate": 0,
                "riseCount": 0, "fallCount": 0,
                "leadingStock": "", "leadingStockChangePercent": 0,
                "boardType": board_type,
            })
        return boards
    except Exception:
        return []


def search_sectors(keyword):
    """搜索板块（行业+概念模糊匹配）"""
    results = []
    for getter, btype in [(get_industries, "industry")]:
        try:
            all_boards = getter()
            kw = keyword.lower().strip()
            for b in all_boards:
                if kw in b["name"].lower() or kw in b["code"].lower():
                    b["boardType"] = btype
                    results.append(b)
                    if len(results) >= 20:
                        break
        except Exception:
            continue
    return results


# ═══════════════════════════════════════════════════════════════════
# 主入口
# ═══════════════════════════════════════════════════════════════════

def main():
    if len(sys.argv) > 1:
        raw = sys.argv[1]
    else:
        raw = sys.stdin.read()

    try:
        req = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"ok": False, "error": f"JSON 解析失败: {e}"}, ensure_ascii=False))
        return

    action = req.get("action", "")
    try:
        if action == "kline":
            symbol = req.get("symbol", "").replace("sh", "").replace("sz", "").replace("bj", "")
            data = get_kline(symbol, req.get("period", "daily"), req.get("start"), req.get("end"))
            print(json.dumps({"ok": True, "data": data}, ensure_ascii=False, default=str))

        elif action == "quote":
            symbols = req.get("symbols", [])
            clean = [s.replace("sh", "").replace("sz", "").replace("bj", "").replace("hk", "").replace("us", "") for s in symbols]
            data = get_quotes(clean)
            print(json.dumps({"ok": True, "data": data}, ensure_ascii=False, default=str))

        elif action == "search":
            keyword = req.get("keyword", "")
            data = search_stock(keyword)
            print(json.dumps({"ok": True, "data": data}, ensure_ascii=False))

        elif action == "industries":
            data = get_industries(req.get("topN"))
            print(json.dumps({"ok": True, "data": data}, ensure_ascii=False, default=str))

        elif action == "searchSectors":
            keyword = req.get("keyword", "")
            data = search_sectors(keyword)
            print(json.dumps({"ok": True, "data": data}, ensure_ascii=False, default=str))

        elif action == "health":
            print(json.dumps({"ok": True, "data": {"status": "ready", "version": "biying+baostock"}}, ensure_ascii=False))

        elif action == "randomKline":
            result = get_random_kline(req.get("count", 500))
            print(json.dumps(result, ensure_ascii=False, default=str))

        else:
            print(json.dumps({"ok": False, "error": f"未知 action: {action}"}, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"ok": False, "error": f"{e}", "trace": traceback.format_exc()[:500]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
