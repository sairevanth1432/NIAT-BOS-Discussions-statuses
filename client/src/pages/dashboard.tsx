import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { fetchSheetData, loadConfig } from "@/lib/sheets-api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Download, RefreshCw, DollarSign, Hash, FileSpreadsheet, BarChart3, PieChartIcon, TableIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";
import { format } from "date-fns";
import { Link, useLocation } from "wouter";
import { useMemo } from "react";

function isNumeric(val: string): boolean {
  if (!val || val.trim() === "") return false;
  return !isNaN(Number(val.replace(/[$,%]/g, "")));
}

function parseNumber(val: string): number {
  return Number(val.replace(/[$,%]/g, "")) || 0;
}

function detectColumnTypes(headers: string[], data: Record<string, string>[]) {
  const sample = data.slice(0, 50);
  return headers.map((h) => {
    const values = sample.map((row) => row[h]).filter((v) => v && v.trim() !== "");
    const numericCount = values.filter(isNumeric).length;
    const isNumericCol = values.length > 0 && numericCount / values.length > 0.7;
    const uniqueValues = new Set(values);
    const isCategorical = !isNumericCol && uniqueValues.size <= 20 && uniqueValues.size > 1;
    return { header: h, isNumeric: isNumericCol, isCategorical, uniqueCount: uniqueValues.size };
  });
}

