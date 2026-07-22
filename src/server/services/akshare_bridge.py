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

# 强制 requests 忽略代理
import requests as _requests
_requests.Session.trust_env = False
_requests.adapters.HTTPAdapter.send.__globals__['os'].environ.pop('HTTP_PROXY', None)

try:
    import akshare as ak
except ImportError:
    print(json.dumps({"ok": False, "error": "AKShare 未安装，请运行 pip install akshare"}, ensure_ascii=False))
    sys.exit(0)


def try_sources(*fns):
    """多数据源降级：依次尝试，返回第一个成功的结果"""
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


def get_kline(symbol, period, start, end, sina_symbol=None, kline_count=500):
    """获取A股历史K线（多源降级：baostock → 新浪 → 东方财富）"""
    period_map = {"daily": "daily", "weekly": "weekly", "monthly": "monthly"}
    p = period_map.get(period, "daily")

    # 根据请求数量动态计算开始日期
    if not start:
        import datetime
        today = datetime.date.today()
        start = (today - datetime.timedelta(days=int(kline_count * 1.5))).strftime("%Y%m%d")
        end = today.strftime("%Y%m%d")

    df, err = try_sources(
        ("baostock", lambda: _fetch_baostock(symbol, start, end)),
        ("新浪", lambda: ak.stock_zh_a_daily(
            symbol=sina_symbol or (f"sh{symbol}" if symbol.startswith(("6", "9")) else f"sz{symbol}"),
            adjust="qfq")),
        ("东方财富", lambda: ak.stock_zh_a_hist(
            symbol=symbol, period=p, start_date=start or "20250101",
            end_date=end or "20991231", adjust="qfq")),
    )
    if df is None or df.empty:
        return []
    # 新浪格式需要映射字段名
    klines = []
    for _, row in df.iterrows():
        date_val = str(row.get("日期", row.get("date", "")))
        klines.append({
            "date": date_val,
            "open": float(row.get("开盘", row.get("open", 0)) or 0),
            "close": float(row.get("收盘", row.get("close", 0)) or 0),
            "high": float(row.get("最高", row.get("high", 0)) or 0),
            "low": float(row.get("最低", row.get("low", 0)) or 0),
            "volume": float(row.get("成交量", row.get("volume", 0)) or 0),
            "amount": float(row.get("成交额", row.get("amount", 0)) or 0),
            "amplitude": float(row.get("振幅", row.get("amplitude", 0)) or 0),
            "changePercent": float(row.get("涨跌幅", row.get("changePercent", 0)) or 0),
            "turnoverRate": float(row.get("换手率", row.get("turnoverRate", 0)) or 0),
        })
    return klines


def get_quotes(symbols):
    """获取A股实时行情（多源降级：东方财富 → 新浪/腾讯）"""
    results = []
    # 先尝试东方财富全量行情
    df, err = try_sources(
        ("东方财富", lambda: ak.stock_zh_a_spot_em()),
    )
    if df is not None and not df.empty:
        for sym in symbols:
            match = df[df["代码"] == sym]
            if not match.empty:
                results.append(fmt_quote(match.iloc[0]))
        return results

    # 东方财富失败，逐个查询新浪
    for sym in symbols:
        prefix = "sh" if sym.startswith("6") else "sz" if sym.startswith(("0", "3")) else "bj"
        full_code = f"{prefix}{sym}" if not sym.startswith(("sh", "sz", "bj")) else sym
        try:
            spot = ak.stock_zh_a_spot()
            if spot is not None and not spot.empty:
                match = spot[spot["symbol"] == full_code]
                if not match.empty:
                    row = match.iloc[0]
                    results.append({
                        "code": sym,
                        "name": str(row.get("name", "")),
                        "price": float(row.get("trade", row.get("price", 0)) or 0),
                        "open": float(row.get("open", 0) or 0),
                        "high": float(row.get("high", 0) or 0),
                        "low": float(row.get("low", 0) or 0),
                        "prevClose": float(row.get("settlement", row.get("pre_close", 0)) or 0),
                        "change": float(row.get("change", 0) or 0),
                        "changePercent": float(row.get("changepercent", 0) or 0),
                        "volume": float(row.get("volume", 0) or 0),
                        "amount": float(row.get("amount", 0) or 0),
                    })
        except Exception:
            continue
    return results

