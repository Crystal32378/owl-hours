import { useEffect, useRef } from "react";
import { acceptWindowDetailText, acceptWindowValueText, linkedAccountsValueText } from "../lib/settingsText.ts";
import { businessRuntime } from "./businessRuntime.ts";
import type { BusinessService, BusinessSettings } from "../services/businessService.ts";
import { useLoad } from "./useLoad.ts";

export type SettingsDeps = { service: BusinessService };

export type SettingKey = keyof BusinessSettings;

// Serializable by design: it crosses into the DOM component as props; toggling
// is a top-level async callback. Settings always resolve, so there is no empty
// state: loading draws nothing and failure draws the error state.
export type SettingsView = {
  settings: BusinessSettings;
  acceptWindowValue: string;
  acceptWindowDetail: string;
  linkedAccountsValue: string;
  toggleSetting: (key: SettingKey, checked: boolean) => Promise<void>;
};

export type SettingsState =
  | { status: "loading"; reload: () => Promise<void> }
  | { status: "failed"; retry: () => Promise<void>; reload: () => Promise<void> }
  | { status: "ready"; view: SettingsView; reload: () => Promise<void> };

type LoadedSettings = {
  settings: BusinessSettings;
  acceptWindowValue: string;
  acceptWindowDetail: string;
  linkedAccountsValue: string;
};

export function useSettings(deps?: Partial<SettingsDeps>): SettingsState {
  const service = deps?.service ?? businessRuntime().service;
  const { state, reload, replace } = useLoad(() => loadSettings(service), [service]);

  // Each toggle builds on the latest settings, so two fast toggles never
  // revert one another: the ref moves synchronously, the save follows.
  const latest = useRef<LoadedSettings | null>(null);
  const readyValue = state.status === "ready" ? state.value : null;
  useEffect(() => {
    latest.current = readyValue;
  }, [readyValue]);

  if (state.status === "loading") return { status: "loading", reload };
  if (state.status === "failed") return { status: "failed", retry: state.retry, reload };

  const ready = state.value;

  async function toggleSetting(key: SettingKey, checked: boolean): Promise<void> {
    const base = latest.current ?? ready;
    const optimistic = { ...base, settings: { ...base.settings, [key]: checked } };
    latest.current = optimistic;
    const saved = await service.saveSettings(optimistic.settings);
    const done = { ...optimistic, settings: saved };
    latest.current = done;
    replace(done);
  }

  return {
    status: "ready",
    view: {
      settings: ready.settings,
      acceptWindowValue: ready.acceptWindowValue,
      acceptWindowDetail: ready.acceptWindowDetail,
      linkedAccountsValue: ready.linkedAccountsValue,
      toggleSetting,
    },
    reload,
  };
}

async function loadSettings(service: BusinessService): Promise<LoadedSettings | { failed: true }> {
  try {
    const [business, settings, accounts] = await Promise.all([
      service.getBusiness(),
      service.getSettings(),
      service.getAccounts(),
    ]);
    return {
      settings,
      acceptWindowValue: acceptWindowValueText(business.acceptWindowMin),
      acceptWindowDetail: acceptWindowDetailText(business.acceptWindowMin),
      linkedAccountsValue: linkedAccountsValueText(accounts),
    };
  } catch {
    return { failed: true };
  }
}
