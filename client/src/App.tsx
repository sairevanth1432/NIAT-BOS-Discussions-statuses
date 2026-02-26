import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import ReportPage from "@/pages/report";
import SettingsPage from "@/pages/settings";
import { PublicClientApplication, EventType } from "@azure/msal-browser";
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate } from "@azure/msal-react";
import { LoginPage } from "@/components/LoginPage";
import { getMsalConfig } from "@/lib/authConfig";
import { useState, useEffect } from "react";
import { AuthEnabledContext } from "@/lib/authContext";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/report" component={ReportPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function MsalWrapper() {
  const [msalInstance, setMsalInstance] = useState<PublicClientApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [authDisabled, setAuthDisabled] = useState(false);

  useEffect(() => {
    getMsalConfig()
      .then(async (config) => {
        if (!config.auth.clientId) {
          setAuthDisabled(true);
          setLoading(false);
          return;
        }
        const pca = new PublicClientApplication(config);
        await pca.initialize();
        const accounts = pca.getAllAccounts();
        if (accounts.length > 0) {
          pca.setActiveAccount(accounts[0]);
        }
        pca.addEventCallback((event) => {
          if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
            const payload = event.payload as any;
            if (payload.account) {
              pca.setActiveAccount(payload.account);
            }
          }
        });
        setMsalInstance(pca);
        setLoading(false);
      })
      .catch(() => {
        setAuthDisabled(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f172a" }}>
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  if (authDisabled) {
    return (
      <AuthEnabledContext.Provider value={false}>
        <AuthenticatedApp />
      </AuthEnabledContext.Provider>
    );
  }

  return (
    <AuthEnabledContext.Provider value={true}>
      <MsalProvider instance={msalInstance!}>
        <AuthenticatedTemplate>
          <AuthenticatedApp />
        </AuthenticatedTemplate>
        <UnauthenticatedTemplate>
          <LoginPage />
        </UnauthenticatedTemplate>
      </MsalProvider>
    </AuthEnabledContext.Provider>
  );
}

function App() {
  return <MsalWrapper />;
}

export default App;
