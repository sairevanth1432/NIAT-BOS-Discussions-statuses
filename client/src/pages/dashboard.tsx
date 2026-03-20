import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { fetchSheetData, loadConfig } from "@/lib/sheets-api";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertCircle, RefreshCw, Building2, FileSpreadsheet,
  Search, FileDown, ChevronDown, ChevronRight, ExternalLink,
  MapPin, GraduationCap, Calendar, Landmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { useMemo, useState, useEffect, useRef } from "react";
import { LogoutButton } from "@/components/LogoutButton";

// ─── Tab filtering ───────────────────────────────────────────────────────────

// Only show tabs that look like status/university data tabs
const EXCLUDED_TABS = ["bos status dropdowns", "transcripts"];

function isStatusTab(name: string): boolean {
  const lc = name.trim().toLowerCase();
  if (EXCLUDED_TABS.some((ex) => lc === ex)) return false;
  // Include tabs starting with "Statuses" or containing university data
  if (lc.startsWith("statuses")) return true;
  // Also include if it doesn't match known non-status patterns
  // Be permissive: exclude only known non-status tabs
  return !lc.includes("dropdown") && !lc.includes("transcript");
}

// ─── Status definitions ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  "0": "Awaiting Partnership team Update",
  "1": "Blocked - Leadership / Regulatory Discussion",
  "2": "Under Review - Structure & Syllabi - Nxtwave Associate Dean Approval Pending",
  "3": "Waiting for University POC Time - Structure & Syllabi",
  "4": "CSS File Approved Internally",
  "5": "Waiting for University BOS Approval",
  "6": "BOS Approved – Ready for Implementation",
  "7": "No Intervention Required",
};

function countColor(key: string | null): string {
  if (key === null) return "text-muted-foreground";
  if (key === "0" || key === "1") return "text-red-600 dark:text-red-400 font-semibold";
  if (key === "2" || key === "3") return "text-orange-600 dark:text-orange-400 font-semibold";
  if (key === "4" || key === "5") return "text-yellow-600 dark:text-yellow-400 font-semibold";
  if (key === "6" || key === "7") return "text-emerald-600 dark:text-emerald-400 font-semibold";
  return "text-foreground";
}

// ─── Column detection ─────────────────────────────────────────────────────────

// Returns an array of { sem, col } for every "Sem N BOS Status" column that exists in headers.
// Checks all 8 possible semesters independently — no early break.
function detectSemesterColumns(headers: string[]): { sem: number; col: string }[] {
  const result: { sem: number; col: string }[] = [];
  for (let sem = 1; sem <= 8; sem++) {
    const col = headers.find((h) => {
      const t = h.trim().toLowerCase().replace(/\s+/g, " ");
      return (
        (t.includes(`sem ${sem}`) || t.includes(`semester ${sem}`)) &&
        t.includes("bos")
      );
    });
    if (col) {
      console.log(`Matched BOS column for Semester ${sem}:`, col);
      result.push({ sem, col });
    }
  }
  return result;
}

function detectField(headers: string[], ...candidates: string[]): string {
  return (
    headers.find((h) => candidates.some((c) => h.trim().toLowerCase() === c.toLowerCase())) ||
    headers.find((h) => candidates.some((c) => h.trim().toLowerCase().includes(c.toLowerCase()))) ||
    ""
  );
}

function getStatusKey(val: string): string | null {
  if (!val?.trim()) return null;
  const m = val.trim().match(/^(\d+)[.\s]/);
  return m ? m[1] : null;
}

// ─── Export ───────────────────────────────────────────────────────────────────

