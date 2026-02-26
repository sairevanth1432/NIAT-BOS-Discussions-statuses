import type { Express } from "express";
import { createServer, type Server } from "http";
import { google } from "googleapis";
import { z } from "zod";

const fetchSheetSchema = z.object({
  sheetId: z.string().min(5),
  apiKey: z.string().min(10).optional(),
  sheetName: z.string().optional(),
});

function getApiKey(bodyKey?: string): string {
  return bodyKey || process.env.GOOGLE_SHEETS_API_KEY || "";
}

function getSheetId(bodyId?: string): string {
  return bodyId || process.env.GOOGLE_SHEET_ID || "";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/auth/config", (_req, res) => {
    return res.json({
      clientId: process.env.MICROSOFT_CLIENT_ID || "",
      tenantId: process.env.MICROSOFT_TENANT_ID || "",
    });
  });

  app.get("/api/sheets/config", (_req, res) => {
    const hasApiKey = !!process.env.GOOGLE_SHEETS_API_KEY;
    const sheetId = process.env.GOOGLE_SHEET_ID || "";
    return res.json({
      hasServerConfig: hasApiKey && !!sheetId,
      sheetId: sheetId,
    });
  });

  app.post("/api/sheets/validate", async (req, res) => {
    try {
      const sheetId = getSheetId(req.body?.sheetId);
      const apiKey = getApiKey(req.body?.apiKey);

      if (!sheetId || sheetId.length < 5) {
        return res.status(400).json({ valid: false, error: "No Sheet ID configured." });
      }
      if (!apiKey || apiKey.length < 10) {
        return res.status(400).json({ valid: false, error: "No API Key configured." });
      }

      const sheets = google.sheets({ version: "v4", auth: apiKey });

      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: sheetId,
      });

      const sheetNames = spreadsheet.data.sheets?.map(
        (s) => s.properties?.title || "Sheet1"
      ) || ["Sheet1"];

      return res.json({
        valid: true,
        title: spreadsheet.data.properties?.title || "Untitled",
        sheetNames,
      });
    } catch (error: any) {
      const gaxiosError = error?.response?.data?.error;
      const httpStatus = error?.response?.status || error?.code;
      const errorMessage = gaxiosError?.message || error?.message || "";

      console.error("Sheet validation error:", httpStatus, errorMessage);

      if (httpStatus === 403) {
        if (errorMessage.includes("API has not been used") || errorMessage.includes("API has not been enabled") || errorMessage.includes("sheets.googleapis.com")) {
          return res.status(403).json({
            valid: false,
            error: "The Google Sheets API is not enabled for your project. Go to Google Cloud Console > APIs & Services > Enable APIs, search for 'Google Sheets API' and enable it.",
            errorType: "API_NOT_ENABLED",
          });
        }
        return res.status(403).json({
          valid: false,
          error: "Access denied. This could mean: (1) Your API key is invalid or restricted, (2) The spreadsheet is not shared publicly. Make the sheet 'Anyone with the link can view'.",
          errorType: "FORBIDDEN",
        });
      }

      if (httpStatus === 401) {
        return res.status(401).json({
          valid: false,
          error: "Invalid API Key. Please double-check it in Google Cloud Console > APIs & Services > Credentials.",
          errorType: "INVALID_KEY",
        });
      }

      if (httpStatus === 404) {
        return res.status(404).json({
          valid: false,
          error: "Spreadsheet not found. Make sure the Sheet ID is correct.",
          errorType: "NOT_FOUND",
        });
      }

      return res.status(500).json({
        valid: false,
        error: `Connection failed: ${errorMessage || "Unknown error"}. Please verify your API Key and Sheet ID.`,
        errorType: "UNKNOWN",
      });
    }
  });

  app.post("/api/sheets/data", async (req, res) => {
    try {
      const sheetId = getSheetId(req.body?.sheetId);
      const apiKey = getApiKey(req.body?.apiKey);
      const sheetName = req.body?.sheetName;

      if (!sheetId || !apiKey) {
        return res.status(400).json({ error: "Missing Sheet ID or API Key configuration." });
      }

      const sheets = google.sheets({ version: "v4", auth: apiKey });
      const range = sheetName || "Sheet1";

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range,
      });

      const rows = response.data.values;

      if (!rows || rows.length === 0) {
        return res.json({
          title: sheetName || "Sheet1",
          headers: [],
          data: [],
          totalRows: 0,
          lastUpdated: new Date().toISOString(),
        });
      }

      const headers = rows[0].map((h: string, i: number) => h?.trim() || `Column_${i + 1}`);
      const dataRows = rows.slice(1).map((row: any[], rowIndex: number) => {
        const obj: Record<string, string> = { _rowIndex: String(rowIndex) };
        headers.forEach((header: string, colIndex: number) => {
          obj[header] = row[colIndex] !== undefined && row[colIndex] !== null ? String(row[colIndex]) : "";
        });
        return obj;
      });

      const meta = await sheets.spreadsheets.get({
        spreadsheetId: sheetId,
        fields: "properties.title",
      });

      return res.json({
        title: meta.data.properties?.title || "Untitled Spreadsheet",
        headers,
        data: dataRows,
        totalRows: dataRows.length,
        lastUpdated: new Date().toISOString(),
      });
    } catch (error: any) {
      const gaxiosError = error?.response?.data?.error;
      const httpStatus = error?.response?.status;
      const errorMessage = gaxiosError?.message || error?.message || "Unknown error";

      console.error("Sheet data fetch error:", httpStatus, errorMessage);

      if (httpStatus === 400 && errorMessage.includes("Unable to parse range")) {
        return res.status(400).json({
          error: `Sheet tab "${req.body?.sheetName}" was not found. Check the exact tab name (it's case-sensitive).`,
        });
      }

      return res.status(httpStatus >= 400 ? httpStatus : 500).json({
        error: `Failed to fetch data: ${errorMessage}`,
      });
    }
  });

  return httpServer;
}
