import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { fetchSheetData, loadConfig } from "@/lib/sheets-api";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertCircle, RefreshCw, Building2, FileSpreadsheet,
  Search, FileDown, ChevronDown, ChevronRight, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { useMemo, useState, useEffect, useRef } from "react";
import { LogoutButton } from "@/components/LogoutButton";

// ─── Batches ──────────────────────────────────────────────────────────────────

const BATCHES = [
  { label: "Batch 4", tabName: "Statuses NIAT'26" },
  { label: "Batch 3", tabName: "Statuses NIAT'25" },
  { label: "Batch 2", tabName: "Statuses NIAT'24" },
];

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

function UniversityRow({
  row, index, headers,
  uniField, codeField, cityField, deliveryField, logoField, linkField,
  activeCol,
}: {
  row: Record<string, string>; index: number; headers: string[];
  uniField: string; codeField: string; cityField: string;
  deliveryField: string; logoField: string; linkField: string;
  activeCol: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const name = row[uniField] || "—";
  const code = row[codeField] || "";
  const city = row[cityField] || "";
  const delivery = row[deliveryField] || "";
  const logo = row[logoField] || "";
  const link = row[linkField] || "";
  const statusVal = row[activeCol] || "";
  const statusKey = getStatusKey(statusVal);
  const initial = name.charAt(0).toUpperCase();

  // Detail fields: all headers except those already shown in header area
  const detailFields = useMemo(() => {
    return headers.filter((h) => {
      if (!row[h]?.trim()) return false; // skip empty
      if (isLogoCol(h)) return false; // logo already rendered as image
      const lc = h.trim().toLowerCase();
      if (HEADER_FIELDS_LC.has(lc)) return false;
      if (activeCol && lc === activeCol.trim().toLowerCase()) return false; // shown as badge
      return true;
    });
  }, [headers, row, activeCol]);

  return (
    <div
      className={`${index % 2 === 1 ? "bg-muted/20" : ""}`}
      data-testid={`modal-row-${index}`}
    >
      {/* LEVEL 1: always visible */}
      <div className="flex items-center gap-4 px-6 py-3.5">
        {/* Logo */}
        {logo ? (
          <img
            src={logo} alt={name}
            className="h-10 w-10 rounded-full object-contain bg-white border border-border shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 border border-border flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-slate-500">{initial}</span>
          </div>
        )}

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm truncate">
            {name}{code ? ` (${code})` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 mt-1">
            {/* Status badge */}
            {statusVal && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                statusKey === "0" || statusKey === "1" ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" :
                statusKey === "2" || statusKey === "3" ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400" :
                statusKey === "4" || statusKey === "5" ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400" :
                statusKey === "6" || statusKey === "7" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" :
                "bg-muted text-muted-foreground"
              }`}>
                {statusVal}
              </span>
            )}
            {city && <span className="text-xs text-muted-foreground">{city}</span>}
            {delivery && <span className="text-xs text-muted-foreground">{delivery}</span>}
          </div>
        </div>

        {/* Expand button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-muted hover:bg-muted/80 text-muted-foreground shrink-0"
        >
          <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
          {expanded ? "Less" : "More Details"}
        </button>
      </div>

      {/* LEVEL 2: expanded detail grid */}
      {expanded && (
        <div className="px-6 pb-4 pt-1 ml-14">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {detailFields.map((h) => {
              const val = row[h] || "";
              // Render links as clickable buttons
              if (isLinkCol(h) && /^https?:\/\//.test(val.trim())) {
                return (
                  <div key={h} className="col-span-1 sm:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</span>
                    <div className="mt-0.5">
                      <a
                        href={val.trim()} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" /> Open Sheet
                      </a>
                    </div>
                  </div>
                );
              }
              // Long text fields span full width
              const isLong = val.length > 60;
              return (
                <div key={h} className={isLong ? "col-span-1 sm:col-span-2" : ""}>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</span>
                  <p className="text-foreground mt-0.5 whitespace-pre-wrap break-words">{val}</p>
                </div>
              );
            })}
            {detailFields.length === 0 && (
              <p className="text-muted-foreground text-xs col-span-2">No additional details available.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── University modal ─────────────────────────────────────────────────────────

function UniversityModal({
  open, onClose, title, rows, headers,
  uniField, codeField, cityField, deliveryField, logoField, linkField,
  activeCol,
}: {
  open: boolean; onClose: () => void; title: string;
  rows: Record<string, string>[]; headers: string[];
  uniField: string; codeField: string; cityField: string;
  deliveryField: string; logoField: string; linkField: string;
  activeCol: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => Object.values(r).some((v) => v.toLowerCase().includes(q)));
  }, [rows, search]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        {/* Modal header */}
        <div className="bg-slate-800 dark:bg-slate-900 px-6 py-5 border-b border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white text-base font-semibold leading-snug">{title}</DialogTitle>
            <p className="text-slate-400 text-sm mt-0.5">{rows.length} {rows.length === 1 ? "University" : "Universities"}</p>
          </DialogHeader>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search universities…"
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-700 text-white placeholder-slate-400 text-sm border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="input-detail-search"
            />
          </div>
        </div>

        {/* Row list */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
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
                linkField={linkField}
                activeCol={activeCol}
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
  const linkField     = useMemo(() => detectField(headers, "Sheet Link"), [headers]);

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
                  ? "bg-primary text-primary-foreground shadow"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
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
            <span className="text-2xl font-bold text-foreground">{grandTotal}</span>
            <span className="text-sm text-muted-foreground ml-2">Total Universities</span>
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
            className="gap-1.5 rounded-lg text-xs"
            data-testid="button-export"
          >
            <FileDown className="w-3.5 h-3.5" /> Export
          </Button>
          <Button
            size="sm" onClick={() => refetch()} disabled={isRefetching}
            className="gap-1.5 rounded-lg text-xs"
            data-testid="button-refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            {isRefetching ? "Syncing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Section heading */}
      <div>
        <h2 className="text-xl font-bold text-foreground">NIAT BOS Approval Status</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Click any row to view universities</p>
      </div>

      {/* Pivot table */}
      <div className="rounded-xl overflow-hidden border border-border shadow-sm">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_140px] bg-slate-800 dark:bg-slate-900 text-white text-sm font-semibold">
          <div className="px-5 py-3.5 border-r border-slate-700">{semLabel}</div>
          <div className="px-5 py-3.5 text-right">Count of Universities</div>
        </div>

        {/* Data rows */}
        {pivotRows.length === 0 ? (
          <div className="px-5 py-10 text-center text-muted-foreground text-sm">
            No status data for this semester.
          </div>
        ) : (
          pivotRows.map((row, i) => {
            const isBlank = row.key === null;
            const cc = isBlank ? "text-muted-foreground" : countColor(row.key);

            return (
              <button
                key={row.key ?? "__blank__"}
                onClick={() => { setModalKey(row.key); setModalOpen(true); }}
                className={`w-full grid grid-cols-[1fr_140px] text-left text-sm transition-colors cursor-pointer
                  ${i % 2 === 0 ? "bg-background" : "bg-muted/30 dark:bg-muted/10"}
                  hover:bg-blue-50 dark:hover:bg-blue-900/20 border-t border-border`}
                data-testid={`pivot-row-${row.key ?? "blank"}`}
              >
                <div className={`px-5 py-3.5 border-r border-border ${isBlank ? "text-muted-foreground" : "text-foreground"}`}>
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
          <div className="px-5 py-3.5 border-r border-border text-foreground">Grand Total</div>
          <div className="px-5 py-3.5 text-right text-foreground tabular-nums">{grandTotal}</div>
        </div>
      </div>

      {/* Last sync */}
      {dataUpdatedAt > 0 && (
        <p className="text-xs text-muted-foreground text-right">
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
        linkField={linkField}
        activeCol={activeCol}
      />
    </div>
  );
}

// ─── Batch selector ───────────────────────────────────────────────────────────

function BatchSelector({
  activeBatch, onSelect,
}: { activeBatch: number; onSelect: (i: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const latest = BATCHES[0];
  const older = BATCHES.slice(1);
  const isLatest = activeBatch === 0;

  return (
    <div className="flex items-center gap-2" ref={ref}>
      <button
        onClick={() => onSelect(0)}
        className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
          isLatest ? "bg-primary text-primary-foreground shadow-md" : "bg-muted text-muted-foreground hover:bg-muted/80"
        }`}
        data-testid="tab-batch-latest"
      >
        {latest.label}
      </button>
      {older.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              !isLatest ? "bg-primary text-primary-foreground shadow-md" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            data-testid="dropdown-older-batches"
          >
            {!isLatest ? BATCHES[activeBatch].label : "Previous Batches"}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1.5 bg-popover border border-border rounded-xl shadow-lg py-1 min-w-[130px] z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              {older.map((b, i) => (
                <button
                  key={b.tabName}
                  onClick={() => { onSelect(i + 1); setOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    activeBatch === i + 1 ? "bg-accent text-accent-foreground font-semibold" : "text-foreground hover:bg-accent/50"
                  }`}
                  data-testid={`dropdown-item-${b.label}`}
                >
                  {b.label}
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

  if (!config) { setLocation("/"); return null; }

  return (
    <Layout>
      <div className="space-y-8">
        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground" data-testid="text-report-title">
                {config.spreadsheetTitle || "University BOS Dashboard"}
              </h1>
              <div className="md:hidden"><LogoutButton /></div>
            </div>
            <p className="text-sm text-muted-foreground mt-1">BOS status tracking across NIAT cohorts</p>
          </div>
          <div className="flex items-end gap-4">
            <BatchSelector activeBatch={activeBatch} onSelect={setActiveBatch} />
            <div className="hidden md:block"><LogoutButton /></div>
          </div>
        </div>

        {/* Pivot table */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500" key={BATCHES[activeBatch].tabName}>
          <PivotTable tabName={BATCHES[activeBatch].tabName} config={config} />
        </div>
      </div>
    </Layout>
  );
}
