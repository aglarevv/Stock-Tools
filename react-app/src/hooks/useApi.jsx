/**
 * ApiContext — API 客户端依赖注入
 *
 * 通过 React Context 提供 api 实例，替代组件中直接的 `import { api } from "../utils/api.js"`。
 * 降低组件与 API 层的耦合，便于测试和切换实现。
 *
 * 用法：
 *   // 在 App.jsx 中包裹：
 *   <ApiProvider><App /></ApiProvider>
 *
 *   // 在组件/hook 中使用：
 *   const api = useApi();
 */
import { createContext, useContext } from "react";
import { api as defaultApi } from "../utils/api.js";

const ApiContext = createContext(defaultApi);

export function ApiProvider({ children, apiInstance }) {
  return (
    <ApiContext.Provider value={apiInstance || defaultApi}>
      {children}
    </ApiContext.Provider>
  );
}

export function useApi() {
  return useContext(ApiContext);
}
