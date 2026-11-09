import type { Bridge, Preferences } from "../../shared/model";
import { defaults } from "../../shared/model";
import { Monitor } from "../../main/service";
import { SectorApi } from "../../main/api";
const listeners = new Set<Parameters<Bridge["subscribe"]>[0]>();
const demo = new Monitor(
  new SectorApi(
    { hour: 0, used: 0, blockedUntil: 0 },
    () => {},
    async () => {
      throw new Error("Live API is unavailable in browser preview.");
    },
  ),
  (s) => listeners.forEach((cb) => cb(structuredClone(s))),
);
const unavailable = async (): Promise<never> => {
  throw new Error(
    "Open the desktop application to connect securely. Browser preview is demo only.",
  );
};
const browser: Bridge = {
  snapshot: async () => demo.snap,
  demo: async () => demo.demo(),
  refresh: async () => {
    return demo.refresh(true);
  },
  login: unavailable,
  savedLogin: unavailable,
  select: unavailable,
  logout: async () => demo.demo(),
  command: (...args) => demo.command(...args),
  reconcile: () => demo.reconcile(),
  readOnly: async (v) => demo.readOnly(v),
  scenario: async (n) => demo.scenario(n),
  preferences: async () => {
    try {
      return {
        ...defaults,
        ...JSON.parse(localStorage.getItem("home-preferences") || "{}"),
      };
    } catch {
      return defaults;
    }
  },
  savePreferences: async (p: Preferences) => {
    localStorage.setItem("home-preferences", JSON.stringify(p));
  },
  subscribe(cb) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
};
export const bridge = window.home || browser;
