/**
 * NavigationContext — 轻量级页面导航上下文
 *
 * 替代在 App.jsx 中直接管理特定页面参数（如 reviewEditId），
 * 通过通用 params 对象传递任意页面导航参数，降低 App 与子页面的耦合。
 *
 * 用法：
 *   const { page, params, navigate } = useNavigation();
 *   navigate("review", { reviewId: 123 });
 */
import { createContext, useContext } from "react";

export const NavigationContext = createContext({
  page: "dashboard",
  params: {},
  navigate: () => {},
});

export function useNavigation() {
  return useContext(NavigationContext);
}
