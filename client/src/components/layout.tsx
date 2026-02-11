import { Link, useLocation } from "wouter";
import { LayoutDashboard, FileSpreadsheet, Settings, LogOut, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { clearConfig } from "@/lib/sheets-api";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const handleDisconnect = () => {
    clearConfig();
    setLocation("/");
  };

  const NavContent = () => (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2 font-bold text-xl text-primary">
          <FileSpreadsheet className="w-6 h-6" />
          <span>SheetSync</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Live Google Sheets Reports</p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        <Link href="/dashboard">
          <Button
            variant={location === "/dashboard" ? "secondary" : "ghost"}
            className="w-full justify-start gap-3"
            data-testid="nav-dashboard"
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Button>
        </Link>
        <Link href="/report">
          <Button
            variant={location === "/report" ? "secondary" : "ghost"}
            className="w-full justify-start gap-3"
            data-testid="nav-report"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Full Report
          </Button>
        </Link>
        <Link href="/settings">
          <Button
            variant={location === "/settings" ? "secondary" : "ghost"}
            className="w-full justify-start gap-3"
            data-testid="nav-settings"
          >
            <Settings className="w-4 h-4" />
            Settings
          </Button>
        </Link>
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <Button
          variant="outline"
          className="w-full gap-2 text-destructive hover:text-destructive"
          onClick={handleDisconnect}
          data-testid="button-disconnect"
        >
          <LogOut className="w-4 h-4" />
          Disconnect Sheet
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:block w-64 fixed inset-y-0 z-50">
        <NavContent />
      </aside>

      <div className="md:hidden fixed top-0 left-0 right-0 h-16 border-b bg-background z-40 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-lg text-primary">
          <FileSpreadsheet className="w-5 h-5" />
          <span>SheetSync</span>
        </div>
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64">
            <NavContent />
          </SheetContent>
        </Sheet>
      </div>

      <main className={cn("flex-1 transition-all duration-300 ease-in-out", "md:pl-64", "pt-16 md:pt-0")}>
        <div className="container mx-auto p-4 md:p-8 max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