const STAT_ICONS = [Hash, DollarSign, BarChart3, FileSpreadsheet];
const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const config = loadConfig();

  if (!config) {
    setLocation("/");
    return null;
  }

  const { data: reportData, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["sheetData", config.sheetId, config.sheetName, config.useServerConfig],
    queryFn: () => fetchSheetData(config),
    refetchInterval: 5 * 60 * 1000,
  });

  const analysis = useMemo(() => {
    if (!reportData || reportData.data.length === 0) return null;

    const colTypes = detectColumnTypes(reportData.headers, reportData.data);
    const numericCols = colTypes.filter((c) => c.isNumeric);
    const categoricalCols = colTypes.filter((c) => c.isCategorical);

    const stats = numericCols.map((col) => {
      const values = reportData.data.map((row) => parseNumber(row[col.header])).filter((v) => !isNaN(v));
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = values.length > 0 ? sum / values.length : 0;
      const min = values.length > 0 ? Math.min(...values) : 0;
      const max = values.length > 0 ? Math.max(...values) : 0;
      return { header: col.header, sum, avg, min, max, count: values.length };
    });

    const barCharts: { data: { name: string; value: number }[]; label: string }[] = [];
    if (categoricalCols.length > 0 && numericCols.length > 0) {
      const usedCatCols = categoricalCols.slice(0, 2);
      const numCol = numericCols[0].header;

      usedCatCols.forEach((catCol) => {
        const grouped: Record<string, number> = {};
        reportData.data.forEach((row) => {
          const key = row[catCol.header] || "Unknown";
          grouped[key] = (grouped[key] || 0) + parseNumber(row[numCol]);
        });
        barCharts.push({
          label: `${numCol} by ${catCol.header}`,
          data: Object.entries(grouped)
            .map(([name, value]) => ({ name: name.length > 18 ? name.slice(0, 16) + "…" : name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10),
        });
      });
    }

    const pieCharts: { data: { name: string; value: number }[]; label: string }[] = [];
    if (categoricalCols.length > 0) {
      categoricalCols.slice(0, 2).forEach((catCol) => {
        const counts: Record<string, number> = {};
        reportData.data.forEach((row) => {
          const key = row[catCol.header] || "Unknown";
          counts[key] = (counts[key] || 0) + 1;
        });
        pieCharts.push({
          label: catCol.header,
          data: Object.entries(counts)
            .map(([name, value]) => ({ name: name.length > 20 ? name.slice(0, 18) + "…" : name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8),
        });
      });
    }

    return { colTypes, numericCols, categoricalCols, stats, barCharts, pieCharts };
  }, [reportData]);

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            <Skeleton className="h-[380px] rounded-xl" />
            <Skeleton className="h-[380px] rounded-xl" />
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !reportData) {
    return (
      <Layout>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Data</AlertTitle>
          <AlertDescription>{(error as Error)?.message || "Failed to fetch data from Google Sheets."}</AlertDescription>
        </Alert>
        <Button onClick={() => refetch()} variant="outline" className="mt-4">Try Again</Button>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground truncate" data-testid="text-report-title">
              {reportData.title}
            </h1>
            <p className="text-sm text-muted-foreground mt-1" data-testid="text-last-synced">
              Last synced: {format(new Date(reportData.lastUpdated), "PPpp")} &middot; {reportData.totalRows} rows &middot; {reportData.headers.length} columns
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={() => window.print()} className="hidden md:flex gap-2" data-testid="button-export-pdf">
              <Download className="w-4 h-4" />
              Print / PDF
            </Button>
            <Button onClick={() => refetch()} disabled={isRefetching} className="gap-2" data-testid="button-refresh">
              <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
              {isRefetching ? "Syncing..." : "Refresh"}
            </Button>
          </div>
        </div>

        {/* Stat Cards */}
        {analysis && analysis.stats.length > 0 && (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-card border-blue-100 dark:border-blue-900/40">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Rows</CardTitle>
                <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                  <TableIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reportData.totalRows.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">{reportData.headers.length} columns detected</p>
              </CardContent>
            </Card>

            {analysis.stats.slice(0, 3).map((s, i) => {
              const gradients = [
                "from-emerald-50 to-white dark:from-emerald-950/30 dark:to-card border-emerald-100 dark:border-emerald-900/40",
                "from-amber-50 to-white dark:from-amber-950/30 dark:to-card border-amber-100 dark:border-amber-900/40",
                "from-purple-50 to-white dark:from-purple-950/30 dark:to-card border-purple-100 dark:border-purple-900/40",
              ];
              const iconBgs = [
                "bg-emerald-100 dark:bg-emerald-900/50",
                "bg-amber-100 dark:bg-amber-900/50",
                "bg-purple-100 dark:bg-purple-900/50",
              ];
              const iconColors = [
                "text-emerald-600 dark:text-emerald-400",
                "text-amber-600 dark:text-amber-400",
                "text-purple-600 dark:text-purple-400",
              ];
              const Icon = STAT_ICONS[(i + 1) % STAT_ICONS.length];
              return (
                <Card key={s.header} className={`bg-gradient-to-br ${gradients[i]}`}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground truncate pr-2">{s.header}</CardTitle>
                    <div className={`h-8 w-8 rounded-lg ${iconBgs[i]} flex items-center justify-center shrink-0`}>
                      <Icon className={`h-4 w-4 ${iconColors[i]}`} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{s.sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Avg: {s.avg.toLocaleString(undefined, { maximumFractionDigits: 2 })} &middot; Min: {s.min.toLocaleString()} &middot; Max: {s.max.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Charts Section */}
        {analysis && (analysis.barCharts.length > 0 || analysis.pieCharts.length > 0) && (
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            {/* Bar Charts */}
            {analysis.barCharts.map((chart, idx) => (
              <Card key={`bar-${idx}`} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <BarChart3 className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{chart.label}</CardTitle>
                      <CardDescription className="text-xs">Grouped totals by category</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-2 pb-4">
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chart.data} margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                        <XAxis
                          dataKey="name"
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          angle={-35}
                          textAnchor="end"
                          height={60}
                          interval={0}
                        />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={50} />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "10px",
                            border: "1px solid hsl(var(--border))",
                            boxShadow: "0 8px 24px rgb(0 0 0 / 0.12)",
                            backgroundColor: "hsl(var(--card))",
                            color: "hsl(var(--foreground))",
                            fontSize: "13px",
                          }}
                          cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                        />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {chart.data.map((_, i) => (
                            <Cell key={`bar-cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Pie Charts */}
            {analysis.pieCharts.map((chart, idx) => (
              <Card key={`pie-${idx}`} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <PieChartIcon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">Distribution: {chart.label}</CardTitle>
                      <CardDescription className="text-xs">Row count per category</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-2 pb-4">
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chart.data}
                          cx="50%"
                          cy="45%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={4}
                          dataKey="value"
                          strokeWidth={2}
                          stroke="hsl(var(--card))"
                        >
                          {chart.data.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: "10px",
                            border: "1px solid hsl(var(--border))",
                            boxShadow: "0 8px 24px rgb(0 0 0 / 0.12)",
                            backgroundColor: "hsl(var(--card))",
                            color: "hsl(var(--foreground))",
                            fontSize: "13px",
                          }}
                        />
                        <Legend
                          verticalAlign="bottom"
                          iconType="circle"
                          iconSize={8}
                          wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Data Preview Table */}
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <TableIcon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Data Preview</CardTitle>
                <CardDescription className="text-xs">First 10 rows from your sheet</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/40 border-y border-border">
                  <tr>
                    {reportData.headers.map((h) => (
                      <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reportData.data.slice(0, 10).map((row, i) => (
                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                      {reportData.headers.map((h) => (
                        <td key={h} className="px-4 py-3 whitespace-nowrap max-w-[200px] truncate">
                          {row[h] || <span className="text-muted-foreground italic">-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 flex justify-center border-t border-border">
              <Button variant="ghost" size="sm" className="text-xs gap-1.5" asChild>
                <Link href="/report">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  View Full Report ({reportData.totalRows} rows)
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
