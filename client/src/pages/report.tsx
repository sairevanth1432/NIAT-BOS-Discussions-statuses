import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { fetchSheetData, loadConfig } from "@/lib/sheets-api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ArrowUpDown, ChevronLeft, ChevronRight, FileDown } from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";

export default function ReportPage() {
  const [, setLocation] = useLocation();
  const config = loadConfig();

  if (!config) {
    setLocation("/");
    return null;
  }

  const [searchTerm, setSearchTerm] = useState("");
  const [filterColumn, setFilterColumn] = useState<string>("_all");
  const [filterValue, setFilterValue] = useState<string>("all");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const { data: reportData, isLoading } = useQuery({
    queryKey: ["sheetData", config.sheetId, config.sheetName, config.useServerConfig],
    queryFn: () => fetchSheetData(config),
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
    const unique = Array.from(new Set(reportData.data.map((r) => r[filterColumn]).filter((v) => v))).sort();
    return unique;
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
    a.download = `${reportData.title || "report"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="p-8 text-center text-muted-foreground">Loading data from Google Sheets...</div>
      </Layout>
    );
  }

  if (!reportData) {
    return (
      <Layout>
        <div className="p-8 text-center text-muted-foreground">No data available.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Full Data Report</h1>
            <p className="text-muted-foreground">
              {reportData.totalRows} rows &middot; {reportData.headers.length} columns
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={handleExportCSV} data-testid="button-export-csv">
            <FileDown className="w-4 h-4" />
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
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  data-testid="input-search"
                />
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <Select
                  value={filterColumn}
                  onValueChange={(v) => {
                    setFilterColumn(v);
                    setFilterValue("all");
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-[160px]" data-testid="select-filter-column">
                    <SelectValue placeholder="Filter by..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">No Filter</SelectItem>
                    {categoricalColumns.map((col) => (
                      <SelectItem key={col} value={col}>
                        {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {filterColumn !== "_all" && (
                  <Select value={filterValue} onValueChange={(v) => { setFilterValue(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[160px]" data-testid="select-filter-value">
                      <SelectValue placeholder="All values" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {filterOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
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
                      <TableHead
                        key={h}
                        className="cursor-pointer hover:bg-muted/50 transition-colors whitespace-nowrap"
                        onClick={() => handleSort(h)}
                      >
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
                          <TableCell key={h} className="whitespace-nowrap">
                            {row[h] || <span className="text-muted-foreground italic">-</span>}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={reportData.headers.length} className="h-24 text-center">
                        No matching results.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between space-x-2 py-4">
              <div className="text-sm text-muted-foreground">
                Showing {filteredData.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to{" "}
                {Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length} entries
              </div>
              <div className="space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  data-testid="button-next-page"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
