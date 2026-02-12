import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { fetchSheetData, loadConfig, validateSheet, saveConfig } from "@/lib/sheets-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertCircle, RefreshCw, Building2, CheckCircle2, Clock, AlertTriangle,
  FileSpreadsheet, Search, ChevronLeft, ChevronRight, ExternalLink,
  CalendarDays, MapPin, Users, ArrowUpDown, FileDown, XCircle, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Link, useLocation } from "wouter";
import { useMemo, useState, useEffect } from "react";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: any; category: string }> = {
  "0": { label: "Awaiting Update", color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200", icon: Clock, category: "pending" },
  "1": { label: "Blocked", color: "text-red-700", bg: "bg-red-50", border: "border-red-200", icon: XCircle, category: "blocked" },
  "2": { label: "Under Review", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", icon: AlertTriangle, category: "in_progress" },
  "3": { label: "In Discussion", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", icon: Clock, category: "in_progress" },
  "4": { label: "CSS Approved", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", icon: CheckCircle2, category: "in_progress" },
  "5": { label: "Awaiting BOS Approval", color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", icon: Clock, category: "in_progress" },
  "6": { label: "BOS Approved", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", icon: CheckCircle2, category: "approved" },
  "7": { label: "No Intervention", color: "text-slate-500", bg: "bg-slate-50", border: "border-slate-200", icon: CheckCircle2, category: "approved" },
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
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color} ${cfg.bg} border ${cfg.border}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function BOSTrackerDashboard({ tabName, config }: { tabName: string; config: any }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const { data: reportData, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["sheetData", config.sheetId, tabName, config.useServerConfig],
    queryFn: () => fetchSheetData(config, tabName),
    refetchInterval: 5 * 60 * 1000,
  });

  const analysis = useMemo(() => {
    if (!reportData || reportData.data.length === 0) return null;

    const rows = reportData.data.filter(r => r["University"]?.trim());
    const total = rows.length;

    const statusCounts: Record<string, number> = {};
    const categoryCounts = { approved: 0, in_progress: 0, pending: 0, blocked: 0 };

    rows.forEach((row) => {
      const key = getStatusKey(row["BOS Status"] || "");
      statusCounts[key] = (statusCounts[key] || 0) + 1;
      const cfg = STATUS_CONFIG[key] || STATUS_CONFIG["0"];
      categoryCounts[cfg.category as keyof typeof categoryCounts] = (categoryCounts[cfg.category as keyof typeof categoryCounts] || 0) + 1;
    });

    const cities = new Set(rows.map(r => r["City"]).filter(c => c && c !== "—" && c.trim()));

    return { rows, total, statusCounts, categoryCounts, cities: cities.size };
  }, [reportData]);

  const filteredData = useMemo(() => {
    if (!analysis) return [];
    let result = [...analysis.rows];

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter((row) =>
        (row["University"] || "").toLowerCase().includes(lower) ||
        (row["Code"] || "").toLowerCase().includes(lower) ||
        (row["City"] || "").toLowerCase().includes(lower) ||
        (row["BOS Status"] || "").toLowerCase().includes(lower)
      );
    }

    if (statusFilter !== "all") {
      if (statusFilter === "approved") {
        result = result.filter(r => { const cfg = getStatusConfig(r["BOS Status"]); return cfg.category === "approved"; });
      } else if (statusFilter === "in_progress") {
        result = result.filter(r => { const cfg = getStatusConfig(r["BOS Status"]); return cfg.category === "in_progress"; });
      } else if (statusFilter === "pending") {
        result = result.filter(r => { const cfg = getStatusConfig(r["BOS Status"]); return cfg.category === "pending"; });
      } else if (statusFilter === "blocked") {
        result = result.filter(r => { const cfg = getStatusConfig(r["BOS Status"]); return cfg.category === "blocked"; });
      } else {
        result = result.filter(r => getStatusKey(r["BOS Status"]) === statusFilter);
      }
    }

    if (sortConfig) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key] || "";
        const bVal = b[sortConfig.key] || "";
        const cmp = aVal.localeCompare(bVal);
        return sortConfig.direction === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [analysis, searchTerm, statusFilter, sortConfig]);

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev?.key === key && prev.direction === "asc") return { key, direction: "desc" };
      return { key, direction: "asc" };
    });
    setCurrentPage(1);
  };

  const handleExportCSV = () => {
    if (!reportData) return;
    const exportHeaders = ["University", "Code", "City", "BOS Status", "Framework Preference", "Start Date", "Next Steps", "Timeline for BOS completion"];
    const csvRows = [exportHeaders.join(",")];
    filteredData.forEach((row) => {
      csvRows.push(exportHeaders.map((h) => `"${(row[h] || "").replace(/"/g, '""')}"`).join(","));
    });
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BOS_Tracker_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 pt-4">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[120px] rounded-xl" />)}
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

  if (!analysis) {
    return (
      <div className="pt-8 text-center text-muted-foreground">
        <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="text-lg font-medium">No data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <p className="text-sm text-muted-foreground" data-testid="text-last-synced">
          Last synced: {format(new Date(reportData.lastUpdated), "MMM d, yyyy 'at' h:mm a")}
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2" data-testid="button-export">
            <FileDown className="w-3.5 h-3.5" />
            Export
          </Button>
          <Button size="sm" onClick={() => refetch()} disabled={isRefetching} className="gap-2" data-testid="button-refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            {isRefetching ? "Syncing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => { setStatusFilter("all"); setCurrentPage(1); }}
          data-testid="card-total">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-blue-600" />
          <CardContent className="relative pt-6 pb-5 px-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium">Total Universities</p>
                <p className="text-4xl font-bold mt-1">{analysis.total}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-white" />
              </div>
            </div>
            <p className="text-blue-100 text-xs mt-3">{analysis.cities} cities covered</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => { setStatusFilter("approved"); setCurrentPage(1); }}
          data-testid="card-approved">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-emerald-600" />
          <CardContent className="relative pt-6 pb-5 px-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100 text-sm font-medium">Approved / Complete</p>
                <p className="text-4xl font-bold mt-1">{analysis.categoryCounts.approved}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-white" />
              </div>
            </div>
            <p className="text-emerald-100 text-xs mt-3">
              {analysis.total > 0 ? Math.round((analysis.categoryCounts.approved / analysis.total) * 100) : 0}% of total
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => { setStatusFilter("in_progress"); setCurrentPage(1); }}
          data-testid="card-in-progress">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-amber-600" />
          <CardContent className="relative pt-6 pb-5 px-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-amber-100 text-sm font-medium">In Progress</p>
                <p className="text-4xl font-bold mt-1">{analysis.categoryCounts.in_progress}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-white" />
              </div>
            </div>
            <p className="text-amber-100 text-xs mt-3">Under review or awaiting approval</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => { setStatusFilter("pending"); setCurrentPage(1); }}
          data-testid="card-pending">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-500 to-slate-600" />
          <CardContent className="relative pt-6 pb-5 px-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-200 text-sm font-medium">Pending / Awaiting</p>
                <p className="text-4xl font-bold mt-1">{analysis.categoryCounts.pending + analysis.categoryCounts.blocked}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
                <Clock className="h-6 w-6 text-white" />
              </div>
            </div>
            <p className="text-slate-200 text-xs mt-3">
              {analysis.categoryCounts.blocked > 0 && <span className="text-red-200 font-medium">{analysis.categoryCounts.blocked} blocked</span>}
              {analysis.categoryCounts.blocked > 0 && analysis.categoryCounts.pending > 0 && " · "}
              {analysis.categoryCounts.pending > 0 && `${analysis.categoryCounts.pending} awaiting update`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Status Breakdown */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Status Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(analysis.statusCounts)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([key, count]) => {
                const cfg = STATUS_CONFIG[key] || STATUS_CONFIG["0"];
                return (
                  <button
                    key={key}
                    onClick={() => { setStatusFilter(statusFilter === key ? "all" : key); setCurrentPage(1); }}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all
                      ${statusFilter === key ? `${cfg.bg} ${cfg.color} ${cfg.border} ring-2 ring-offset-1 ring-current` : `${cfg.bg} ${cfg.color} ${cfg.border} hover:shadow-sm`}`}
                    data-testid={`filter-status-${key}`}
                  >
                    {cfg.label}
                    <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold ${cfg.bg} ${cfg.color}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            {statusFilter !== "all" && (
              <button
                onClick={() => { setStatusFilter("all"); setCurrentPage(1); }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted border border-dashed border-border transition-all"
              >
                Clear filter
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* University Table */}
      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            <div>
              <CardTitle className="text-base font-semibold">
                University Details
                {statusFilter !== "all" && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({filteredData.length} {filteredData.length === 1 ? "result" : "results"})
                  </span>
                )}
              </CardTitle>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search universities..."
                className="pl-8 h-9"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                data-testid="input-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="cursor-pointer hover:text-foreground transition-colors w-[250px]" onClick={() => handleSort("University")}>
                    <div className="flex items-center gap-1 font-semibold text-xs uppercase tracking-wider">
                      University <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider w-[70px]">Code</TableHead>
                  <TableHead className="cursor-pointer hover:text-foreground transition-colors font-semibold text-xs uppercase tracking-wider" onClick={() => handleSort("City")}>
                    <div className="flex items-center gap-1">
                      City <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-foreground transition-colors font-semibold text-xs uppercase tracking-wider w-[200px]" onClick={() => handleSort("BOS Status")}>
                    <div className="flex items-center gap-1">
                      BOS Status <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider">Framework</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider">Timeline</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider">Next Steps</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.length > 0 ? (
                  paginatedData.map((row, i) => (
                    <TableRow key={row._rowIndex || i} className="group hover:bg-muted/30 transition-colors" data-testid={`row-university-${i}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Building2 className="h-4 w-4 text-primary" />
                          </div>
                          <span className="truncate max-w-[200px]" title={row["University"]}>
                            {row["University"]}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{row["Code"] || "—"}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          {row["City"] && row["City"] !== "—" && <MapPin className="w-3 h-3" />}
                          <span>{row["City"] || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row["BOS Status"] || ""} />
                      </TableCell>
                      <TableCell className="text-sm">{row["Framework Preference"] || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          {row["Timeline for BOS completion"] ? (
                            <>
                              <CalendarDays className="w-3 h-3" />
                              <span>{row["Timeline for BOS completion"]}</span>
                            </>
                          ) : "—"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <p className="text-sm text-muted-foreground truncate" title={row["Next Steps"]}>
                          {row["Next Steps"] || "—"}
                        </p>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No universities match your search or filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GenericTabDashboard({ tabName, config }: { tabName: string; config: any }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const { data: reportData, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["sheetData", config.sheetId, tabName, config.useServerConfig],
    queryFn: () => fetchSheetData(config, tabName),
    refetchInterval: 5 * 60 * 1000,
  });

  const filteredData = useMemo(() => {
    if (!reportData) return [];
    let result = reportData.data.filter(r => {
      const firstCol = reportData.headers[0];
      return firstCol ? r[firstCol]?.trim() : true;
    });

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter((row) =>
        reportData.headers.some((h) => (row[h] || "").toLowerCase().includes(lower))
      );
    }

    if (sortConfig) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key] || "";
        const bVal = b[sortConfig.key] || "";
        return sortConfig.direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
    }

    return result;
  }, [reportData, searchTerm, sortConfig]);

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev?.key === key && prev.direction === "asc") return { key, direction: "desc" };
      return { key, direction: "asc" };
    });
    setCurrentPage(1);
  };

  const handleExportCSV = () => {
    if (!reportData) return;
    const csvRows = [reportData.headers.join(",")];
    filteredData.forEach((row) => {
      csvRows.push(reportData.headers.map((h) => `"${(row[h] || "").replace(/"/g, '""')}"`).join(","));
    });
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tabName}_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (error || !reportData) {
    return (
      <div className="pt-4 space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{(error as Error)?.message || "Failed to load data."}</AlertDescription>
        </Alert>
        <Button onClick={() => refetch()} variant="outline">Retry</Button>
      </div>
    );
  }

  if (reportData.data.length === 0) {
    return (
      <div className="pt-8 text-center text-muted-foreground">
        <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="text-lg font-medium">No data in "{tabName}"</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <p className="text-sm text-muted-foreground">{filteredData.length} rows</p>
        <div className="flex gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." className="pl-8 h-9" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
          </div>
          <Button variant="outline" size="sm" className="gap-2 h-9" onClick={handleExportCSV}>
            <FileDown className="w-3.5 h-3.5" /> Export
          </Button>
          <Button size="sm" className="gap-2 h-9" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  {reportData.headers.map((h, idx) => (
                    <TableHead key={`${h}-${idx}`} className="cursor-pointer hover:text-foreground transition-colors whitespace-nowrap" onClick={() => handleSort(h)}>
                      <div className="flex items-center gap-1 font-semibold text-xs uppercase tracking-wider">
                        {h} <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((row, i) => (
                  <TableRow key={row._rowIndex || i} className="hover:bg-muted/30 transition-colors">
                    {reportData.headers.map((h, idx) => (
                      <TableCell key={`${h}-${idx}`} className="whitespace-nowrap max-w-[250px] truncate text-sm">
                        {row[h] || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-sm text-muted-foreground">
                {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
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
      setTabs(config.sheetNames);
      setActiveTab(config.sheetNames[0]);
    } else {
      validateSheet(config).then((result) => {
        if (result.valid && result.sheetNames) {
          config.sheetNames = result.sheetNames;
          config.spreadsheetTitle = result.title;
          saveConfig(config);
          setTabs(result.sheetNames);
          setActiveTab(result.sheetNames[0]);
        } else {
          const fallback = [config.sheetName || "Sheet1"];
          setTabs(fallback);
          setActiveTab(fallback[0]);
        }
      }).catch(() => {
        const fallback = [config.sheetName || "Sheet1"];
        setTabs(fallback);
        setActiveTab(fallback[0]);
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

  const renderTab = (tab: string) => {
    if (tab === "BOS Tracker") {
      return <BOSTrackerDashboard tabName={tab} config={config} />;
    }
    return <GenericTabDashboard tabName={tab} config={config} />;
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground" data-testid="text-report-title">
            {config.spreadsheetTitle || "Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time overview across {tabs.length} sheet{tabs.length !== 1 ? "s" : ""}
          </p>
        </div>

        {tabs.length > 1 ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
              <TabsList className="inline-flex h-auto gap-1 bg-muted/50 p-1 rounded-lg">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    className="px-4 py-2 text-sm whitespace-nowrap data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md"
                    data-testid={`tab-${tab.replace(/\s/g, "-").toLowerCase()}`}
                  >
                    {tab}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {tabs.map((tab) => (
              <TabsContent key={tab} value={tab} className="mt-4">
                {renderTab(tab)}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          renderTab(tabs[0])
        )}
      </div>
    </Layout>
  );
}
