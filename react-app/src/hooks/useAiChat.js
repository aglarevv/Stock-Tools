/**
 * useAiChat — AI 复盘助手聊天逻辑 Hook
 *
 * 从 DailyReview 中提取 AI 聊天相关的所有状态和逻辑。
 * 单一职责：管理聊天消息、输入、加载状态、配置和持久化。
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useApi } from "./useApi.jsx";

const AI_CHAT_KEY = "toolbox_ai_chat";

const DEFAULT_MESSAGE = { role: "bot", text: "你好！填写复盘内容后，你可以问我任何关于交易的问题。" };

function loadMessages() {
  try {
    const saved = localStorage.getItem(AI_CHAT_KEY);
    return saved ? JSON.parse(saved) : [DEFAULT_MESSAGE];
  } catch {
    return [DEFAULT_MESSAGE];
  }
}

export function useAiChat(review, showToast) {
  const api = useApi();
  const [messages, setMessages] = useState(loadMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(null);
  const endRef = useRef(null);

  // 加载 AI 配置
  useEffect(() => {
    (async () => {
      try {
        const data = await api.getSettings();
        const s = data.settings || {};
        if (s.aiKey) {
          setConfig({
            url: s.aiUrl,
            key: s.aiKey,
            model: s.aiModel,
            temperature: s.aiTemperature ?? 0.7,
            thinking: s.aiThinking !== false && s.aiThinking !== "false",
          });
        }
      } catch (e) {
        showToast(`加载AI配置失败：${e.message}`, "error");
      }
    })();
  }, []);

  // 新消息自动滚动 + 持久化
  useEffect(() => {
    if (messages.length > 1) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    try { localStorage.setItem(AI_CHAT_KEY, JSON.stringify(messages)); } catch {}
  }, [messages]);

  // 发送消息
  const send = useCallback(async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    const updated = [...messages, { role: "user", text: msg }];
    setMessages(updated);
    setLoading(true);
    try {
      const d = await api.aiChat(review, updated, config);
      setMessages((m) => [...m, { role: "bot", text: d.reply || "（无回复）" }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "bot", text: `❌ ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, review, config]);

  // 清空聊天
  const clear = useCallback(() => {
    setMessages([DEFAULT_MESSAGE]);
    try { localStorage.removeItem(AI_CHAT_KEY); } catch {}
  }, []);

  return { messages, input, setInput, loading, send, clear, endRef };
}