# ═══════════════════════════════════════════════════════════════════
# 板块数据
# ═══════════════════════════════════════════════════════════════════

def get_industries(top_n=None):
    """获取行业板块列表（多源降级：东方财富 → 同花顺 → 必盈API）"""
    df, err = try_sources(
        ("东方财富", lambda: ak.stock_board_industry_name_em()),
        ("同花顺", lambda: ak.stock_board_industry_summary_ths()),
    )
    # AKShare 源失败时降级到必盈API
    if df is None or df.empty:
        return _fetch_biying_primary(top_n)

    name_col = "板块名称" if "板块名称" in df.columns else "行业名称" if "行业名称" in df.columns else "板块" if "板块" in df.columns else df.columns[0]
    change_col = "涨跌幅" if "涨跌幅" in df.columns else "涨幅" if "涨幅" in df.columns else None
    code_col = "板块代码" if "板块代码" in df.columns else "行业代码" if "行业代码" in df.columns else "代码" if "代码" in df.columns else None
    price_col = "最新价" if "最新价" in df.columns else "最新" if "最新" in df.columns else None
    change_amt_col = "涨跌额" if "涨跌额" in df.columns else None
    volume_col = "总成交量" if "总成交量" in df.columns else "成交量" if "成交量" in df.columns else None
    amount_col = "总成交额" if "总成交额" in df.columns else "成交额" if "成交额" in df.columns else None
    turnover_col = "换手率" if "换手率" in df.columns else None
    rise_col = "上涨家数" if "上涨家数" in df.columns else "上涨" if "上涨" in df.columns else None
    fall_col = "下跌家数" if "下跌家数" in df.columns else "下跌" if "下跌" in df.columns else None
    lead_col = "领涨股" if "领涨股" in df.columns else "领涨股票" if "领涨股票" in df.columns else "领涨个股" if "领涨个股" in df.columns else None
    lead_chg_col = "领涨股-涨跌幅" if "领涨股-涨跌幅" in df.columns else "领涨股票-涨跌幅" if "领涨股票-涨跌幅" in df.columns else "领涨个股涨跌幅" if "领涨个股涨跌幅" in df.columns else None

    df = df.sort_values(change_col or df.columns[-1], ascending=False) if change_col else df
    if top_n:
        df = df.head(top_n)
    boards = []
    for i, (_, row) in enumerate(df.iterrows()):
        code_val = str(row.get(code_col, "")) if code_col else ""
        name_val = str(row.get(name_col, ""))
        chg = float(row.get(change_col, 0) or 0) if change_col else 0
        boards.append({
            "code": code_val, "name": name_val, "rank": i + 1,
            "price": float(row.get(price_col, 0) or 0) if price_col else 0,
            "change": float(row.get(change_amt_col, 0) or 0) if change_amt_col else 0,
            "changePercent": chg,
            "volume": float(row.get(volume_col, 0) or 0) if volume_col else 0,
            "amount": float(row.get(amount_col, 0) or 0) if amount_col else 0,
            "turnoverRate": float(row.get(turnover_col, 0) or 0) if turnover_col else 0,
            "riseCount": int(row.get(rise_col, 0) or 0) if rise_col else 0,
            "fallCount": int(row.get(fall_col, 0) or 0) if fall_col else 0,
            "leadingStock": str(row.get(lead_col, "") or "") if lead_col else "",
            "leadingStockChangePercent": float(row.get(lead_chg_col, 0) or 0) if lead_chg_col else 0,
            "boardType": "industry",
        })
    return boards


def _fetch_biying_primary(top_n=None):
    """从必盈API获取一级市场板块列表（降级：仅作为兜底显示）"""
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
                "boardType": "industry",
            })
        return boards
    except Exception:
        return []


def _fetch_biying_concepts(top_n=None):
    """从必盈API获取概念指数列表"""
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
                "boardType": "concept",
            })
        return boards
    except Exception:
        return []


