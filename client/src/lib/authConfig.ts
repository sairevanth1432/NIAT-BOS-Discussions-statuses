import { Configuration, LogLevel } from "@azure/msal-browser";

let msalConfig: Configuration | null = null;

export async function getMsalConfig(): Promise<Configuration> {
  if (msalConfig) return msalConfig;

  const res = await fetch("/api/auth/config");
  const data = await res.json();

  msalConfig = {
    auth: {
      clientId: data.clientId,
      authority: `https://login.microsoftonline.com/${data.tenantId}`,
      redirectUri: window.location.origin,
      postLogoutRedirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: "sessionStorage",
      storeAuthStateInCookie: false,
    },
    system: {
      loggerOptions: {
        logLevel: LogLevel.Warning,
        loggerCallback: () => {},
      },
    },
  };

  return msalConfig;
}

export const loginRequest = {
  scopes: ["User.Read"],
};
