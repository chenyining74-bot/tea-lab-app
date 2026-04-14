"use client";

import { useEffect } from "react";

const SESSION_KEY = "tea-lab-css-recovery-v1";

/**
 * 自动修复「样式全丢」：注销旧 Service Worker、清空 Cache Storage，必要时刷新一次。
 * 用户无需打开开发者工具。
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (sessionStorage.getItem(SESSION_KEY)) {
      return;
    }

    void (async () => {
      let hadServiceWorker = false;
      let hadCache = false;

      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          hadServiceWorker = regs.length > 0;
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          hadCache = keys.length > 0;
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch {
        // 忽略，仍标记完成避免反复尝试
      }

      sessionStorage.setItem(SESSION_KEY, "1");

      if (hadServiceWorker || hadCache) {
        window.location.reload();
      }
    })();
  }, []);

  return null;
}
