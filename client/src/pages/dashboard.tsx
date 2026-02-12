import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { fetchSheetData, loadConfig, validateSheet, saveConfig } from "@/lib/sheets-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  AlertCircle, RefreshCw, Building2, CheckCircle2, Clock, AlertTriangle,
  FileSpreadsheet, Search, FileDown, XCircle, Loader2, CalendarDays,
  MessageSquare, ListTodo, ArrowUpDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { useMemo, useState, useEffect } from "react";

const DASHBOARD_TABS = ["Statuses NIAT'24", "Statuses NIAT'25", "Statuses NIAT'26"];

const VISIBLE_COLUMNS = [
  "University",
  "BOS Status",
  "Last meeting Status",
  "Upcoming Action Items",
  "Timeline to Close - Action Items",
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; dotColor: string; icon: any; category: string }> = {
  "0": { label: "Awaiting Update", color: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200", dotColor: "bg-slate-400", icon: Clock, category: "pending" },
  "1": { label: "Blocked", color: "text-red-700", bg: "bg-red-50", border: "border-red-200", dotColor: "bg-red-500", icon: XCircle, category: "blocked" },
  "2": { label: "Under Review (Syllabi)", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", dotColor: "bg-amber-500", icon: AlertTriangle, category: "in_progress" },
  "3": { label: "In Discussion", color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200", dotColor: "bg-yellow-500", icon: Clock, category: "in_progress" },
  "4": { label: "CSS Approved", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", dotColor: "bg-blue-500", icon: CheckCircle2, category: "in_progress" },
  "5": { label: "Awaiting BOS Approval", color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", dotColor: "bg-orange-500", icon: Clock, category: "in_progress" },
  "6": { label: "BOS Approved", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dotColor: "bg-emerald-500", icon: CheckCircle2, category: "approved" },
  "7": { label: "No Intervention", color: "text-slate-500", bg: "bg-slate-50", border: "border-slate-200", dotColor: "bg-slate-400", icon: CheckCircle2, category: "approved" },
};

function getStatusKey(statusStr: string): string {
  const match = statusStr?.match(/^(\d+)\./);
  return match ? match[1] : "0";
}

function getStatusConfig(statusStr: string) {
  const key = getStatusKey(statusStr);
  return STATUS_CONFIG[key] || STATUS_CONFIG["0"];
}

function StatusBadge({ status }: { status: string }) {
  const cfg = getStatusConfig(status);
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color} ${cfg.bg} border ${cfg.border}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dotColor}`} />
      {cfg.label}
    </span>
  );
}

function NIATTabDashboard({ tabName, config }: { tabName: string; config: any }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

  const { data: reportData, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["sheetData", config.sheetId, tabName, config.useServerConfig],
    queryFn: () => fetchSheetData(config, tabName),
    refetchInterval: 5 * 60 * 1000,
  });

  const analysis = useMemo(() => {
    if (!reportData || reportData.data.length === 0) return null;

    const rows = reportData.data.filter(r => r["University"]?.trim());
    const total = rows.length;
    const categoryCounts = { approved: 0, in_progress: 0, pending: 0, blocked: 0 };
    const statusCounts: Record<string, number> = {};

    rows.forEach((row) => {
      const key = getStatusKey(row["BOS Status"] || "");
      statusCounts[key] = (statusCounts[key] || 0) + 1;
      const cfg = STATUS_CONFIG[key] || STATUS_CONFIG["0"];
      categoryCounts[cfg.category as keyof typeof categoryCounts] = (categoryCounts[cfg.category as keyof typeof categoryCounts] || 0) + 1;
    });

    return { rows, total, categoryCounts, statusCounts };
  }, [reportData]);

  const filteredData = useMemo(() => {
    if (!analysis) return [];
    let result = [...analysis.rows];

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter((row) =>
        VISIBLE_COLUMNS.some((col) => (row[col] || "").toLowerCase().includes(lower))
      );
    }

    if (statusFilter !== "all") {
      if (["approved", "in_progress", "pending", "blocked"].includes(statusFilter)) {
        result = result.filter(r => getStatusConfig(r["BOS Status"]).category === statusFilter);
      } else {
        result = result.filter(r => getStatusKey(r["BOS Status"]) === statusFilter);
      }
    }

    if (sortConfig) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key] || "";
        const bVal = b[sortConfig.key] || "";
        return sortConfig.direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
    }

    return result;
  }, [analysis, searchTerm, statusFilter, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev?.key === key && prev.direction === "asc") return { key, direction: "desc" };
      return { key, direction: "asc" };
    });
  };

  const handleExportCSV = () => {
    if (!filteredData.length) return;
    const csvRows = [VISIBLE_COLUMNS.join(",")];
    filteredData.forEach((row) => {
      csvRows.push(VISIBLE_COLUMNS.map((h) => `"${(row[h] || "").replace(/"/g, '""')}"`).join(","));
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
      <div className="space-y-6 pt-4">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[100px] rounded-xl" />)}
        </div>
        <Skeleton className="h-[400px] rounded-xl" />
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
      <div className="pt-12 text-center text-muted-foreground">
        <FileSpreadsheet className="w-14 h-14 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-semibold">No Data Yet</p>
        <p className="text-sm mt-1">"{tabName}" doesn't have any university records yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      {/* Sync + Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <p className="text-sm text-muted-foreground">
          Last synced: {format(new Date(reportData.lastUpdated), "MMM d, yyyy 'at' h:mm a")}
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2" data-testid="button-export">
            <FileDown className="w-3.5 h-3.5" /> Export CSV
          </Button>
          <Button size="sm" onClick={() => refetch()} disabled={isRefetching} className="gap-2" data-testid="button-refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            {isRefetching ? "Syncing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <button onClick={() => { setStatusFilter("all"); }} className="text-left focus:outline-none" data-testid="card-total">
          <Card className={`relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all h-full ${statusFilter === "all" ? "ring-2 ring-blue-400 ring-offset-2" : ""}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-blue-600" />
            <CardContent className="relative pt-5 pb-4 px-5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-xs font-medium uppercase tracking-wider">Total</p>
                  <p className="text-3xl font-bold mt-1">{analysis.total}</p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-white" />
                </div>
              </div>
              <p className="text-blue-100 text-xs mt-2">Universities</p>
            </CardContent>
          </Card>
        </button>

        <button onClick={() => { setStatusFilter(statusFilter === "approved" ? "all" : "approved"); }} className="text-left focus:outline-none" data-testid="card-approved">
          <Card className={`relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all h-full ${statusFilter === "approved" ? "ring-2 ring-emerald-400 ring-offset-2" : ""}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-emerald-600" />
            <CardContent className="relative pt-5 pb-4 px-5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-xs font-medium uppercase tracking-wider">Approved</p>
                  <p className="text-3xl font-bold mt-1">{analysis.categoryCounts.approved}</p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-white" />
                </div>
              </div>
              <p className="text-emerald-100 text-xs mt-2">{analysis.total > 0 ? Math.round((analysis.categoryCounts.approved / analysis.total) * 100) : 0}% complete</p>
            </CardContent>
          </Card>
        </button>

        <button onClick={() => { setStatusFilter(statusFilter === "in_progress" ? "all" : "in_progress"); }} className="text-left focus:outline-none" data-testid="card-in-progress">
          <Card className={`relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all h-full ${statusFilter === "in_progress" ? "ring-2 ring-amber-400 ring-offset-2" : ""}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-amber-600" />
            <CardContent className="relative pt-5 pb-4 px-5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-amber-100 text-xs font-medium uppercase tracking-wider">In Progress</p>
                  <p className="text-3xl font-bold mt-1">{analysis.categoryCounts.in_progress}</p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-white" />
                </div>
              </div>
              <p className="text-amber-100 text-xs mt-2">Under review / awaiting</p>
            </CardContent>
          </Card>
        </button>

        <button onClick={() => { setStatusFilter(statusFilter === "pending" ? "all" : "pending"); }} className="text-left focus:outline-none" data-testid="card-pending">
          <Card className={`relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all h-full ${statusFilter === "pending" ? "ring-2 ring-slate-400 ring-offset-2" : ""}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-slate-500 to-slate-600" />
            <CardContent className="relative pt-5 pb-4 px-5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-200 text-xs font-medium uppercase tracking-wider">Pending</p>
                  <p className="text-3xl font-bold mt-1">{analysis.categoryCounts.pending + analysis.categoryCounts.blocked}</p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-white" />
                </div>
              </div>
              <p className="text-slate-200 text-xs mt-2">
                {analysis.categoryCounts.blocked > 0 ? <span className="text-red-200">{analysis.categoryCounts.blocked} blocked</span> : "Awaiting update"}
              </p>
            </CardContent>
          </Card>
        </button>
      </div>

      {/* Status Breakdown Pills */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Filter by Status</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            {Object.entries(analysis.statusCounts)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([key, count]) => {
                const cfg = STATUS_CONFIG[key] || STATUS_CONFIG["0"];
                const isActive = statusFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(isActive ? "all" : key)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all
                      ${isActive ? `${cfg.bg} ${cfg.color} ${cfg.border} ring-2 ring-offset-1 ring-current shadow-sm` : `bg-white ${cfg.color} ${cfg.border} hover:${cfg.bg} hover:shadow-sm`}`}
                    data-testid={`filter-status-${key}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${cfg.dotColor}`} />
                    {cfg.label}
                    <span className="text-xs font-bold opacity-70">{count}</span>
                  </button>
                );
              })}
            {statusFilter !== "all" && (
              <button
                onClick={() => setStatusFilter("all")}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted border border-dashed border-border transition-all"
              >
                Clear filter
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative w-full md:w-80">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search universities, status, action items..."
          className="pl-9 h-9"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          data-testid="input-search"
        />
      </div>

      {/* Results count */}
      {(statusFilter !== "all" || searchTerm) && (
        <p className="text-sm text-muted-foreground">
          Showing {filteredData.length} of {analysis.total} universities
        </p>
      )}

      {/* University Cards - Full detail view */}
      {filteredData.length > 0 ? (
        <div className="space-y-4">
          {filteredData.map((row, i) => {
            const statusCfg = getStatusConfig(row["BOS Status"] || "");
            return (
              <Card key={row._rowIndex || i} className={`shadow-sm hover:shadow-md transition-shadow border-l-4 ${statusCfg.border}`} data-testid={`card-university-${i}`}>
                <CardContent className="p-5">
                  {/* University Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-10 w-10 rounded-xl ${statusCfg.bg} flex items-center justify-center shrink-0`}>
                        <Building2 className={`h-5 w-5 ${statusCfg.color}`} />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground leading-tight">
                        {row["University"]}
                      </h3>
                    </div>
                    <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
                      <StatusBadge status={row["BOS Status"] || ""} />
                      <p className="text-xs text-muted-foreground max-w-[300px] sm:text-right leading-snug">
                        {row["BOS Status"] || "No status"}
                      </p>
                    </div>
                  </div>

                  {/* Detail Grid */}
                  <div className="grid gap-4 md:grid-cols-3">
                    {/* Last Meeting Status */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <MessageSquare className="w-3.5 h-3.5" />
                        Last Meeting Status
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">
                        {row["Last meeting Status"] || <span className="text-muted-foreground italic">No updates yet</span>}
                      </p>
                    </div>

                    {/* Upcoming Action Items */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <ListTodo className="w-3.5 h-3.5" />
                        Upcoming Action Items
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">
                        {row["Upcoming Action Items"] || <span className="text-muted-foreground italic">No action items</span>}
                      </p>
                    </div>

                    {/* Timeline */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <CalendarDays className="w-3.5 h-3.5" />
                        Timeline to Close
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">
                        {row["Timeline to Close - Action Items"] ? (
                          <span className="font-medium">{row["Timeline to Close - Action Items"]}</span>
                        ) : (
                          <span className="text-muted-foreground italic">Not set</span>
                        )}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="shadow-sm">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No matching universities</p>
            <p className="text-sm mt-1">Try adjusting your search or filters.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const config = loadConfig();
  const [tabs, setTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("");

  useEffect(() => {
    if (!config) return;
    if (config.sheetNames && config.sheetNames.length > 0) {
      const filtered = config.sheetNames.filter(t => DASHBOARD_TABS.includes(t));
      const finalTabs = filtered.length > 0 ? filtered : DASHBOARD_TABS;
      setTabs(finalTabs);
      setActiveTab(finalTabs[finalTabs.length - 1]);
    } else {
      validateSheet(config).then((result) => {
        if (result.valid && result.sheetNames) {
          config.sheetNames = result.sheetNames;
          config.spreadsheetTitle = result.title;
          saveConfig(config);
          const filtered = result.sheetNames.filter(t => DASHBOARD_TABS.includes(t));
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
    }
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

  return (
    <Layout>
      <div className="space-y-6">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground" data-testid="text-report-title">
            {config.spreadsheetTitle || "University BOS Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            BOS status tracking across NIAT cohorts
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <TabsList className="inline-flex h-auto gap-1 bg-muted/50 p-1.5 rounded-xl">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="px-5 py-2.5 text-sm font-medium whitespace-nowrap data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg transition-all"
                  data-testid={`tab-${tab.replace(/['\s]/g, "-").toLowerCase()}`}
                >
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {tabs.map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-4">
              <NIATTabDashboard tabName={tab} config={config} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </Layout>
  );
}
