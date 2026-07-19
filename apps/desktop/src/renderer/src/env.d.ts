import type { AppInfo } from "@businessbox/contracts";

declare global {
  interface Window {
    /** Bridge esposto dal preload (vedi src/preload/index.ts). */
    businessbox: {
      getAppInfo(): Promise<AppInfo>;
    };
  }
}

export {};
