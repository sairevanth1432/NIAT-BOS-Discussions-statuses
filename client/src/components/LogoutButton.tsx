import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { LogOut } from "lucide-react";
import { useAuthEnabled } from "@/lib/authContext";

function LogoutButtonInner() {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const account = accounts[0];

  if (!isAuthenticated || !account) return null;

  const handleLogout = () => {
    instance.logoutRedirect();
  };

  return (
    <div className="flex items-center gap-3" data-testid="logout-section">
      <span
        className="text-sm text-muted-foreground hidden sm:inline"
        data-testid="text-user-displayname"
      >
        {account.name || account.username}
      </span>
      <button
        onClick={handleLogout}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        data-testid="button-logout"
      >
        <LogOut className="w-4 h-4" />
        Logout
      </button>
    </div>
  );
}

export function LogoutButton() {
  const authEnabled = useAuthEnabled();
  if (!authEnabled) return null;
  return <LogoutButtonInner />;
}
