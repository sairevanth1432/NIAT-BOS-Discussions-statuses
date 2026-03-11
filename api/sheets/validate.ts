import type { VercelRequest, VercelResponse } from "@vercel/node";
import { google } from "googleapis";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const sheetId = req.body?.sheetId || process.env.GOOGLE_SHEET_ID || "";
  const apiKey = req.body?.apiKey || process.env.GOOGLE_SHEETS_API_KEY || "";

  if (!sheetId || sheetId.length < 5) {
    return res.status(400).json({ valid: false, error: "No Sheet ID configured." });
  }
  if (!apiKey || apiKey.length < 10) {
    return res.status(400).json({ valid: false, error: "No API Key configured." });
  }

  try {
    const sheets = google.sheets({ version: "v4", auth: apiKey });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetNames = spreadsheet.data.sheets?.map((s) => s.properties?.title || "Sheet1") || ["Sheet1"];
    return res.json({ valid: true, title: spreadsheet.data.properties?.title || "Untitled", sheetNames });
  } catch (error: any) {
    const httpStatus = error?.response?.status || error?.code;
    const errorMessage = error?.response?.data?.error?.message || error?.message || "";

    if (httpStatus === 403) {
      if (errorMessage.includes("API has not been used") || errorMessage.includes("sheets.googleapis.com")) {
        return res.status(403).json({ valid: false, error: "Google Sheets API is not enabled.", errorType: "API_NOT_ENABLED" });
      }
      return res.status(403).json({ valid: false, error: "Access denied. Check API key or spreadsheet sharing.", errorType: "FORBIDDEN" });
    }
    if (httpStatus === 401) return res.status(401).json({ valid: false, error: "Invalid API Key.", errorType: "INVALID_KEY" });
    if (httpStatus === 404) return res.status(404).json({ valid: false, error: "Spreadsheet not found.", errorType: "NOT_FOUND" });
    return res.status(500).json({ valid: false, error: `Connection failed: ${errorMessage}`, errorType: "UNKNOWN" });
  }
}
