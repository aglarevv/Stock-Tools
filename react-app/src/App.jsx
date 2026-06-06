/**
 * 应用根组件 — 页面路由 + Toast 通知容器
 *
 * 使用简单状态路由（非 React Router），通过 Sidebar 导航切换页面组件。
 * PAGES 对象映射 page id → 组件，navigate(target, data) 实现页面跳转。
 */
import { useState, useCallback } from "react";
import { ToastProvider, useToast } from "./hooks/useToast.jsx";
import Sidebar from "./components/Sidebar.jsx";
import TitleBar from "./components/TitleBar.jsx";
import Dashboard from "./components/Dashboard.jsx";
import TradePlan from "./components/TradePlan.jsx";
import TradePlanList from "./components/TradePlanList.jsx";
import FuturesCalc from "./components/FuturesCalc.jsx";
import ReviewList from "./components/ReviewList.jsx";
import DailyReview from "./components/DailyReview.jsx";
import TechnicalIndicators from "./components/TechnicalIndicators.jsx";
import DailyNews from "./components/DailyNews.jsx";
import Settings from "./components/Settings.jsx";

const PAGES = {
  dashboard: Dashboard,
  calculator: TradePlan,
  "plan-list": TradePlanList,
  futures: FuturesCalc,
  "review-list": ReviewList,
  review: DailyReview,
  indicators: TechnicalIndicators,
  news: DailyNews,
  settings: Settings,
};

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

function AppInner() {
  const [page, setPage] = useState("dashboard");
  const [reviewEditId, setReviewEditId] = useState(null);
  const showToast = useToast();

  const navigate = useCallback((target, data) => {
    if (data?.reviewId) setReviewEditId(data.reviewId);
    else setReviewEditId(null);
    setPage(target);
  }, []);

  const PageComponent = PAGES[page] || Dashboard;

  return (
    <div className="app-container">
      <TitleBar />
      <Sidebar active={page} onNavigate={navigate} />
      <main className="main-content">
        <PageComponent navigate={navigate} editReviewId={reviewEditId} showToast={showToast} />
      </main>
    </div>
  );
}