def get_concepts(top_n=None):
    """获取概念板块列表（多源降级：东方财富 → 同花顺 → 必盈API）"""
    df, err = try_sources(
        ("东方财富", lambda: ak.stock_board_concept_name_em()),
        ("同花顺", lambda: ak.stock_board_concept_name_ths()),
    )
    if df is None or df.empty:
        return _fetch_biying_concepts(top_n)

    name_col = "板块名称" if "板块名称" in df.columns else "概念名称" if "概念名称" in df.columns else "板块" if "板块" in df.columns else df.columns[0]
    change_col = "涨跌幅" if "涨跌幅" in df.columns else "涨幅" if "涨幅" in df.columns else None
    code_col = "板块代码" if "板块代码" in df.columns else "概念代码" if "概念代码" in df.columns else "代码" if "代码" in df.columns else None
    price_col = "最新价" if "最新价" in df.columns else "最新" if "最新" in df.columns else None
    change_amt_col = "涨跌额" if "涨跌额" in df.columns else None
    volume_col = "总成交量" if "总成交量" in df.columns else "成交量" if "成交量" in df.columns else None
    amount_col = "总成交额" if "总成交额" in df.columns else "成交额" if "成交额" in df.columns else None
    turnover_col = "换手率" if "换手率" in df.columns else None
    rise_col = "上涨家数" if "上涨家数" in df.columns else "上涨" if "上涨" in df.columns else None
    fall_col = "下跌家数" if "下跌家数" in df.columns else "下跌" if "下跌" in df.columns else None
    lead_col = "领涨股" if "领涨股" in df.columns else "领涨股票" if "领涨股票" in df.columns else "领涨个股" if "领涨个股" in df.columns else None
    lead_chg_col = "领涨股-涨跌幅" if "领涨股-涨跌幅" in df.columns else "领涨股票-涨跌幅" if "领涨股票-涨跌幅" in df.columns else "领涨个股涨跌幅" if "领涨个股涨跌幅" in df.columns else None

    df = df.sort_values(change_col or df.columns[-1], ascending=False) if change_col else df
    if top_n:
        df = df.head(top_n)
    boards = []
    for i, (_, row) in enumerate(df.iterrows()):
        code_val = str(row.get(code_col, "")) if code_col else ""
        name_val = str(row.get(name_col, ""))
        chg = float(row.get(change_col, 0) or 0) if change_col else 0
        boards.append({
            "code": code_val, "name": name_val, "rank": i + 1,
            "price": float(row.get(price_col, 0) or 0) if price_col else 0,
            "change": float(row.get(change_amt_col, 0) or 0) if change_amt_col else 0,
            "changePercent": chg,
            "volume": float(row.get(volume_col, 0) or 0) if volume_col else 0,
            "amount": float(row.get(amount_col, 0) or 0) if amount_col else 0,
            "turnoverRate": float(row.get(turnover_col, 0) or 0) if turnover_col else 0,
            "riseCount": int(row.get(rise_col, 0) or 0) if rise_col else 0,
            "fallCount": int(row.get(fall_col, 0) or 0) if fall_col else 0,
            "leadingStock": str(row.get(lead_col, "") or "") if lead_col else "",
            "leadingStockChangePercent": float(row.get(lead_chg_col, 0) or 0) if lead_chg_col else 0,
            "boardType": "concept",
        })
    return boards


def get_hot_sectors(top_n=10):
    """获取热门板块（行业+概念涨幅前N）"""
    industries = get_industries(top_n)
    concepts = get_concepts(top_n)
    return {
        "industries": industries,
        "concepts": concepts,
    }


def search_sectors(keyword):
    """搜索板块（行业+概念模糊匹配）"""
    results = []
    for getter, btype in [(get_industries, "industry"), (get_concepts, "concept")]:
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


