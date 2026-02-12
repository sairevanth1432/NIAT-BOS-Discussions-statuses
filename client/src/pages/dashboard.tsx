import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { fetchSheetData, loadConfig, type SheetDataResponse } from "@/lib/sheets-api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Download, RefreshCw, TrendingUp, TrendingDown, DollarSign, Hash, BarChart3, Layers } from "lucide-react";
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

function StatCard({ title, value, subtext, icon: Icon }: { title: string; value: string; subtext: string; icon: any }) {
  return (
    <Card className="hover:shadow-md transition-shadow" data-testid={`stat-${title.replace(/\s/g, "-").toLowerCase()}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`value-${title.replace(/\s/g, "-").toLowerCase()}`}>{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
      </CardContent>
    </Card>
  );
}

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

    let barChartData: { name: string; value: number }[] = [];
    let barLabel = "";
    if (categoricalCols.length > 0 && numericCols.length > 0) {
      const catCol = categoricalCols[0].header;
      const numCol = numericCols[0].header;
      barLabel = `${numCol} by ${catCol}`;
      const grouped: Record<string, number> = {};
      reportData.data.forEach((row) => {
        const key = row[catCol] || "Unknown";
        grouped[key] = (grouped[key] || 0) + parseNumber(row[numCol]);
      });
      barChartData = Object.entries(grouped)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 12);
    }

    let pieChartData: { name: string; value: number }[] = [];
    let pieLabel = "";
    if (categoricalCols.length > 0) {
      const catCol = categoricalCols[0].header;
      pieLabel = catCol;
      const counts: Record<string, number> = {};
      reportData.data.forEach((row) => {
        const key = row[catCol] || "Unknown";
        counts[key] = (counts[key] || 0) + 1;
      });
      pieChartData = Object.entries(counts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
    }

    return { colTypes, numericCols, categoricalCols, stats, barChartData, barLabel, pieChartData, pieLabel };
  }, [reportData]);

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[400px] rounded-xl" />
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
        <Button onClick={() => refetch()} variant="outline" className="mt-4">
          Try Again
        </Button>
      </Layout>
    );
  }

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground" data-testid="text-report-title">{reportData.title}</h1>
            <p className="text-muted-foreground" data-testid="text-last-synced">
              Last synced: {format(new Date(reportData.lastUpdated), "PPpp")} &middot; {reportData.totalRows} rows
            </p>
          </div>
          <div className="flex gap-2">
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

        {/* Stats Grid - show up to 4 numeric column summaries */}
        {analysis && analysis.stats.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Rows"
              value={reportData.totalRows.toLocaleString()}
              subtext={`${reportData.headers.length} columns detected`}
              icon={Hash}
            />
            {analysis.stats.slice(0, 3).map((s) => (
              <StatCard
                key={s.header}
                title={`${s.header} (Total)`}
                value={s.sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                subtext={`Avg: ${s.avg.toLocaleString(undefined, { maximumFractionDigits: 2 })} | Range: ${s.min.toLocaleString()} - ${s.max.toLocaleString()}`}
                icon={DollarSign}
              />
            ))}
          </div>
        )}

        {/* Charts */}
        {analysis && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            {analysis.barChartData.length > 0 && (
              <Card className="col-span-4">
                <CardHeader>
                  <CardTitle>{analysis.barLabel}</CardTitle>
                  <CardDescription>Grouped totals for the first numeric column by category.</CardDescription>
                </CardHeader>
                <CardContent className="pl-2">
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analysis.barChartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
                        <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "8px",
                            border: "none",
                            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                            backgroundColor: "hsl(var(--card))",
                            color: "hsl(var(--foreground))",
                          }}
                        />
                        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {analysis.pieChartData.length > 0 && (
              <Card className={analysis.barChartData.length > 0 ? "col-span-3" : "col-span-4"}>
                <CardHeader>
                  <CardTitle>Distribution: {analysis.pieLabel}</CardTitle>
                  <CardDescription>Count of rows per category value.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={analysis.pieChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                          {analysis.pieChartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: "8px",
                            border: "none",
                            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                            backgroundColor: "hsl(var(--card))",
                            color: "hsl(var(--foreground))",
                          }}
                        />
                        <Legend verticalAlign="bottom" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Data Preview Table */}
        <Card>
          <CardHeader>
            <CardTitle>Data Preview</CardTitle>
            <CardDescription>Showing the first 10 rows from your sheet.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                  <tr>
                    {reportData.headers.map((h) => (
                      <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reportData.data.slice(0, 10).map((row, i) => (
                    <tr key={i} className="hover:bg-muted/50 transition-colors">
                      {reportData.headers.map((h) => (
                        <td key={h} className="px-4 py-3 whitespace-nowrap">
                          {row[h] || <span className="text-muted-foreground italic">-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-center">
              <Button variant="ghost" className="text-xs" asChild>
                <Link href="/report">View Full Report ({reportData.totalRows} rows)</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
