import { queryClient } from "./queryClient";

export interface SheetConfig {
  sheetId: string;
  apiKey: string;
  sheetName?: string;
}

export interface SheetValidation {
  valid: boolean;
  title?: string;
  sheetNames?: string[];
  error?: string;
}

export interface SheetDataResponse {
  title: string;
  headers: string[];
  data: Record<string, string>[];
  totalRows: number;
  lastUpdated: string;
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

export async function validateSheet(config: SheetConfig): Promise<SheetValidation> {
  const res = await fetch("/api/sheets/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  return res.json();
}

export async function fetchSheetData(config: SheetConfig): Promise<SheetDataResponse> {
  const res = await fetch("/api/sheets/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to fetch sheet data");
  }
  return res.json();
}
