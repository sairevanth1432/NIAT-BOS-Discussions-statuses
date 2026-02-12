import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { fetchSheetData, loadConfig, validateSheet, saveConfig } from "@/lib/sheets-api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ArrowUpDown, ChevronLeft, ChevronRight, FileDown, FileSpreadsheet, RefreshCw } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";

function TabReport({ tabName, config }: { tabName: string; config: any }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterColumn, setFilterColumn] = useState<string>("_all");
  const [filterValue, setFilterValue] = useState<string>("all");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const { data: reportData, isLoading } = useQuery({
    queryKey: ["sheetData", config.sheetId, tabName, config.useServerConfig],
    queryFn: () => fetchSheetData(config, tabName),
    refetchInterval: 5 * 60 * 1000,
  });

  const categoricalColumns = useMemo(() => {
    if (!reportData) return [];
    return reportData.headers.filter((h) => {
      const unique = new Set(reportData.data.map((r) => r[h]).filter((v) => v));
      return unique.size > 1 && unique.size <= 20;
    });
  }, [reportData]);

  const filterOptions = useMemo(() => {
    if (!reportData || filterColumn === "_all") return [];
    return Array.from(new Set(reportData.data.map((r) => r[filterColumn]).filter((v) => v))).sort();
  }, [reportData, filterColumn]);

  const filteredData = useMemo(() => {
    if (!reportData) return [];
    let result = [...reportData.data];

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter((row) =>
        reportData.headers.some((h) => (row[h] || "").toLowerCase().includes(lower))
      );
    }

    if (filterColumn !== "_all" && filterValue !== "all") {
      result = result.filter((row) => row[filterColumn] === filterValue);
    }

    if (sortConfig) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key] || "";
        const bVal = b[sortConfig.key] || "";
        const aNum = Number(aVal.replace(/[$,%]/g, ""));
        const bNum = Number(bVal.replace(/[$,%]/g, ""));
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortConfig.direction === "asc" ? aNum - bNum : bNum - aNum;
        }
        return sortConfig.direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
    }

    return result;
  }, [reportData, searchTerm, filterColumn, filterValue, sortConfig]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
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
    a.download = `${tabName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading "{tabName}"...</div>;
  }

  if (!reportData || reportData.data.length === 0) {
    return (
      <div className="pt-8 text-center text-muted-foreground">
        <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="text-lg font-medium">No data in "{tabName}"</p>
        <p className="text-sm">This tab appears to be empty.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="gap-2" onClick={handleExportCSV} data-testid="button-export-csv">
          <FileDown className="w-3.5 h-3.5" />
          Export CSV
        </Button>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4 justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search across all columns..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                data-testid="input-search"
              />
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <Select value={filterColumn} onValueChange={(v) => { setFilterColumn(v); setFilterValue("all"); setCurrentPage(1); }}>
                <SelectTrigger className="w-[160px]" data-testid="select-filter-column">
                  <SelectValue placeholder="Filter by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">No Filter</SelectItem>
                  {categoricalColumns.map((col) => <SelectItem key={col} value={col}>{col}</SelectItem>)}
                </SelectContent>
              </Select>
              {filterColumn !== "_all" && (
                <Select value={filterValue} onValueChange={(v) => { setFilterValue(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[160px]" data-testid="select-filter-value">
                    <SelectValue placeholder="All values" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {filterOptions.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {reportData.headers.map((h) => (
                    <TableHead key={h} className="cursor-pointer hover:bg-muted/50 transition-colors whitespace-nowrap" onClick={() => handleSort(h)}>
                      <div className="flex items-center gap-1">
                        {h}
                        <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.length > 0 ? (
                  paginatedData.map((row, i) => (
                    <TableRow key={row._rowIndex || i}>
                      {reportData.headers.map((h) => (
                        <TableCell key={h} className="whitespace-nowrap max-w-[250px] truncate">
                          {row[h] || <span className="text-muted-foreground italic">-</span>}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={reportData.headers.length} className="h-24 text-center">No matching results.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between space-x-2 py-4">
            <div className="text-sm text-muted-foreground">
              Showing {filteredData.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to {Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length} entries
            </div>
            <div className="space-x-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ReportPage() {
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
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Full Data Report</h1>
          <p className="text-muted-foreground text-sm">
            Browse, search, filter, and export data from all sheet tabs.
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
                  >
                    {tab}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {tabs.map((tab) => (
              <TabsContent key={tab} value={tab} className="mt-0">
                <TabReport tabName={tab} config={config} />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <TabReport tabName={tabs[0]} config={config} />
        )}
      </div>
    </Layout>
  );
}
