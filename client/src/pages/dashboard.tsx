import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { MockSheetService, SheetRow } from "@/lib/mock-sheets";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Download, RefreshCw, Calendar, TrendingUp, TrendingDown, DollarSign, Users, Package, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { format } from "date-fns";
import { Link } from "wouter";

// Reusable Stats Card
function StatCard({ title, value, subtext, icon: Icon, trend }: { title: string, value: string, subtext: string, icon: any, trend?: 'up' | 'down' | 'neutral' }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center text-xs text-muted-foreground mt-1">
          {trend === 'up' && <TrendingUp className="w-3 h-3 mr-1 text-emerald-500" />}
          {trend === 'down' && <TrendingDown className="w-3 h-3 mr-1 text-rose-500" />}
          <span className={trend === 'up' ? "text-emerald-500 font-medium" : trend === 'down' ? "text-rose-500 font-medium" : ""}>
            {subtext}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const sheetId = localStorage.getItem("connectedSheetId") || "demo";

  const { data: reportData, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['sheetData', sheetId],
    queryFn: () => MockSheetService.fetchSheetData(sheetId),
  });

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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Skeleton className="col-span-4 h-[400px] rounded-xl" />
            <Skeleton className="col-span-3 h-[400px] rounded-xl" />
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
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load report data. Please check your connection and try again.
          </AlertDescription>
        </Alert>
        <Button onClick={() => refetch()} variant="outline" className="mt-4">Try Again</Button>
      </Layout>
    );
  }

  // --- Data Processing for Charts ---
  
  // 1. Total Revenue
  const totalRevenue = reportData.data.reduce((sum, row) => sum + row.revenue, 0);
  
  // 2. Units Sold
  const totalUnits = reportData.data.reduce((sum, row) => sum + row.units_sold, 0);
  
  // 3. Status Counts
  const completedOrders = reportData.data.filter(r => r.status === "Completed").length;
  
  // 4. Revenue by Category
  const categoryData = reportData.data.reduce((acc, row) => {
    acc[row.category] = (acc[row.category] || 0) + row.revenue;
    return acc;
  }, {} as Record<string, number>);
  
  const pieChartData = Object.entries(categoryData).map(([name, value]) => ({ name, value }));

  // 5. Daily Revenue Trend (Last 14 entries for simplicity, or grouped by date)
  const dateMap = reportData.data.reduce((acc, row) => {
    acc[row.date] = (acc[row.date] || 0) + row.revenue;
    return acc;
  }, {} as Record<string, number>);
  
  const lineChartData = Object.entries(dateMap)
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .slice(-30) // Last 30 days
    .map(([date, amount]) => ({
      date: format(new Date(date), "MMM d"),
      amount
    }));

  // Colors for charts
  const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{reportData.title}</h1>
            <p className="text-muted-foreground">
              Last synced: {format(new Date(reportData.lastUpdated), "PPpp")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()} className="hidden md:flex gap-2">
              <Download className="w-4 h-4" />
              Export PDF
            </Button>
            <Button onClick={() => refetch()} disabled={isRefetching} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
              {isRefetching ? "Syncing..." : "Refresh Data"}
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard 
            title="Total Revenue" 
            value={`$${totalRevenue.toLocaleString()}`} 
            subtext="+12.5% from last month" 
            icon={DollarSign}
            trend="up"
          />
          <StatCard 
            title="Units Sold" 
            value={totalUnits.toLocaleString()} 
            subtext="+4.1% from last month" 
            icon={Package}
            trend="up"
          />
          <StatCard 
            title="Completed Orders" 
            value={completedOrders.toLocaleString()} 
            subtext="92% fulfillment rate" 
            icon={CheckCircle2}
            trend="neutral"
          />
          <StatCard 
            title="Active Customers" 
            value="1,203" 
            subtext="+201 new this week" 
            icon={Users}
            trend="up"
          />
        </div>

        {/* Main Charts Area */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          
          {/* Revenue Trend Line Chart */}
          <Card className="col-span-4">
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
              <CardDescription>Daily revenue performance over the last 30 days.</CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lineChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      stroke="#888888" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      minTickGap={30}
                    />
                    <YAxis 
                      stroke="#888888" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(value) => `$${value}`} 
                    />
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '8px', 
                        border: 'none', 
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        backgroundColor: 'hsl(var(--card))',
                        color: 'hsl(var(--foreground))'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="amount" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={3} 
                      dot={false} 
                      activeDot={{ r: 6 }} 
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Category Distribution Pie Chart */}
          <Card className="col-span-3">
            <CardHeader>
              <CardTitle>Sales by Category</CardTitle>
              <CardDescription>Revenue distribution across product categories.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => `$${value.toLocaleString()}`}
                      contentStyle={{ 
                        borderRadius: '8px', 
                        border: 'none', 
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        backgroundColor: 'hsl(var(--card))',
                        color: 'hsl(var(--foreground))'
                      }}
                    />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Transactions / Data Table Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>Latest entries from your connected sheet.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium text-right">Revenue</th>
                    <th className="px-4 py-3 font-medium text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reportData.data.slice(0, 5).map((row) => (
                    <tr key={row.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">{row.date}</td>
                      <td className="px-4 py-3 font-mono text-xs">{row.id}</td>
                      <td className="px-4 py-3 font-medium">{row.product}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                          {row.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">${row.revenue.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
                          row.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800' :
                          row.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800' :
                          'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-center">
              <Button variant="ghost" className="text-xs" asChild>
                <Link href="/report">View Full Report</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
