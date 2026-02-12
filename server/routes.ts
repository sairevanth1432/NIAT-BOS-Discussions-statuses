import type { Express } from "express";
import { createServer, type Server } from "http";
import { google } from "googleapis";
import { z } from "zod";

const fetchSheetSchema = z.object({
  sheetId: z.string().min(5),
  apiKey: z.string().min(10),
  sheetName: z.string().optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/sheets/validate", async (req, res) => {
    try {
      const parsed = fetchSheetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          valid: false,
          error: "Please provide a valid Sheet ID (at least 5 characters) and API Key (at least 10 characters).",
        });
      }

      const { sheetId, apiKey } = parsed.data;
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
          error: "Spreadsheet not found. Make sure the Sheet ID is correct (it's the long string in the URL between '/d/' and '/edit').",
          errorType: "NOT_FOUND",
        });
      }

      if (httpStatus === 400) {
        return res.status(400).json({
          valid: false,
          error: "Invalid request. The Sheet ID format appears incorrect. Copy it from your spreadsheet URL.",
          errorType: "BAD_REQUEST",
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
      const parsed = fetchSheetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request parameters." });
      }

      const { sheetId, apiKey, sheetName } = parsed.data;
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
          error: `Sheet tab "${req.body.sheetName}" was not found. Check the exact tab name in your spreadsheet (it's case-sensitive).`,
        });
      }

      return res.status(httpStatus >= 400 ? httpStatus : 500).json({
        error: `Failed to fetch data: ${errorMessage}`,
      });
    }
  });

  return httpServer;
}
