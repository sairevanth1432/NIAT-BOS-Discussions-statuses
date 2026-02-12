import { queryClient } from "./queryClient";

export interface SheetConfig {
  sheetId: string;
  apiKey?: string;
  sheetName?: string;
  useServerConfig?: boolean;
}

export interface SheetValidation {
  valid: boolean;
  title?: string;
  sheetNames?: string[];
  error?: string;
  errorType?: string;
}

export interface SheetDataResponse {
  title: string;
  headers: string[];
  data: Record<string, string>[];
  totalRows: number;
  lastUpdated: string;
}

export interface ServerConfig {
  hasServerConfig: boolean;
  sheetId: string;
}

const STORAGE_KEY = "sheetsync_config";

export function saveConfig(config: SheetConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function loadConfig(): SheetConfig | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearConfig() {
  localStorage.removeItem(STORAGE_KEY);
  queryClient.clear();
}

export async function getServerConfig(): Promise<ServerConfig> {
  const res = await fetch("/api/sheets/config");
  return res.json();
}

export async function validateSheet(config: SheetConfig): Promise<SheetValidation> {
  const body: any = {};
  if (!config.useServerConfig) {
    body.sheetId = config.sheetId;
    body.apiKey = config.apiKey;
  }
  if (config.sheetName) body.sheetName = config.sheetName;

  const res = await fetch("/api/sheets/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function fetchSheetData(config: SheetConfig): Promise<SheetDataResponse> {
  const body: any = {};
  if (!config.useServerConfig) {
    body.sheetId = config.sheetId;
    body.apiKey = config.apiKey;
  }
  if (config.sheetName) body.sheetName = config.sheetName;

  const res = await fetch("/api/sheets/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to fetch sheet data");
  }
  return res.json();
}