function doExportCSV(rows: Record<string, string>[], headers: string[], filename: string) {
  const lines = [headers.join(",")];
  rows.forEach((r) => lines.push(headers.map((h) => `"${(r[h] || "").replace(/"/g, '""')}"`).join(",")));
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

// ─── University row (expandable) ──────────────────────────────────────────────

// Columns to hide from the detail grid (already shown in the header area)
const HEADER_FIELDS_LC = new Set(["university", "logo url", "code", "city", "delivery"]);
function isLogoCol(h: string) { return /logo/i.test(h); }
function isLinkCol(h: string) { return /sheet\s*link/i.test(h); }
function isDocUrlCol(h: string) { return /sheet\s*url.*curriculum|sem\s*\d+\s*detailed\s*syllabus\s*url/i.test(h); }

// Document link definitions for the 3 URL columns
const DOC_LINKS: { test: (h: string) => boolean; label: string; color: string; hoverColor: string }[] = [
  { test: (h) => /sheet\s*url.*curriculum/i.test(h), label: "Curriculum Sheet", color: "bg-blue-600", hoverColor: "hover:bg-blue-500" },
  { test: (h) => /sem\s*1\s*detailed\s*syllabus/i.test(h), label: "Sem 1 Syllabus", color: "bg-indigo-600", hoverColor: "hover:bg-indigo-500" },
  { test: (h) => /sem\s*2\s*detailed\s*syllabus/i.test(h), label: "Sem 2 Syllabus", color: "bg-purple-600", hoverColor: "hover:bg-purple-500" },
];

function getDocLinks(row: Record<string, string>, headers: string[]): { label: string; url: string; color: string; hoverColor: string }[] {
  const results: { label: string; url: string; color: string; hoverColor: string }[] = [];
  for (const doc of DOC_LINKS) {
    const col = headers.find((h) => doc.test(h));
    if (!col) continue;
    const val = (row[col] || "").trim();
    if (val && /^https?:\/\//.test(val)) {
      results.push({ label: doc.label, url: val, color: doc.color, hoverColor: doc.hoverColor });
    }
  }
  return results;
}

// Grouping for detail sections
const SECTION_MATCHERS: { title: string; test: (h: string) => boolean }[] = [
  { title: "BOS Status", test: (h) => /sem(ester)?\s*\d.*bos/i.test(h) },
  { title: "Meeting Details", test: (h) => /meeting|action\s*item|timeline.*close|number.*meeting/i.test(h) },
  { title: "Curriculum", test: (h) => /course|curriculum|framework|evaluation|syllab/i.test(h) },
];

function classifyField(h: string): string {
  for (const s of SECTION_MATCHERS) {
    if (s.test(h)) return s.title;
  }
  return "Other";
}


function QuickInfoPill({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-700 text-slate-300 text-xs font-medium">
      <Icon className="w-3 h-3 text-slate-400" />
      {children}
    </span>
  );
}

function UniversityRow({
  row, index, headers,
  uniField, codeField, cityField, deliveryField, logoField,
  activeCol, studentField, startDateField,
}: {
  row: Record<string, string>; index: number; headers: string[];
  uniField: string; codeField: string; cityField: string;
  deliveryField: string; logoField: string;
  activeCol: string; studentField: string; startDateField: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const name = row[uniField] || "—";
  const code = row[codeField] || "";
  const city = row[cityField] || "";
  const delivery = row[deliveryField] || "";
  const logo = row[logoField] || "";
  const students = row[studentField] || "";
  const startDate = row[startDateField] || "";
  const statusVal = row[activeCol] || "";
  const statusKey = getStatusKey(statusVal);
  const initial = name.charAt(0).toUpperCase();
  const docLinks = getDocLinks(row, headers);

  // Detail fields grouped by section
  const groupedDetails = useMemo(() => {
    const fields = headers.filter((h) => {
      if (!row[h]?.trim()) return false;
      if (isLogoCol(h)) return false;
      if (isLinkCol(h)) return false;
      if (isDocUrlCol(h)) return false;
      const lc = h.trim().toLowerCase();
      if (HEADER_FIELDS_LC.has(lc)) return false;
      if (lc === (studentField || "").trim().toLowerCase() && studentField) return false;
      if (lc === (startDateField || "").trim().toLowerCase() && startDateField) return false;
      if (activeCol && lc === activeCol.trim().toLowerCase()) return false;
      return true;
    });

    const groups: Record<string, string[]> = {};
    fields.forEach((h) => {
      const section = classifyField(h);
      if (!groups[section]) groups[section] = [];
      groups[section].push(h);
    });

    const ordered: { title: string; fields: string[] }[] = [];
    for (const s of SECTION_MATCHERS) {
      if (groups[s.title]) ordered.push({ title: s.title, fields: groups[s.title] });
    }
    if (groups["Other"]) ordered.push({ title: "Other", fields: groups["Other"] });
    return ordered;
  }, [headers, row, activeCol, studentField, startDateField]);

  const statusBadgeClass =
    statusKey === "0" || statusKey === "1" ? "bg-red-500/20 text-red-400 border-red-500/30" :
    statusKey === "2" || statusKey === "3" ? "bg-orange-500/20 text-orange-400 border-orange-500/30" :
    statusKey === "4" || statusKey === "5" ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" :
    statusKey === "6" || statusKey === "7" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
    "bg-slate-700 text-slate-300 border-slate-600";

  return (
    <div
      className="bg-slate-800 hover:bg-slate-800/80 transition-all duration-200 hover:-translate-y-px hover:shadow-lg hover:shadow-slate-900/50 rounded-xl border border-slate-700 mb-2"
      data-testid={`modal-row-${index}`}
    >
      {/* CARD HEADER */}
      <div className="flex items-start gap-4 px-5 py-4">
        {/* Logo */}
        {logo ? (
          <img
            src={logo} alt={name}
            className="h-12 w-12 rounded-lg object-contain bg-white/10 border border-slate-600 shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-12 w-12 rounded-lg bg-slate-700 border border-slate-600 flex items-center justify-center shrink-0">
            <span className="text-base font-bold text-slate-300">{initial}</span>
          </div>
        )}

        {/* Name + code + quick info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-white text-base truncate">{name}</p>
            {code && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-700 text-slate-400 text-xs font-medium shrink-0">
                {code}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {city && <QuickInfoPill icon={MapPin}>{city}</QuickInfoPill>}
            {delivery && <QuickInfoPill icon={Landmark}>{delivery}</QuickInfoPill>}
            {students && <QuickInfoPill icon={GraduationCap}>{students}</QuickInfoPill>}
            {startDate && <QuickInfoPill icon={Calendar}>{startDate}</QuickInfoPill>}
          </div>
          {/* Document link buttons */}
          {docLinks.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {docLinks.map((doc) => (
                <a
                  key={doc.label}
                  href={doc.url} target="_blank" rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${doc.color} ${doc.hoverColor} text-white text-xs font-medium transition-all duration-150 hover:brightness-110 shadow-sm`}
                >
                  {doc.label} <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Right side: status badge */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {statusVal && (
            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${statusBadgeClass}`}>
              {statusKey !== null ? `${statusKey}.` : ""} {STATUS_LABELS[statusKey ?? ""] || statusVal}
            </span>
          )}
        </div>
      </div>

      {/* SEPARATOR + EXPAND BUTTON */}
      <div className="border-t border-slate-700/50 px-5 py-2 flex justify-between items-center">
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white"
        >
          <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-300 ${expanded ? "rotate-90" : ""}`} />
          {expanded ? "Less Details" : "More Details"}
        </button>
      </div>

      {/* EXPANDABLE DETAIL SECTION */}
      <div
        ref={detailRef}
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          maxHeight: expanded ? (detailRef.current?.scrollHeight ?? 2000) + "px" : "0px",
          opacity: expanded ? 1 : 0,
        }}
      >
        <div className="px-5 pb-5 pt-1 border-t border-slate-700/50">
          {groupedDetails.map((section) => (
            <div key={section.title} className="mt-4 first:mt-2">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{section.title}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                {section.fields.map((h) => {
                  const val = row[h] || "";
                  const isLong = val.length > 60;
                  return (
                    <div key={h} className={isLong ? "col-span-1 sm:col-span-2" : ""}>
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</span>
                      <p className="text-slate-100 mt-0.5 whitespace-pre-wrap break-words leading-relaxed">{val}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {groupedDetails.length === 0 && docLinks.length === 0 && (
            <p className="text-slate-500 text-xs mt-3">No additional details available.</p>
          )}

          {/* Documents section */}
          {docLinks.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Documents</h4>
              <div className="flex flex-col gap-2">
                {docLinks.map((doc) => (
                  <a
                    key={doc.label}
                    href={doc.url} target="_blank" rel="noopener noreferrer"
                    className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl ${doc.color} ${doc.hoverColor} text-white text-sm font-semibold transition-all duration-200 hover:brightness-110 shadow-md`}
                  >
                    {doc.label} <ExternalLink className="w-4 h-4" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── University modal ─────────────────────────────────────────────────────────

function UniversityModal({
  open, onClose, title, rows, headers,
  uniField, codeField, cityField, deliveryField, logoField,
  activeCol, studentField, startDateField,
}: {
  open: boolean; onClose: () => void; title: string;
  rows: Record<string, string>[]; headers: string[];
  uniField: string; codeField: string; cityField: string;
  deliveryField: string; logoField: string;
  activeCol: string; studentField: string; startDateField: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => Object.values(r).some((v) => v.toLowerCase().includes(q)));
  }, [rows, search]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[800px] max-h-[80vh] overflow-hidden flex flex-col p-0 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/50">
        {/* Modal header */}
        <div className="bg-slate-900 px-6 py-5 border-b border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold leading-snug">{title}</DialogTitle>
            <p className="text-slate-400 text-sm mt-1">{rows.length} {rows.length === 1 ? "University" : "Universities"}</p>
          </DialogHeader>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search universities…"
              className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-slate-800 text-white placeholder-slate-500 text-sm border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              data-testid="input-detail-search"
            />
          </div>
        </div>

        {/* University cards list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-900">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No matching universities</p>
            </div>
          ) : (
            filtered.map((row, i) => (
              <UniversityRow
                key={i}
                row={row}
                index={i}
                headers={headers}
                uniField={uniField}
                codeField={codeField}
                cityField={cityField}
                deliveryField={deliveryField}
                logoField={logoField}
                activeCol={activeCol}
                studentField={studentField}
                startDateField={startDateField}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pivot table ──────────────────────────────────────────────────────────────

function PivotTable({ tabName, config }: { tabName: string; config: any }) {
  const [activeSem, setActiveSem] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState<string | null>(null); // null = blank status row

  const { data, isLoading, error, refetch, isRefetching, dataUpdatedAt } = useQuery({
    queryKey: ["sheetData", config.sheetId, tabName, config.useServerConfig],
    queryFn: () => fetchSheetData(config, tabName),
    refetchInterval: 60 * 1000,
    staleTime: 0,
    gcTime: 0,
  });

  const headers: string[] = useMemo(() => data?.headers ?? [], [data]);

  // Debug: log raw sheet headers and first row whenever data loads
  useEffect(() => {
    if (data) {
      console.log("Sheet headers:", data.headers);
      console.log("First row data:", (data.data as Record<string, string>[])?.[0]);
    }
  }, [data]);

  // semCols is { sem: number; col: string }[] — only semesters whose column exists in the sheet
  const semCols = useMemo(() => detectSemesterColumns(headers), [headers]);

  const uniField      = useMemo(() => detectField(headers, "University"), [headers]);
  const codeField     = useMemo(() => detectField(headers, "Code"), [headers]);
  const cityField     = useMemo(() => detectField(headers, "City"), [headers]);
  const deliveryField = useMemo(() => detectField(headers, "Delivery"), [headers]);
  const logoField     = useMemo(() => detectField(headers, "logo URL", "Logo URL", "logo"), [headers]);
  const studentField  = useMemo(() => detectField(headers, "Student Count", "Students", "No of Students", "Number of Students"), [headers]);
  const startDateField = useMemo(() => detectField(headers, "Start Date", "Starting Date", "Batch Start"), [headers]);

  useEffect(() => { setActiveSem(0); }, [tabName]);

  const semIndex = Math.min(activeSem, Math.max(0, semCols.length - 1));
  // Derive activeCol from the selected entry — reading ONLY that semester's column
  const activeEntry = semCols[semIndex];
  const activeCol = activeEntry?.col ?? "";

  // Build pivot rows: { key: string | null, label: string, rows: [...] }
  const BLANK_LABEL = "Timeline for BOS is not yet decided";

  const pivotRows = useMemo(() => {
    if (!data || !activeCol) return [];
    const rows = (data.data as Record<string, string>[]).filter((r) => r[uniField]?.trim());
    const buckets: Record<string, Record<string, string>[]> = {};

    rows.forEach((row) => {
      const key = getStatusKey(row[activeCol] || "");
      const bucketKey = key === null ? "__blank__" : key;
      if (!buckets[bucketKey]) buckets[bucketKey] = [];
      buckets[bucketKey].push(row);
    });

    // Sort: blank first, then 0, 1, 2, 3 …
    const keys = Object.keys(buckets).sort((a, b) => {
      if (a === "__blank__") return -1;
      if (b === "__blank__") return 1;
      return Number(a) - Number(b);
    });

    return keys.map((k) => ({
      key: k === "__blank__" ? null : k,
      label: k === "__blank__" ? BLANK_LABEL : `${k}. ${STATUS_LABELS[k] ?? k}`,
      rows: buckets[k],
    }));
  }, [data, activeCol, uniField]);

  const grandTotal = useMemo(() => pivotRows.reduce((s, r) => s + r.rows.length, 0), [pivotRows]);

  const semLabel = activeEntry ? `Semester ${activeEntry.sem} BOS Status` : "BOS Status";

  // Find modal rows
  const modalRows = useMemo(() => {
    if (!modalOpen) return [];
    return pivotRows.find((r) => r.key === modalKey)?.rows ?? [];
  }, [modalOpen, modalKey, pivotRows]);
  const modalTitle = modalKey === null
    ? BLANK_LABEL
    : `${modalKey}. ${STATUS_LABELS[modalKey] ?? modalKey}`;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full rounded" />
        {[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
        <Skeleton className="h-12 w-full rounded" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error Loading Data</AlertTitle>
        <AlertDescription>{(error as Error)?.message ?? "Failed to fetch sheet data."}</AlertDescription>
      </Alert>
    );
  }

  if (semCols.length === 0) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p className="font-semibold">No BOS Status columns found in this sheet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Semester selector — only shown when more than one semester column exists */}
      {semCols.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {semCols.map((entry, i) => (
            <button
              key={entry.sem}
              onClick={() => setActiveSem(i)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
                semIndex === i
                  ? "bg-blue-600 text-white shadow"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
              }`}
              data-testid={`tab-semester-${entry.sem}`}
            >
              Semester {entry.sem}
            </button>
          ))}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{grandTotal}</span>
            <span className="text-sm text-slate-500 dark:text-slate-400 ml-2">Total Universities</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => doExportCSV(
              data.data as Record<string, string>[],
              headers,
              `${tabName.replace(/[' ]/g, "_")}_${format(new Date(), "yyyy-MM-dd")}.csv`
            )}
            className="gap-1.5 rounded-lg text-xs border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            data-testid="button-export"
          >
            <FileDown className="w-3.5 h-3.5" /> Export
          </Button>
          <Button
            size="sm" onClick={() => refetch()} disabled={isRefetching}
            className="gap-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-700 text-white"
            data-testid="button-refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            {isRefetching ? "Syncing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Section heading */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">NIAT BOS Approval Status</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Click any row to view universities</p>
      </div>

      {/* Pivot table */}
      <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_140px] bg-slate-800 dark:bg-slate-950 text-white text-sm font-semibold">
          <div className="px-5 py-3.5 border-r border-slate-700">{semLabel}</div>
          <div className="px-5 py-3.5 text-right">Count of Universities</div>
        </div>

        {/* Data rows */}
        {pivotRows.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-400 dark:text-slate-500 text-sm bg-white dark:bg-slate-900">
            No status data for this semester.
          </div>
        ) : (
          pivotRows.map((row, i) => {
            const isBlank = row.key === null;
            const cc = isBlank ? "text-slate-400 dark:text-slate-500" : countColor(row.key);

            return (
              <button
                key={row.key ?? "__blank__"}
                onClick={() => { setModalKey(row.key); setModalOpen(true); }}
                className={`w-full grid grid-cols-[1fr_140px] text-left text-sm transition-colors cursor-pointer
                  ${i % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50 dark:bg-slate-800/60"}
                  hover:bg-blue-50 dark:hover:bg-slate-700 border-t border-slate-200 dark:border-slate-700/50`}
                data-testid={`pivot-row-${row.key ?? "blank"}`}
              >
                <div className={`px-5 py-3.5 border-r border-slate-200 dark:border-slate-700/50 ${isBlank ? "text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-slate-200"}`}>
                  {row.label}
                </div>
                <div className={`px-5 py-3.5 text-right tabular-nums ${cc}`}>
                  {row.rows.length}
                </div>
              </button>
            );
          })
        )}

        {/* Grand total */}
        <div className="grid grid-cols-[1fr_140px] bg-slate-100 dark:bg-slate-800 border-t-2 border-slate-300 dark:border-slate-600 font-bold text-sm">
          <div className="px-5 py-3.5 border-r border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">Grand Total</div>
          <div className="px-5 py-3.5 text-right text-slate-900 dark:text-white tabular-nums">{grandTotal}</div>
        </div>
      </div>

      {/* Last sync */}
      {dataUpdatedAt > 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500 text-right">
          Last synced: {format(new Date(dataUpdatedAt), "MMM d, yyyy 'at' h:mm a")} · auto-refreshes every 60 s
        </p>
      )}

      {/* Modal */}
      <UniversityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        rows={modalRows}
        headers={headers}
        uniField={uniField}
        codeField={codeField}
        cityField={cityField}
        deliveryField={deliveryField}
        logoField={logoField}
        activeCol={activeCol}
        studentField={studentField}
        startDateField={startDateField}
      />
    </div>
  );
}

// ─── Batch selector ───────────────────────────────────────────────────────────

function BatchSelector({
  activeBatch, onSelect, tabs,
}: { activeBatch: number; onSelect: (i: number) => void; tabs: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (tabs.length === 0) return null;

  // Default tab is last in the list (index 0 in our reversed array = last sheet tab)
  const defaultTab = tabs[0];
  const otherTabs = tabs.slice(1);
  const isDefault = activeBatch === 0;

  return (
    <div className="flex items-center gap-2" ref={ref}>
      <button
        onClick={() => onSelect(0)}
        className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
          isDefault ? "bg-blue-600 text-white shadow-md" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
        }`}
        data-testid="tab-batch-latest"
      >
        {defaultTab}
      </button>
      {otherTabs.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              !isDefault ? "bg-blue-600 text-white shadow-md" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
            }`}
            data-testid="dropdown-older-batches"
          >
            {!isDefault ? tabs[activeBatch] : "Previous Batches"}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1 min-w-[130px] z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              {otherTabs.map((tabName, i) => (
                <button
                  key={tabName}
                  onClick={() => { onSelect(i + 1); setOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    activeBatch === i + 1 ? "bg-blue-50 dark:bg-slate-700 text-blue-700 dark:text-blue-400 font-semibold" : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  }`}
                  data-testid={`dropdown-item-${tabName}`}
                >
                  {tabName}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const config = loadConfig();
  const [activeBatch, setActiveBatch] = useState(0);

  // Build dynamic tab list from config.sheetNames, filtered and reversed (latest last → first)
  const statusTabs = useMemo(() => {
    const allTabs = config?.sheetNames ?? [];
    const filtered = allTabs.filter(isStatusTab);
    // Reverse so the last tab in the sheet (most recent) is first/default
    return [...filtered].reverse();
  }, [config?.sheetNames]);

  // Dynamic title from spreadsheet
  const dashboardTitle = config?.spreadsheetTitle || "BOS Approval Status";

  if (!config) { setLocation("/"); return null; }

  const activeTabName = statusTabs[activeBatch] ?? statusTabs[0] ?? "";

  return (
    <Layout>
      <div className="space-y-8">
        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white pl-10 md:pl-0" data-testid="text-report-title">
                {dashboardTitle}
              </h1>
              <div className="md:hidden"><LogoutButton /></div>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">BOS status tracking across NIAT cohorts</p>
          </div>
          <div className="flex items-end gap-4">
            <BatchSelector activeBatch={activeBatch} onSelect={setActiveBatch} tabs={statusTabs} />
            <div className="hidden md:block"><LogoutButton /></div>
          </div>
        </div>

        {/* Pivot table */}
        {activeTabName ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500" key={activeTabName}>
            <PivotTable tabName={activeTabName} config={config} />
          </div>
        ) : (
          <div className="py-20 text-center text-muted-foreground">
            <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-semibold">No status tabs found in this spreadsheet.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
