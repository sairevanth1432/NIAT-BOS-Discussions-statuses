import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { fetchSheetData, loadConfig } from "@/lib/sheets-api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertCircle, RefreshCw, Building2, CheckCircle2, Clock, AlertTriangle,
  FileSpreadsheet, Search, FileDown, XCircle, Loader2, ChevronDown, ChevronRight, Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { useMemo, useState, useEffect, useRef } from "react";
import { LogoutButton } from "@/components/LogoutButton";

// ─── Batch config ────────────────────────────────────────────────────────────

const BATCHES = [
  { label: "Batch 4", tabName: "Statuses NIAT'26" },
  { label: "Batch 3", tabName: "Statuses NIAT'25" },
  { label: "Batch 2", tabName: "Statuses NIAT'24" },
];

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, {
  label: string;
  icon: any;
  gradient: string;
  border: string;
  bg: string;
  color: string;
  dotColor: string;
}> = {
  "0": {
    label: "Awaiting Partnership team Update",
    icon: Clock,
    gradient: "from-red-400 to-red-500",
    border: "border-red-200 dark:border-red-800",
    bg: "bg-red-50 dark:bg-red-900/30",
    color: "text-red-700 dark:text-red-400",
    dotColor: "bg-red-400",
  },
  "1": {
    label: "Blocked - Leadership / Regulatory Discussion",
    icon: XCircle,
    gradient: "from-red-600 to-rose-700",
    border: "border-red-200 dark:border-red-800",
    bg: "bg-red-50 dark:bg-red-900/30",
    color: "text-red-700 dark:text-red-400",
    dotColor: "bg-red-600",
  },
  "2": {
    label: "Under Review - Structure & Syllabi - Nxtwave Associate Dean Approval Pending",
    icon: AlertTriangle,
    gradient: "from-orange-500 to-orange-600",
    border: "border-orange-200 dark:border-orange-800",
    bg: "bg-orange-50 dark:bg-orange-900/30",
    color: "text-orange-700 dark:text-orange-400",
    dotColor: "bg-orange-500",
  },
  "3": {
    label: "Waiting for University POC Time - Structure & Syllabi",
    icon: Clock,
    gradient: "from-orange-600 to-amber-600",
    border: "border-orange-200 dark:border-orange-800",
    bg: "bg-orange-50 dark:bg-orange-900/30",
    color: "text-orange-700 dark:text-orange-400",
    dotColor: "bg-orange-600",
  },
  "4": {
    label: "CSS File Approved Internally",
    icon: FileSpreadsheet,
    gradient: "from-yellow-500 to-amber-500",
    border: "border-yellow-200 dark:border-yellow-800",
    bg: "bg-yellow-50 dark:bg-yellow-900/30",
    color: "text-yellow-700 dark:text-yellow-400",
    dotColor: "bg-yellow-500",
  },
  "5": {
    label: "Waiting for University BOS Approval",
    icon: Clock,
    gradient: "from-amber-500 to-yellow-600",
    border: "border-yellow-200 dark:border-yellow-800",
    bg: "bg-yellow-50 dark:bg-yellow-900/30",
    color: "text-yellow-700 dark:text-yellow-400",
    dotColor: "bg-yellow-600",
  },
  "6": {
    label: "BOS Approved – Ready for Implementation",
    icon: CheckCircle2,
    gradient: "from-emerald-500 to-emerald-600",
    border: "border-emerald-200 dark:border-emerald-800",
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
    color: "text-emerald-700 dark:text-emerald-400",
    dotColor: "bg-emerald-500",
  },
  "7": {
    label: "No Intervention Required",
    icon: CheckCircle2,
    gradient: "from-emerald-400 to-teal-500",
    border: "border-emerald-200 dark:border-emerald-800",
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
    color: "text-emerald-600 dark:text-emerald-400",
    dotColor: "bg-emerald-400",
  },
};

// ─── Column detection helpers ─────────────────────────────────────────────────

