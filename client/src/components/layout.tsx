import { Link, useLocation } from "wouter";
import { LayoutDashboard, FileSpreadsheet, Settings, X, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { clearConfig } from "@/lib/sheets-api";
import { LogoutButton } from "@/components/LogoutButton";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleDisconnect = () => {
    clearConfig();
    setLocation("/");
  };

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [location]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  return (
    <div className="min-h-screen bg-background">
      {/* Hamburger button — fixed top-left */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shadow-sm border border-slate-200 dark:border-slate-700"
        aria-label="Open menu"
        data-testid="hamburger-menu"
      >
        <Menu className="w-5 h-5 text-slate-700 dark:text-slate-300" />
      </button>

      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[60] transition-opacity"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Slide-in drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-[70] w-72 max-w-[85vw] bg-slate-900 text-white shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col",
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <span className="text-lg font-bold tracking-tight">Menu</span>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Close menu"
            data-testid="drawer-close"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-4 space-y-1">
          <Link href="/dashboard">
            <button
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                location === "/dashboard"
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
              data-testid="nav-dashboard"
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </button>
          </Link>
          <Link href="/report">
            <button
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                location === "/report"
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
              data-testid="nav-report"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Full Report
            </button>
          </Link>
          <Link href="/settings">
            <button
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                location === "/settings"
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
              data-testid="nav-settings"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </Link>
        </nav>

        {/* User + Logout at bottom */}
        <div className="p-4 border-t border-slate-700">
          <LogoutButton />
        </div>
      </div>

      {/* Main content — full width */}
      <main className="flex-1">
        <div className="container mx-auto p-4 md:p-8 max-w-7xl pt-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
