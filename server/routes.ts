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
      const { sheetId, apiKey } = fetchSheetSchema.parse(req.body);

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
      const status = error?.response?.status || error?.code;
      if (status === 403 || status === 401) {
        return res.status(401).json({ valid: false, error: "Invalid API Key or insufficient permissions." });
      }
      if (status === 404) {
        return res.status(404).json({ valid: false, error: "Spreadsheet not found. Check the Sheet ID and make sure it is shared publicly or with your service account." });
      }
      console.error("Sheet validation error:", error?.message || error);
      return res.status(400).json({ valid: false, error: "Could not access this spreadsheet. Please verify the Sheet ID and API Key." });
    }
  });

  app.post("/api/sheets/data", async (req, res) => {
    try {
      const { sheetId, apiKey, sheetName } = fetchSheetSchema.parse(req.body);

      const sheets = google.sheets({ version: "v4", auth: apiKey });

      const range = sheetName ? `${sheetName}` : "Sheet1";

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
      console.error("Sheet data fetch error:", error?.message || error);
      const status = error?.response?.status || 500;
      return res.status(status >= 400 ? status : 500).json({
        error: "Failed to fetch sheet data. Please verify your Sheet ID, API Key, and sheet name.",
      });
    }
  });

  return httpServer;
}
