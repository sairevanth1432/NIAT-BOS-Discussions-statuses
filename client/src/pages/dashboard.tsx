import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { fetchSheetData, loadConfig, validateSheet, saveConfig } from "@/lib/sheets-api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertCircle, RefreshCw, Building2, CheckCircle2, Clock, AlertTriangle,
  FileSpreadsheet, Search, FileDown, XCircle, Loader2, CalendarDays,
  MessageSquare, ListTodo, Link as LinkIcon, Info, X, ChevronRight, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { useMemo, useState, useEffect, useRef } from "react";

const DASHBOARD_TABS = ["Statuses NIAT'24", "Statuses NIAT'25", "Statuses NIAT'26"];

const STATUS_CONFIG: Record<string, {
  label: string;
  color: string;
  bg: string;
  bgSolid: string;
  border: string;
  dotColor: string;
  textOnBg: string;
  icon: any;
  category: string;
}> = {
  "0": { label: "Awaiting Update", color: "text-slate-700 dark:text-slate-300", bg: "bg-slate-50 dark:bg-slate-800/50", bgSolid: "bg-slate-100 dark:bg-slate-800", border: "border-slate-200 dark:border-slate-700", dotColor: "bg-slate-400", textOnBg: "text-slate-600 dark:text-slate-300", icon: Clock, category: "pending" },
  "1": { label: "Blocked", color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/30", bgSolid: "bg-red-100 dark:bg-red-900/50", border: "border-red-200 dark:border-red-800", dotColor: "bg-red-500", textOnBg: "text-red-700 dark:text-red-300", icon: XCircle, category: "pending" },
  "2": { label: "Under Review", color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/30", bgSolid: "bg-blue-100 dark:bg-blue-900/50", border: "border-blue-200 dark:border-blue-800", dotColor: "bg-blue-500", textOnBg: "text-blue-700 dark:text-blue-300", icon: AlertTriangle, category: "under_review" },
  "3": { label: "In Discussion", color: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-900/30", bgSolid: "bg-yellow-100 dark:bg-yellow-900/50", border: "border-yellow-200 dark:border-yellow-800", dotColor: "bg-yellow-500", textOnBg: "text-yellow-700 dark:text-yellow-300", icon: MessageSquare, category: "in_discussion" },
  "4": { label: "CSS Approved", color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/30", bgSolid: "bg-blue-100 dark:bg-blue-900/50", border: "border-blue-200 dark:border-blue-800", dotColor: "bg-blue-500", textOnBg: "text-blue-700 dark:text-blue-300", icon: CheckCircle2, category: "under_review" },
  "5": { label: "Awaiting BOS", color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-900/30", bgSolid: "bg-orange-100 dark:bg-orange-900/50", border: "border-orange-200 dark:border-orange-800", dotColor: "bg-orange-500", textOnBg: "text-orange-700 dark:text-orange-300", icon: Clock, category: "under_review" },
  "6": { label: "Approved", color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30", bgSolid: "bg-emerald-100 dark:bg-emerald-900/50", border: "border-emerald-200 dark:border-emerald-800", dotColor: "bg-emerald-500", textOnBg: "text-emerald-700 dark:text-emerald-300", icon: CheckCircle2, category: "approved" },
  "7": { label: "No Intervention", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30", bgSolid: "bg-emerald-100 dark:bg-emerald-900/50", border: "border-emerald-200 dark:border-emerald-800", dotColor: "bg-emerald-400", textOnBg: "text-emerald-600 dark:text-emerald-300", icon: CheckCircle2, category: "approved" },
};

const CATEGORY_CONFIG: Record<string, {
  label: string;
  gradient: string;
  icon: any;
  accent: string;
}> = {
  approved: { label: "Approved", gradient: "from-emerald-500 to-emerald-600", icon: CheckCircle2, accent: "ring-emerald-400" },
  in_discussion: { label: "In Discussion", gradient: "from-yellow-500 to-amber-500", icon: MessageSquare, accent: "ring-yellow-400" },
  pending: { label: "Pending", gradient: "from-red-500 to-rose-600", icon: Clock, accent: "ring-red-400" },
  under_review: { label: "Under Review", gradient: "from-blue-500 to-blue-600", icon: FileSpreadsheet, accent: "ring-blue-400" },
};

function getStatusKey(statusStr: string): string {
  const match = statusStr?.match(/^(\d+)\./);
  return match ? match[1] : "0";
}

function getStatusConfig(statusStr: string) {
  const key = getStatusKey(statusStr);
  return STATUS_CONFIG[key] || STATUS_CONFIG["0"];
}

function isLinkValue(value: string): boolean {
  return /^https?:\/\//.test(value?.trim());
}

function getFieldIcon(colName: string) {
  const lower = colName.toLowerCase();
  if (lower.includes("meeting") || lower.includes("status")) return MessageSquare;
  if (lower.includes("action") || lower.includes("delivery")) return ListTodo;
  if (lower.includes("timeline") || lower.includes("date")) return CalendarDays;
  if (lower.includes("link") || lower.includes("url")) return LinkIcon;
  if (lower.includes("city") || lower.includes("type") || lower.includes("university")) return Building2;
  return Info;
}

const PRIMARY_FIELDS = ["Code", "Last meeting Status", "Upcoming Action Items", "Sheet Link"];

function getRowStatus(row: Record<string, string>, statusFields: string[]): { key: string; label: string } {
  if (statusFields.length === 1) {
    return { key: getStatusKey(row[statusFields[0]] || ""), label: row[statusFields[0]] || "" };
  }
  let worstKey = "7";
  let worstVal = "";
  for (const field of statusFields) {
    const key = getStatusKey(row[field] || "");
    if (Number(key) < Number(worstKey)) {
      worstKey = key;
      worstVal = row[field] || "";
    }
  }
  return { key: worstKey, label: worstVal };
}

function UniversityCard({
  row,
  index,
  statusFields,
  universityField,
  allHeaders,
}: {
  row: Record<string, string>;
  index: number;
  statusFields: string[];
  universityField: string;
  allHeaders: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const { key: statusKey } = getRowStatus(row, statusFields);
  const cfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG["0"];

  const sheetLink = row["Sheet Link"] || "";
  const hasSheetLink = isLinkValue(sheetLink);

  const extraColumns = allHeaders.filter(
    c => c !== universityField && c !== "_rowIndex"
  );

  return (
    <Card
      className={`border-l-4 ${cfg.border} shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300`}
      style={{ animationDelay: `${index * 30}ms` }}
      data-testid={`detail-card-${index}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`h-9 w-9 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
              <Building2 className={`h-4 w-4 ${cfg.color}`} />
            </div>
            <div>
              <h4 className="font-semibold text-foreground">{row[universityField]}</h4>
              {row["Code"] && (
                <p className="text-xs text-muted-foreground font-medium">Code: {row["Code"]}</p>
              )}
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color} ${cfg.bg} border ${cfg.border} shrink-0`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
            {cfg.label}
          </span>
        </div>

        <div className="space-y-3">
          {row["Last meeting Status"] && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <MessageSquare className="w-3 h-3" />
                Last Meeting Status
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{row["Last meeting Status"]}</p>
            </div>
          )}

          {row["Upcoming Action Items"] && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <ListTodo className="w-3 h-3" />
                Upcoming Action Items
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{row["Upcoming Action Items"]}</p>
            </div>
          )}

          {hasSheetLink && (
            <a
              href={sheetLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors border border-blue-200 dark:border-blue-800"
              data-testid={`link-sheet-${index}`}
            >
              <LinkIcon className="w-3.5 h-3.5" />
              Open Sheet Link
            </a>
          )}
        </div>

        {extraColumns.some(col => row[col]?.trim()) && (
          <div className="mt-3 pt-3 border-t border-border">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              data-testid={`button-more-details-${index}`}
            >
              <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
              {expanded ? "Hide Details" : "More Details"}
            </button>

            {expanded && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 animate-in fade-in slide-in-from-top-2 duration-300">
                {extraColumns.map((col, idx) => {
                  const val = row[col] || "";
                  if (!val.trim()) return null;
                  const isLink = isLinkValue(val);
                  const FieldIcon = getFieldIcon(col);
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        <FieldIcon className="w-3 h-3" />
                        {col}
                      </div>
                      {isLink ? (
                        <a href={val} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                          <LinkIcon className="w-3 h-3" /> Open Link
                        </a>
                      ) : (
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{val}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DetailModal({
  open,
  onClose,
  categoryKey,
  rows,
  allHeaders,
  statusFields,
  universityField,
}: {
  open: boolean;
  onClose: () => void;
  categoryKey: string;
  rows: Record<string, string>[];
  allHeaders: string[];
  statusFields: string[];
  universityField: string;
}) {
  const [detailSearch, setDetailSearch] = useState("");
  const catCfg = CATEGORY_CONFIG[categoryKey];

  const filtered = useMemo(() => {
    if (!detailSearch) return rows;
    const lower = detailSearch.toLowerCase();
    return rows.filter(row =>
      allHeaders.some(col => (row[col] || "").toLowerCase().includes(lower))
    );
  }, [rows, detailSearch, allHeaders]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        <div className={`bg-gradient-to-r ${catCfg?.gradient || "from-slate-500 to-slate-600"} px-6 py-5`}>
          <DialogHeader>
            <DialogTitle className="text-white text-xl font-bold flex items-center gap-2">
              {catCfg && <catCfg.icon className="w-5 h-5" />}
              {catCfg?.label || categoryKey} — {rows.length} {rows.length === 1 ? "University" : "Universities"}
            </DialogTitle>
          </DialogHeader>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/60" />
            <input
              placeholder="Search within results..."
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/20 text-white placeholder-white/60 text-sm border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
              value={detailSearch}
              onChange={(e) => setDetailSearch(e.target.value)}
              data-testid="input-detail-search"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No matching universities</p>
            </div>
          ) : (
            filtered.map((row, i) => (
              <UniversityCard
                key={i}
                row={row}
                index={i}
                statusFields={statusFields}
                universityField={universityField}
                allHeaders={allHeaders}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusDashboard({ tabName, config }: { tabName: string; config: any }) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const { data: reportData, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["sheetData", config.sheetId, tabName, config.useServerConfig],
    queryFn: () => fetchSheetData(config, tabName),
    refetchInterval: 12 * 60 * 60 * 1000,
    staleTime: 0,
    gcTime: 0,
  });

  const allHeaders = useMemo(() => {
    if (!reportData || !reportData.headers) return [];
    return reportData.headers;
  }, [reportData]);

  const statusFields = useMemo(() => {
    const hasBosStatus = allHeaders.find((h: string) => h.toLowerCase() === "bos status");
    if (hasBosStatus) return [hasBosStatus];

    const semesterBosStatusCols = allHeaders.filter((h: string) => {
      const lower = h.toLowerCase();
      return lower.includes("semester") && lower.includes("bos") && lower.includes("status");
    });
    if (semesterBosStatusCols.length > 0) return semesterBosStatusCols;

    const semesterAlignmentCols = allHeaders.filter((h: string) => {
      const lower = h.toLowerCase();
      return lower.includes("sem") && lower.includes("alignment");
    });
    const alignmentHasStatusValues = semesterAlignmentCols.length > 0 &&
      reportData?.data?.some((r: any) =>
        semesterAlignmentCols.some(col => /^\d+\./.test(r[col] || ""))
      );
    if (alignmentHasStatusValues) return semesterAlignmentCols;

    const fallback = allHeaders.find((h: string) => h.toLowerCase().includes("status"));
    return fallback ? [fallback] : ["BOS Status"];
  }, [allHeaders, reportData]);

  const universityField = useMemo(() => {
    const found = allHeaders.find((h: string) => h.toLowerCase() === "university");
    return found || allHeaders[0] || "University";
  }, [allHeaders]);

  const analysis = useMemo(() => {
    if (!reportData || reportData.data.length === 0) return null;

    const rows = reportData.data.filter((r: any) => r[universityField]?.trim());
    const total = rows.length;
    const categoryRows: Record<string, Record<string, string>[]> = {
      approved: [], in_discussion: [], pending: [], under_review: [],
    };
    const statusCounts: Record<string, number> = {};

    rows.forEach((row: any) => {
      const key = getRowStatus(row, statusFields).key;
      statusCounts[key] = (statusCounts[key] || 0) + 1;
      const cfg = STATUS_CONFIG[key] || STATUS_CONFIG["0"];
      if (categoryRows[cfg.category]) {
        categoryRows[cfg.category].push(row);
      }
    });

    return { rows, total, categoryRows, statusCounts };
  }, [reportData, universityField, statusFields]);

  const handleExportCSV = () => {
    if (!analysis || !allHeaders.length) return;
    const csvRows = [allHeaders.join(",")];
    analysis.rows.forEach((row: any) => {
      csvRows.push(allHeaders.map((h: string) => `"${(row[h] || "").replace(/"/g, '""')}"`).join(","));
    });
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tabName.replace(/'/g, "")}_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-8 pt-4">
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[140px] rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (error || !reportData) {
    return (
      <div className="pt-4 space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Data</AlertTitle>
          <AlertDescription>{(error as Error)?.message || "Failed to fetch data."}</AlertDescription>
        </Alert>
        <Button onClick={() => refetch()} variant="outline">Try Again</Button>
      </div>
    );
  }

  if (!analysis || analysis.total === 0) {
    return (
      <div className="pt-16 text-center text-muted-foreground">
        <FileSpreadsheet className="w-16 h-16 mx-auto mb-4 opacity-20" />
        <p className="text-xl font-semibold">No Data Yet</p>
        <p className="text-sm mt-2">"{tabName}" doesn't have any university records yet.</p>
      </div>
    );
  }

  const categoryOrder = ["approved", "in_discussion", "pending", "under_review"];

  return (
    <div className="space-y-8">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-3xl font-bold text-foreground">{analysis.total}</p>
              <p className="text-sm text-muted-foreground">Total Universities</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2 rounded-xl" data-testid="button-export">
            <FileDown className="w-3.5 h-3.5" /> Export
          </Button>
          <Button size="sm" onClick={() => refetch()} disabled={isRefetching} className="gap-2 rounded-xl" data-testid="button-refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            {isRefetching ? "Syncing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Section Heading */}
      <div>
        <h2 className="text-xl font-bold text-foreground tracking-tight">NIAT Curriculum Status</h2>
        <p className="text-sm text-muted-foreground mt-1">Click any card to view university details</p>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {categoryOrder.map((catKey) => {
          const catCfg = CATEGORY_CONFIG[catKey];
          const count = analysis.categoryRows[catKey]?.length || 0;
          const Icon = catCfg.icon;
          const statement = `${count} ${count === 1 ? "University" : "Universities"} ${catCfg.label}`;

          return (
            <button
              key={catKey}
              onClick={() => count > 0 && setExpandedCategory(catKey)}
              className={`text-left focus:outline-none group ${count === 0 ? "opacity-50 cursor-default" : "cursor-pointer"}`}
              disabled={count === 0}
              data-testid={`card-${catKey}`}
            >
              <Card className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 h-full rounded-2xl group-hover:scale-[1.02] group-active:scale-[0.98]">
                <div className={`absolute inset-0 bg-gradient-to-br ${catCfg.gradient}`} />
                <CardContent className="relative pt-6 pb-5 px-6 text-white">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-11 w-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    {count > 0 && (
                      <ChevronRight className="w-4 h-4 text-white/60 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                    )}
                  </div>
                  <p className="text-4xl font-bold">{count}</p>
                  <p className="text-white/90 text-sm font-medium mt-1">{catCfg.label}</p>
                  <p className="text-white/60 text-xs mt-2">{statement}</p>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {/* Sync Info */}
      <p className="text-xs text-muted-foreground text-center">
        Last synced: {format(new Date(reportData.lastUpdated), "MMM d, yyyy 'at' h:mm a")}
      </p>

      {/* Detail Modal */}
      {expandedCategory && (
        <DetailModal
          open={!!expandedCategory}
          onClose={() => setExpandedCategory(null)}
          categoryKey={expandedCategory}
          rows={analysis.categoryRows[expandedCategory] || []}
          allHeaders={allHeaders}
          statusFields={statusFields}
          universityField={universityField}
        />
      )}
    </div>
  );
}

function YearSelector({
  tabs,
  activeTab,
  onSelect,
  yearFromTab,
}: {
  tabs: string[];
  activeTab: string;
  onSelect: (tab: string) => void;
  yearFromTab: (tab: string) => string;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const latestTab = tabs[tabs.length - 1];
  const olderTabs = tabs.slice(0, -1);
  const isLatestActive = activeTab === latestTab;

  return (
    <div className="flex items-center gap-2" ref={dropdownRef}>
      <button
        onClick={() => onSelect(latestTab)}
        className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
          isLatestActive
            ? "bg-primary text-primary-foreground shadow-md"
            : "bg-muted text-muted-foreground hover:bg-muted/80"
        }`}
        data-testid="tab-2026"
      >
        {yearFromTab(latestTab)}
      </button>

      {olderTabs.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              !isLatestActive
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            data-testid="dropdown-older-years"
          >
            {!isLatestActive ? yearFromTab(activeTab) : "Previous Years"}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1.5 bg-popover border border-border rounded-xl shadow-lg py-1 min-w-[120px] z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              {olderTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    onSelect(tab);
                    setDropdownOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    activeTab === tab
                      ? "bg-accent text-accent-foreground font-semibold"
                      : "text-foreground hover:bg-accent/50"
                  }`}
                  data-testid={`dropdown-item-${yearFromTab(tab)}`}
                >
                  {yearFromTab(tab)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const config = loadConfig();
  const [tabs, setTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("");
  const [title, setTitle] = useState(config?.spreadsheetTitle || "University BOS Dashboard");

  useEffect(() => {
    if (!config) return;
    validateSheet(config).then((result) => {
      if (result.valid && result.sheetNames) {
        config.sheetNames = result.sheetNames;
        config.spreadsheetTitle = result.title;
        saveConfig(config);
        setTitle(result.title || "University BOS Dashboard");
        const filtered = result.sheetNames.filter((t: string) => DASHBOARD_TABS.includes(t));
        const finalTabs = filtered.length > 0 ? filtered : DASHBOARD_TABS;
        setTabs(finalTabs);
        setActiveTab(finalTabs[finalTabs.length - 1]);
      } else {
        setTabs(DASHBOARD_TABS);
        setActiveTab(DASHBOARD_TABS[DASHBOARD_TABS.length - 1]);
      }
    }).catch(() => {
      setTabs(DASHBOARD_TABS);
      setActiveTab(DASHBOARD_TABS[DASHBOARD_TABS.length - 1]);
    });
  }, []);

  if (!config) {
    setLocation("/");
    return null;
  }

  if (tabs.length === 0) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  const yearFromTab = (tab: string) => {
    const match = tab.match(/'(\d{2})$/);
    return match ? `20${match[1]}` : tab;
  };

  return (
    <Layout>
      <div className="space-y-8">
        {/* Dashboard Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground" data-testid="text-report-title">
              {title}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              BOS status tracking across NIAT cohorts
            </p>
          </div>

          {/* Year Selector - 2026 prominent, others in dropdown */}
          <YearSelector
            tabs={tabs}
            activeTab={activeTab}
            onSelect={setActiveTab}
            yearFromTab={yearFromTab}
          />
        </div>

        {/* Active Tab Content */}
        {tabs.map((tab) => (
          activeTab === tab ? (
            <div key={tab} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <StatusDashboard tabName={tab} config={config} />
            </div>
          ) : null
        ))}
      </div>
    </Layout>
  );
}
