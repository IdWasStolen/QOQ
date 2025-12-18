import { DashboardState, bitable, dashboard } from "@lark-base-open/js-sdk";
import React from "react";
import { useLayoutEffect, useState } from "react";

function updateTheme(theme: string) {
  document.body.setAttribute('theme-mode', theme);
}

/** 检查是否在飞书环境中 */
function isLarkEnv(): boolean {
  return typeof window !== 'undefined' && !!(window as any).bitable && !!(window as any).dashboard;
}

/** 跟随主题色变化 */
export function useTheme() {
  const [bgColor, setBgColor] = useState('#ffffff');
  useLayoutEffect(() => {
    if (!isLarkEnv()) {
      return;
    }
    try {
      dashboard.getTheme().then((res) => {
        setBgColor(res.chartBgColor);
        updateTheme(res.theme.toLocaleLowerCase());
      }).catch(() => {});

      dashboard.onThemeChange((res) => {
        setBgColor(res.data.chartBgColor);
        updateTheme(res.data.theme.toLocaleLowerCase());
      });
    } catch (e) {
      // 非飞书环境，使用默认值
    }
  }, [])
  return {
    bgColor,
  }
}

/** 初始化、更新config */
export function useConfig(updateConfig: (data: any) => void) {
  const isLark = isLarkEnv();
  const isCreate = isLark ? dashboard.state === DashboardState.Create : false;
  
  React.useEffect(() => {
    if (!isLark || isCreate) {
      return
    }
    try {
      // 初始化获取配置
      dashboard.getConfig().then(updateConfig).catch(() => {});
    } catch (e) {
      // 非飞书环境，忽略
    }
  }, []);


  React.useEffect(() => {
    if (!isLark) {
      return;
    }
    try {
      const offConfigChange = dashboard.onConfigChange((r) => {
        // 监听配置变化，协同修改配置
        updateConfig(r.data);
      });
      return () => {
        offConfigChange();
      }
    } catch (e) {
      // 非飞书环境，忽略
    }
  }, []);
}