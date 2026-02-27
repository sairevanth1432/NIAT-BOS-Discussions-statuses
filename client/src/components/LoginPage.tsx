import { useMsal } from "@azure/msal-react";
import { loginRequest } from "@/lib/authConfig";

export function LoginPage() {
  const { instance } = useMsal();

  const handleLogin = () => {
    const isIframe = window !== window.parent;
    if (isIframe) {
      instance.loginPopup(loginRequest);
    } else {
      instance.loginRedirect(loginRequest);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#0f172a" }}
      data-testid="login-page"
    >
      <div className="text-center space-y-8 px-6">
        <div className="space-y-3">
          <h1
            className="text-4xl font-bold tracking-tight text-white"
            data-testid="text-login-heading"
          >
            NIAT Curriculum Status
          </h1>
          <p
            className="text-slate-400 text-lg"
            data-testid="text-login-subtext"
          >
            Sign in with your Microsoft account to continue
          </p>
        </div>

        <button
          onClick={handleLogin}
          className="inline-flex items-center gap-3 px-8 py-3.5 rounded-lg text-white font-medium text-base transition-all duration-200 hover:brightness-110 active:scale-[0.98] shadow-lg"
          style={{ background: "#2563eb" }}
          data-testid="button-login-microsoft"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 21 21"
          >
            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
          </svg>
          Sign in with Microsoft
        </button>
      </div>
    </div>
  );
}
