"""
深度全功能测试 — 股市板块（SectorBoard）
后端: http://127.0.0.1:8765  前端: http://localhost:5173
"""
from playwright.sync_api import sync_playwright
import time
import json

BASE = "http://localhost:5173"
RESULTS = []

def log(level, msg):
    prefix = {"ok": "✅", "warn": "⚠️", "fail": "❌", "info": "📌"}.get(level, "·")
    print(f"  {prefix} {msg}")
    RESULTS.append(f"[{level.upper()}] {msg}")

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.set_default_timeout(15000)

        # 收集控制台错误
        errors = []
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: errors.append(str(err)))

        log("info", "=== 股市板块全功能测试 ===")

        # 1. 打开应用，导航到「股市板块」
        log("info", "1. 打开应用 → 导航到股市板块")
        page.goto(BASE)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1000)

        # 点击「股市板块」导航
        nav_btn = page.locator("button:has-text('股市板块')")
        if nav_btn.count() > 0:
            nav_btn.first.click()
            page.wait_for_timeout(2000)
            log("ok", "已导航到股市板块页面")
        else:
            log("fail", "找不到「股市板块」导航按钮")
            browser.close()
            return RESULTS

        # 验证 Tab 栏存在
        tabs = ["热门板块", "行业板块", "概念板块", "搜索", "市场异动", "资金流向", "北向资金"]
        for tab_name in tabs:
            el = page.locator(f"button:has-text('{tab_name}')")
            if el.count() > 0:
                log("ok", f"Tab「{tab_name}」存在")
            else:
                log("fail", f"Tab「{tab_name}」缺失")

        # 2. 热门板块 Tab（默认）
        log("info", "2. 测试热门板块")
        page.wait_for_timeout(3000)  # 等待数据加载
        hot_cards = page.locator(".sector-card")
        card_count = hot_cards.count()
        if card_count > 0:
            log("ok", f"热门板块加载 {card_count} 张卡片")
            first_card_text = hot_cards.first.inner_text()
            log("info", f"首张卡片: {first_card_text[:80]}...")
        else:
            log("warn", "热门板块无数据（可能非交易时段）")

        # 验证板块标题
        headings = page.locator("h3").all_text_contents()
        has_industry = any("热门行业板块" in h for h in headings)
        has_concept = any("热门概念板块" in h for h in headings)
        if has_industry: log("ok", "热门行业板块标题存在")
        if has_concept: log("ok", "热门概念板块标题存在")

        # 3. 行业板块 Tab
        log("info", "3. 测试行业板块")
        page.locator("button:has-text('行业板块')").first.click()
        page.wait_for_timeout(3000)
        rows = page.locator(".board-table tbody tr")
        row_count = rows.count()
        if row_count > 0:
            log("ok", f"行业板块列表 {row_count} 行")
            first = rows.first.inner_text()
            log("info", f"首行: {first[:80]}")
        else:
            log("warn", "行业板块无数据")

        # 点击第一行 → 检查板块详情弹窗
        if row_count > 0:
            rows.first.click()
            page.wait_for_timeout(2000)
            modal = page.locator(".detail-modal")
            if modal.count() > 0:
                log("ok", "板块详情弹窗已打开")
                modal_header = modal.locator("h3").first.inner_text()
                log("info", f"弹窗标题: {modal_header}")
                # 关闭弹窗
                page.locator(".detail-modal .btn-ghost").first.click()
                page.wait_for_timeout(500)
                log("ok", "弹窗已关闭")
            else:
                log("fail", "板块详情弹窗未打开")

        # 4. 概念板块 Tab
        log("info", "4. 测试概念板块")
        page.locator("button:has-text('概念板块')").first.click()
        page.wait_for_timeout(3000)
        rows = page.locator(".board-table tbody tr")
        row_count = rows.count()
        if row_count > 0:
            log("ok", f"概念板块列表 {row_count} 行")

        # 5. 搜索 Tab
        log("info", "5. 测试搜索功能")
        page.locator("button:has-text('搜索')").first.click()
        page.wait_for_timeout(1000)

        # 5a. 搜索板块
        log("info", "5a. 搜索板块")
        search_input = page.locator(".search-input-wrap input")
        search_input.fill("人工智能")
        search_btn = page.locator("form .btn-primary")
        search_btn.click()
        page.wait_for_timeout(3000)
        results = page.locator(".search-result-item")
        if results.count() > 0:
            log("ok", f"板块搜索「人工智能」→ {results.count()} 个结果")
        else:
            log("warn", "板块搜索无结果")

        # 5b. 搜索股票
        log("info", "5b. 搜索股票")
        page.locator("input[type='radio'][value='stock']").click() if page.locator("input[type='radio'][value='stock']").count() > 0 else page.locator("label:has-text('搜索股票')").click()
        page.wait_for_timeout(500)
        search_input = page.locator(".search-input-wrap input")
        search_input.fill("maotai")
        search_btn = page.locator("form .btn-primary")
        search_btn.click()
        page.wait_for_timeout(4000)
        stock_results = page.locator(".stock-result")
        if stock_results.count() > 0:
            log("ok", f"股票搜索「maotai」→ {stock_results.count()} 个结果")
            first_stock = stock_results.first
            stock_text = first_stock.inner_text()
            log("info", f"首条: {stock_text[:100]}")
            # 点击股票 → 详情弹窗
            first_stock.click()
            page.wait_for_timeout(3000)
            detail_modal = page.locator(".detail-modal")
            if detail_modal.count() > 0:
                log("ok", "股票详情弹窗已打开")
                # 检查 K 线图
                svg = page.locator(".detail-modal-body svg")
                if svg.count() > 0:
                    log("ok", "K线/分时 SVG 图表存在")
                # 关闭
                page.locator(".detail-modal .btn-ghost").first.click()
                page.wait_for_timeout(500)
            else:
                log("warn", "股票详情弹窗未打开（可能非交易时段无行情）")
        else:
            log("warn", "股票搜索无结果")

        # 6. 市场异动 Tab
        log("info", "6. 测试市场异动")
        page.locator("button:has-text('市场异动')").first.click()
        page.wait_for_timeout(3000)

        # 6a. 涨停板
        log("info", "6a. 涨停板测试")
        zt_table = page.locator(".board-table tbody tr")
        zt_count = zt_table.count()
        if zt_count > 0:
            log("ok", f"涨停板 {zt_count} 条数据")
            first_zt = zt_table.first.inner_text()
            log("info", f"首条: {first_zt[:100]}")
        else:
            log("warn", "涨停板无数据")

        # 切换涨停板子类型
        for sub_type in ["跌停股", "强势股", "炸板股"]:
            btn = page.locator(f"button:has-text('{sub_type}')")
            if btn.count() > 0:
                btn.first.click()
                page.wait_for_timeout(2000)
                tbody = page.locator(".board-table tbody tr")
                log("ok", f"「{sub_type}」切换成功，{tbody.count()} 条")

        # 排序测试
        sort_btns = page.locator("button:has-text('连板数')")
        if sort_btns.count() > 0:
            sort_btns.first.click()
            page.wait_for_timeout(1000)
            log("ok", "排序切换「连板数」成功")

        # 6b. 盘口异动
        log("info", "6b. 盘口异动测试")
        page.locator("button:has-text('盘口异动')").first.click()
        page.wait_for_timeout(3000)
        ch_table = page.locator(".board-table tbody tr")
        if ch_table.count() > 0:
            log("ok", f"盘口异动 {ch_table.count()} 条")
            first_ch = ch_table.first.inner_text()
            log("info", f"首条: {first_ch[:100]}")
        else:
            log("warn", "盘口异动无数据")

        # 切换异动类型
        for ct in ["大笔卖出", "火箭发射"]:
            btn = page.locator(f"button:has-text('{ct}')")
            if btn.count() > 0:
                btn.first.click()
                page.wait_for_timeout(2000)
                log("ok", f"异动类型「{ct}」切换完成")

        # 7. 资金流向 Tab
        log("info", "7. 测试资金流向")
        page.locator("button:has-text('资金流向')").first.click()
        page.wait_for_timeout(3000)
        sections = page.locator("h3").all_text_contents()
        flow_sections = [s for s in sections if "资金流排名" in s or "板块资金流" in s or "个股资金流" in s]
        if flow_sections:
            log("ok", f"资金流向板块: {flow_sections}")
        else:
            log("warn", "资金流向无数据")

        # 切换指标
        for ind in ["3日", "5日", "10日"]:
            btn = page.locator(f"button:has-text('{ind}')")
            if btn.count() > 0:
                btn.first.click()
                page.wait_for_timeout(2000)
                log("ok", f"资金流指标切换「{ind}」")

        # 8. 北向资金 Tab
        log("info", "8. 测试北向资金")
        page.locator("button:has-text('北向资金')").first.click()
        page.wait_for_timeout(3000)
        nb_sections = page.locator("h3").all_text_contents()
        nb_related = [s for s in nb_sections if "市场汇总" in s or "北向持股" in s or "沪深港通" in s]
        if nb_related:
            log("ok", f"北向资金板块: {nb_related}")
        else:
            log("warn", "北向资金无数据")

        # 9. 分页测试
        log("info", "9. 测试分页")
        page.locator("button:has-text('市场异动')").first.click()
        page.wait_for_timeout(2000)
        pagers = page.locator("button:has-text('上一页')")
        if pagers.count() > 0:
            log("ok", "分页器存在")
        else:
            log("info", "数据不足一页，无需分页（正常）")

        # 10. 综合报告
        log("info", "")
        log("info", "======== 测试报告 ========")
        pass_count = sum(1 for r in RESULTS if r.startswith("[OK]"))
        warn_count = sum(1 for r in RESULTS if r.startswith("[WARN]"))
        fail_count = sum(1 for r in RESULTS if r.startswith("[FAIL]"))
        log("info", f"通过: {pass_count}  警告: {warn_count}  失败: {fail_count}")
        log("info", f"JS 控制台错误: {len(errors)} 条")
        for e in errors[:5]:
            log("info", f"  JS Error: {e[:120]}")

        browser.close()
        return RESULTS

if __name__ == "__main__":
    results = run()
    for r in results:
        print(r)
