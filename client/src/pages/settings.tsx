import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Moon, Sun } from "lucide-react";
import { useState, useEffect } from "react";

function getTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("sheetsync_theme");
  if (stored === "dark") return "dark";
  return "light";
}

function applyTheme(theme: "light" | "dark") {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
  localStorage.setItem("sheetsync_theme", theme);
}

export default function SettingsPage() {
  const [isDark, setIsDark] = useState(getTheme() === "dark");

  useEffect(() => {
    applyTheme(isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    applyTheme(getTheme());
  }, []);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your preferences and application settings.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              Customize the look and feel of the application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isDark ? <Moon className="w-5 h-5 text-blue-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
                <div className="space-y-0.5">
                  <Label className="text-base">Dark Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    {isDark ? "Dark theme is active" : "Light theme is active"}
                  </p>
                </div>
              </div>
              <Switch
                checked={isDark}
                onCheckedChange={setIsDark}
                data-testid="switch-dark-mode"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data Sync</CardTitle>
            <CardDescription>
              Data automatically refreshes every 12 hours. You can also refresh manually from the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Auto-Refresh</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically fetch new data every 12 hours.
                </p>
              </div>
              <Switch defaultChecked data-testid="switch-auto-refresh" />
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