function detectSemesterColumns(headers: string[]): string[] {
  // For each semester 1-6, find the matching column header
  const semesters: string[] = [];
  for (let sem = 1; sem <= 6; sem++) {
    const col = headers.find((h) => {
      const t = h.trim().toLowerCase();
      return (
        t === `sem ${sem}` ||
        t === `semester ${sem}` ||
        t.startsWith(`sem ${sem} `) ||
        t.startsWith(`semester ${sem} `) ||
        t.includes(`sem ${sem} bos`) ||
        t.includes(`semester ${sem} bos`) ||
        t.includes(`sem${sem} bos`) ||
        t.includes(`semester${sem} bos`)
      );
    });
    if (col) semesters.push(col);
    else break; // stop at first missing semester
  }
  return semesters;
}

function detectField(headers: string[], ...keywords: string[]): string {
  return (
    headers.find((h) =>
      keywords.some((k) => h.trim().toLowerCase() === k.toLowerCase())
    ) ||
    headers.find((h) =>
      keywords.some((k) => h.trim().toLowerCase().includes(k.toLowerCase()))
    ) ||
    ""
  );
}

function getStatusKey(val: string): string {
  const match = val?.trim().match(/^(\d+)[.\s]/);
  return match ? match[1] : "";
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

function exportCSV(rows: Record<string, string>[], headers: string[], filename: string) {
  const csvRows = [headers.join(",")];
  rows.forEach((row) => {
    csvRows.push(headers.map((h) => `"${(row[h] || "").replace(/"/g, '""')}"`).join(","));
  });
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Drill-down modal ─────────────────────────────────────────────────────────

function DrillDownModal({
  open,
  onClose,
  statusKey,
  rows,
  uniField,
  codeField,
  cityField,
  deliveryField,
  logoField,
  linkField,
}: {
  open: boolean;
  onClose: () => void;
  statusKey: string;
  rows: Record<string, string>[];
  uniField: string;
  codeField: string;
  cityField: string;
  deliveryField: string;
  logoField: string;
  linkField: string;
}) {
  const [search, setSearch] = useState("");
  const cfg = STATUS_CONFIG[statusKey];

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      Object.values(r).some((v) => v.toLowerCase().includes(q))
    );
  }, [rows, search]);

  if (!cfg) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        <div className={`bg-gradient-to-r ${cfg.gradient} px-6 py-5`}>
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold flex items-start gap-2 leading-snug">
              <cfg.icon className="w-5 h-5 mt-0.5 shrink-0" />
              {cfg.label}
            </DialogTitle>
            <p className="text-white/70 text-sm mt-1">{rows.length} {rows.length === 1 ? "University" : "Universities"}</p>
          </DialogHeader>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/60" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search universities..."
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/20 text-white placeholder-white/60 text-sm border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
              data-testid="input-detail-search"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No matching universities</p>
            </div>
          ) : (
            filtered.map((row, i) => {
              const name = row[uniField] || "—";
              const code = row[codeField] || "";
              const city = row[cityField] || "";
              const delivery = row[deliveryField] || "";
              const logo = row[logoField] || "";
              const link = row[linkField] || "";
              const initial = name.charAt(0).toUpperCase();

              return (
                <div key={i} className="flex items-center gap-4 px-6 py-4 hover:bg-muted/40 transition-colors" data-testid={`modal-row-${i}`}>
                  {logo ? (
                    <img
                      src={logo}
                      alt={name}
                      className="h-10 w-10 rounded-full object-contain bg-white border border-border shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className={`h-10 w-10 rounded-full ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0`}>
                      <span className={`text-sm font-bold ${cfg.color}`}>{initial}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{name}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      {code && <span className="text-xs text-muted-foreground">Code: {code}</span>}
                      {city && <span className="text-xs text-muted-foreground">{city}</span>}
                      {delivery && <span className="text-xs text-muted-foreground">{delivery}</span>}
                    </div>
                  </div>
                  {link && /^https?:\/\//.test(link.trim()) && (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 shrink-0 transition-colors"
                    >
                      <LinkIcon className="w-3 h-3" /> Sheet
                    </a>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pivot dashboard for one batch ───────────────────────────────────────────

function BatchDashboard({ tabName, config }: { tabName: string; config: any }) {
  const [activeSem, setActiveSem] = useState(0); // index into semCols
  const [openStatusKey, setOpenStatusKey] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isRefetching, dataUpdatedAt } = useQuery({
    queryKey: ["sheetData", config.sheetId, tabName, config.useServerConfig],
    queryFn: () => fetchSheetData(config, tabName),
    refetchInterval: 60 * 1000,
    staleTime: 0,
    gcTime: 0,
  });

  const headers: string[] = useMemo(() => data?.headers ?? [], [data]);

  // Detect semester BOS status columns
  const semCols = useMemo(() => detectSemesterColumns(headers), [headers]);

  // Detect field columns
  const uniField = useMemo(() => detectField(headers, "University"), [headers]);
  const codeField = useMemo(() => detectField(headers, "Code"), [headers]);
  const cityField = useMemo(() => detectField(headers, "City"), [headers]);
  const deliveryField = useMemo(() => detectField(headers, "Delivery"), [headers]);
  const logoField = useMemo(() => detectField(headers, "logo URL", "Logo URL", "logo"), [headers]);
  const linkField = useMemo(() => detectField(headers, "Sheet Link"), [headers]);

  // Reset semester selection when tab changes
  useEffect(() => { setActiveSem(0); }, [tabName]);

  // Clamp activeSem if semCols changes
  const semIndex = Math.min(activeSem, Math.max(0, semCols.length - 1));
  const activeCol = semCols[semIndex] ?? "";

  // Group universities by status for active semester column
  const { grouped, total } = useMemo(() => {
    if (!data || !activeCol) return { grouped: {} as Record<string, Record<string, string>[]>, total: 0 };
    const rows = (data.data as Record<string, string>[]).filter(
      (r) => r[uniField]?.trim()
    );
    const grouped: Record<string, Record<string, string>[]> = {};
    rows.forEach((row) => {
      const key = getStatusKey(row[activeCol] || "");
      if (key === "") return; // skip blank / unrecognised
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    });
    const total = Object.values(grouped).reduce((s, a) => s + a.length, 0);
    return { grouped, total };
  }, [data, activeCol, uniField]);

  const activeStatuses = useMemo(
    () => (["0","1","2","3","4","5","6","7"] as const).filter((k) => (grouped[k]?.length ?? 0) > 0),
    [grouped]
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-24 rounded-xl" />)}
        </div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error Loading Data</AlertTitle>
        <AlertDescription>{(error as Error)?.message || "Failed to fetch sheet data."}</AlertDescription>
      </Alert>
    );
  }

  if (semCols.length === 0) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p className="font-semibold">No BOS Status columns found</p>
        <p className="text-sm mt-1">Check that the sheet has columns like "Sem 1 BOS Status".</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Semester selector */}
      {semCols.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {semCols.map((col, i) => (
            <button
              key={col}
              onClick={() => setActiveSem(i)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                semIndex === i
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
              data-testid={`tab-semester-${i + 1}`}
            >
              Semester {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Summary header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-3xl font-bold text-foreground">{total}</p>
            <p className="text-sm text-muted-foreground">Total Universities</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline" size="sm"
            onClick={() => exportCSV(
              data.data as Record<string, string>[],
              headers,
              `${tabName.replace(/[' ]/g, "_")}_${format(new Date(), "yyyy-MM-dd")}.csv`
            )}
            className="gap-2 rounded-xl"
            data-testid="button-export"
          >
            <FileDown className="w-3.5 h-3.5" /> Export
          </Button>
          <Button
            size="sm" onClick={() => refetch()} disabled={isRefetching}
            className="gap-2 rounded-xl"
            data-testid="button-refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            {isRefetching ? "Syncing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Section label */}
      <div>
        <h2 className="text-xl font-bold text-foreground tracking-tight">NIAT BOS Approval Status</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {semCols.length > 1 ? `Semester ${semIndex + 1} · ` : ""}
          Click any card to view universities
        </p>
      </div>

      {/* Status cards */}
      {activeStatuses.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Building2 className="w-10 h-10 mx-auto mb-2 opacity-20" />
          <p className="font-semibold">No status data yet</p>
          <p className="text-sm mt-1">The selected semester column appears to be empty.</p>
        </div>
      ) : (
        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {activeStatuses.map((key) => {
            const cfg = STATUS_CONFIG[key];
            const count = grouped[key]?.length ?? 0;
            const Icon = cfg.icon;
            return (
              <button
                key={key}
                onClick={() => setOpenStatusKey(key)}
                className="text-left focus:outline-none group cursor-pointer"
                data-testid={`card-status-${key}`}
              >
                <Card className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 rounded-2xl group-hover:scale-[1.02] group-active:scale-[0.98]">
                  <div className={`absolute inset-0 bg-gradient-to-br ${cfg.gradient}`} />
                  <CardContent className="relative pt-5 pb-5 px-5 text-white">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                          <Icon className="h-5 w-5 text-white" />
                        </div>
                        <span className="text-white/50 text-xs font-bold uppercase tracking-wider">Stage {key}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/60 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                    </div>
                    <p className="text-4xl font-bold">{count}</p>
                    <p className="text-white/90 text-sm font-semibold mt-1 leading-snug">{cfg.label}</p>
                    <p className="text-white/60 text-xs mt-2">{count === 1 ? "1 University" : `${count} Universities`}</p>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      {/* Sync info */}
      {dataUpdatedAt > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Last synced: {format(new Date(dataUpdatedAt), "MMM d, yyyy 'at' h:mm a")} · auto-refreshes every 60 s
        </p>
      )}

      {/* Drill-down modal */}
      {openStatusKey && (
        <DrillDownModal
          open={!!openStatusKey}
          onClose={() => setOpenStatusKey(null)}
          statusKey={openStatusKey}
          rows={grouped[openStatusKey] ?? []}
          uniField={uniField}
          codeField={codeField}
          cityField={cityField}
          deliveryField={deliveryField}
          logoField={logoField}
          linkField={linkField}
        />
      )}
    </div>
  );
}

// ─── Batch selector ───────────────────────────────────────────────────────────

function BatchSelector({
  batches,
  activeBatch,
  onSelect,
}: {
  batches: typeof BATCHES;
  activeBatch: number;
  onSelect: (i: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const latest = batches[0];
  const older = batches.slice(1);
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
            {!isLatest ? batches[activeBatch].label : "Previous Batches"}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
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

// ─── Root page ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const config = loadConfig();
  const [activeBatch, setActiveBatch] = useState(0); // index into BATCHES

  if (!config) {
    setLocation("/");
    return null;
  }

  const currentBatch = BATCHES[activeBatch];

  return (
    <Layout>
      <div className="space-y-8">
        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h1
                className="text-2xl md:text-3xl font-bold tracking-tight text-foreground"
                data-testid="text-report-title"
              >
                {config.spreadsheetTitle || "University BOS Dashboard"}
              </h1>
              <div className="md:hidden">
                <LogoutButton />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-1">BOS status tracking across NIAT cohorts</p>
          </div>

          <div className="flex items-end gap-4">
            <BatchSelector
              batches={BATCHES}
              activeBatch={activeBatch}
              onSelect={setActiveBatch}
            />
            <div className="hidden md:block">
              <LogoutButton />
            </div>
          </div>
        </div>

        {/* Dashboard body */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500" key={currentBatch.tabName}>
          <BatchDashboard tabName={currentBatch.tabName} config={config} />
        </div>
      </div>
    </Layout>
  );
}