def get_board_stocks(symbol, board_type="industry"):
    """获取板块成分股（多源降级：东方财富 → Futu/同花顺 → 必盈API成分股）"""
    df, err = None, None
    if board_type == "industry":
        df, err = try_sources(
            ("东方财富", lambda: ak.stock_board_industry_cons_em(symbol=symbol)),
        )
    else:
        df, err = try_sources(
            ("东方财富", lambda: ak.stock_board_concept_cons_em(symbol=symbol)),
            ("Futu", lambda: ak.stock_concept_cons_futu(symbol=symbol)),
        )
    if df is None or df.empty:
        return _fetch_biying_board_stocks(symbol, board_type)
    stocks = []
    name_col = "名称" if "名称" in df.columns else "股票名称" if "股票名称" in df.columns else df.columns[1] if len(df.columns) > 1 else df.columns[0]
    code_col = "代码" if "代码" in df.columns else "股票代码" if "股票代码" in df.columns else None
    price_col = "最新价" if "最新价" in df.columns else "现价" if "现价" in df.columns else None
    chg_pct_col = "涨跌幅" if "涨跌幅" in df.columns else "涨幅" if "涨幅" in df.columns else None
    chg_amt_col = "涨跌额" if "涨跌额" in df.columns else None
    vol_col = "成交量" if "成交量" in df.columns else None
    amt_col = "成交额" if "成交额" in df.columns else None
    turn_col = "换手率" if "换手率" in df.columns else None
    for i, (_, row) in enumerate(df.iterrows()):
        stocks.append({
            "code": str(row.get(code_col, "")) if code_col else "",
            "name": str(row.get(name_col, "")),
            "price": float(row.get(price_col, 0) or 0) if price_col else 0,
            "change": float(row.get(chg_amt_col, 0) or 0) if chg_amt_col else 0,
            "changePercent": float(row.get(chg_pct_col, 0) or 0) if chg_pct_col else 0,
            "volume": float(row.get(vol_col, 0) or 0) if vol_col else 0,
            "amount": float(row.get(amt_col, 0) or 0) if amt_col else 0,
            "turnoverRate": float(row.get(turn_col, 0) or 0) if turn_col else 0,
            "pe": None, "pb": None, "rank": i + 1,
        })
    return stocks


def _fetch_biying_board_stocks(symbol, board_type):
    """兜底获取板块成分股（通过AKShare Sina接口）"""
    import urllib.request, json as _json, ssl
    try:
        # 尝试新浪板块成分股接口
        if board_type == "industry":
            url = f"http://vip.stock.finance.sina.com.cn/q/go.php/vIndustryRank/kind/industry/symbol/{symbol}"
        else:
            url = f"http://vip.stock.finance.sina.com.cn/q/go.php/vIndustryRank/kind/concept/symbol/{symbol}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        resp = urllib.request.urlopen(req, timeout=10)
        html = resp.read().decode("gbk", errors="ignore")
        # 解析HTML表格提取成分股
        import re
        stocks = []
        for m in re.finditer(r'<a[^>]*href="[^"]*quotes_search\.html\?st=[^"]*"[^>]*>([^<]+)</a>', html):
            name = m.group(1).strip()
            stocks.append(name)
        if not stocks:
            return []
        return [{"code": "", "name": n, "price": 0, "change": 0,
                 "changePercent": 0, "volume": 0, "amount": 0,
                 "turnoverRate": 0, "pe": None, "pb": None, "rank": i+1}
                for i, n in enumerate(stocks[:50])]
    except Exception:
        return []


def get_zt_pool(zt_type="zt", date=None):
    """获取涨停板池（多源降级）"""
    from datetime import datetime
    if not date:
        date = datetime.now().strftime("%Y%m%d")
    df, err = try_sources(
        ("东方财富", lambda: ak.stock_zt_pool_em(date=date)),
        ("同花顺", lambda: ak.stock_zt_pool_strong_em(date=date)),
    )
    if df is None or df.empty:
        return []
    results = []
    for _, row in df.iterrows():
        results.append({
            "code": str(row.get("代码", "")),
            "name": str(row.get("名称", "")),
            "price": float(row.get("最新价", 0) or 0),
            "changePercent": float(row.get("涨跌幅", 0) or 0),
            "continuousBoardCount": int(row.get("连板数", row.get("连续涨停天数", 0)) or 0),
            "amount": float(row.get("成交额", 0) or 0),
            "industry": str(row.get("所属行业", "") or ""),
        })
    return results


def search_stock(keyword):
    """搜索股票（多源降级：东方财富 → 新浪）"""
    df, err = try_sources(
        ("东方财富", lambda: ak.stock_zh_a_spot_em()),
    )
    if df is None or df.empty:
        # 降级：尝试新浪
        try:
            df = ak.stock_zh_a_spot()
            if df is not None and not df.empty:
                keyword_lower = keyword.lower().strip()
                results = []
                for _, row in df.iterrows():
                    code = str(row.get("symbol", row.get("code", ""))).replace("sh", "").replace("sz", "")
                    name = str(row.get("name", row.get("名称", "")))
                    if keyword_lower in name.lower() or keyword_lower in code.lower():
                        results.append({"code": code, "name": name, "category": "stock",
                                        "market": "sh" if code.startswith("6") else "sz"})
                    if len(results) >= 20:
                        break
                return results
        except Exception:
            pass
        return []

    keyword_lower = keyword.lower().strip()
    results = []
    for _, row in df.iterrows():
        code = str(row.get("代码", ""))
        name = str(row.get("名称", ""))
        if keyword_lower in name.lower() or keyword_lower in code.lower():
            results.append({"code": code, "name": name, "category": "stock",
                            "market": "sh" if code.startswith("6") else "sz" if code.startswith(("0", "3")) else "bj"})
        if len(results) >= 20:
            break
    return results


