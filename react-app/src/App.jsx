/**
 * 应用根组件 — 页面路由 + Toast 通知容器 + 导航上下文
 *
 * 使用简单状态路由（非 React Router），通过 Sidebar 导航切换页面组件。
 * NavigationContext 提供 page / params / navigate，子页面通过 useNavigation() 获取。
 * params 是通用导航参数对象，避免 App 感知子页面特定概念（如 reviewEditId）。
 */
import { useState, useCallback } from "react";
import { ToastProvider, useToast } from "./hooks/useToast.jsx";
import { NavigationContext } from "./hooks/useNavigation.js";
import { ApiProvider } from "./hooks/useApi.jsx";
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
    <ApiProvider>
      <ToastProvider>
        <AppInner />
      </ToastProvider>
    </ApiProvider>
  );
}

function AppInner() {
  const [page, setPage] = useState("dashboard");
  const [navParams, setNavParams] = useState({});
  const showToast = useToast();

  /** 通用导航：target 页面ID，params 任意参数 */
  const navigate = useCallback((target, params = {}) => {
    setNavParams(params);
    setPage(target);
  }, []);

  const PageComponent = PAGES[page] || Dashboard;

  return (
    <NavigationContext.Provider value={{ page, params: navParams, navigate }}>
      <div className="app-container">
        <TitleBar />
        <Sidebar active={page} onNavigate={navigate} />
        <main className="main-content">
          <PageComponent navigate={navigate} editReviewId={navParams.reviewId || null} showToast={showToast} />
        </main>
      </div>
    </NavigationContext.Provider>
  );
}