def get_fund_flow_rank(indicator="today"):
    """获取个股资金流向排名（多源降级）"""
    indicator_map = {"today": "今日", "3day": "3日", "5day": "5日", "10day": "10日"}
    ind = indicator_map.get(indicator, "今日")
    df, err = try_sources(
        ("东方财富", lambda: ak.stock_individual_fund_flow_rank(indicator=ind)),
    )
    if df is None or df.empty:
        return []
    results = []
    for _, row in df.iterrows():
        results.append({
            "code": str(row.get("代码", "")),
            "name": str(row.get("名称", "")),
            "price": float(row.get("最新价", 0) or 0),
            "changePercent": float(row.get("涨跌幅", 0) or 0),
            "mainNetInflow": float(row.get("主力净流入-净额", 0) or 0),
            "mainNetInflowRatio": float(row.get("主力净流入-净占比", 0) or 0),
        })
    return results


def get_sector_fund_flow_rank(indicator="today", sector_type="industry"):
    """获取板块资金流向排名（多源降级）"""
    indicator_map = {"today": "今日", "3day": "3日", "5day": "5日", "10day": "10日"}
    ind = indicator_map.get(indicator, "今日")
    sector_map = {"industry": "行业资金流向", "concept": "概念资金流向"}
    stype = sector_map.get(sector_type, "行业资金流向")
    df, err = try_sources(
        ("东方财富", lambda: ak.stock_sector_fund_flow_rank(indicator=ind, sector_type=stype)),
    )
    if df is None or df.empty:
        return []
    results = []
    for _, row in df.iterrows():
        results.append({
            "name": str(row.get("名称", "")),
            "price": float(row.get("最新价", 0) or 0),
            "changePercent": float(row.get("涨跌幅", 0) or 0),
            "mainNetInflow": float(row.get("主力净流入-净额", 0) or 0),
            "mainNetInflowRatio": float(row.get("主力净流入-净占比", 0) or 0),
        })
    return results


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

        elif action == "concepts":
            data = get_concepts(req.get("topN"))
            print(json.dumps({"ok": True, "data": data}, ensure_ascii=False, default=str))

        elif action == "hotSectors":
            data = get_hot_sectors(req.get("topN", 10))
            print(json.dumps({"ok": True, "data": data}, ensure_ascii=False, default=str))

        elif action == "searchSectors":
            keyword = req.get("keyword", "")
            data = search_sectors(keyword)
            print(json.dumps({"ok": True, "data": data}, ensure_ascii=False, default=str))

        elif action == "boardStocks":
            symbol = req.get("symbol", "")
            board_type = req.get("boardType", "industry")
            data = get_board_stocks(symbol, board_type)
            print(json.dumps({"ok": True, "data": data}, ensure_ascii=False, default=str))

        elif action == "ztPool":
            data = get_zt_pool(req.get("ztType", "zt"), req.get("date"))
            print(json.dumps({"ok": True, "data": data}, ensure_ascii=False, default=str))

        elif action == "fundFlowRank":
            data = get_fund_flow_rank(req.get("indicator", "today"))
            print(json.dumps({"ok": True, "data": data}, ensure_ascii=False, default=str))

        elif action == "sectorFundFlowRank":
            data = get_sector_fund_flow_rank(
                req.get("indicator", "today"),
                req.get("sectorType", "industry"),
            )
            print(json.dumps({"ok": True, "data": data}, ensure_ascii=False, default=str))

        elif action == "health":
            print(json.dumps({"ok": True, "data": {"status": "ready", "version": ak.__version__}}, ensure_ascii=False))

        elif action == "randomKline":
            result = get_random_kline(req.get("count", 500))
            print(json.dumps(result, ensure_ascii=False, default=str))

        else:
            print(json.dumps({"ok": False, "error": f"未知 action: {action}"}, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"ok": False, "error": f"{e}", "trace": traceback.format_exc()[:500]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
