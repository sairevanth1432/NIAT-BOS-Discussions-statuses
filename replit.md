# SheetSync - Automated Google Sheets Reports

## Overview

SheetSync is a full-stack web application that connects to Google Sheets via the Google Sheets API v4 and transforms spreadsheet data into professional, interactive dashboards and reports. Users provide a Google Sheet ID and API key, and the app validates the connection, fetches the data, and presents it with dynamically generated charts, summary statistics, filtering, sorting, search, and CSV export.

The app follows a full-stack TypeScript architecture with a React frontend and Express backend. Data is fetched live from Google Sheets on each request (no database required for core functionality).

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes
- 2026-02-26: Added Microsoft SSO authentication using @azure/msal-browser and @azure/msal-react
- 2026-02-11: Converted from design prototype to full-stack app with real Google Sheets API integration
- 2026-02-11: Backend API routes created for sheet validation and data fetching
- 2026-02-11: Frontend updated to use real API calls instead of mock data
- 2026-02-11: Dynamic column detection: charts and stats auto-generate based on data types
- 2026-02-11: CSV export functionality added

## System Architecture

### Frontend (client/)
- **Framework**: React 19 with TypeScript, bundled by Vite
- **Routing**: Wouter with 4 pages: Home (connection setup), Dashboard (charts/stats), Report (data table), Settings (preferences)
- **UI Components**: shadcn/ui built on Radix UI primitives with Tailwind CSS v4
- **Data Fetching**: TanStack React Query with 5-minute auto-refresh interval
- **Forms**: React Hook Form with Zod validation via @hookform/resolvers
- **Charts**: Recharts (BarChart, PieChart) for data visualization - dynamically generated based on detected column types
- **Styling**: Tailwind CSS with CSS variables for theming, Inter font for body text, JetBrains Mono for monospace
- **State**: Google Sheets config (sheetId, apiKey, sheetName) stored in localStorage via `client/src/lib/sheets-api.ts`

### Backend (server/)
- **Framework**: Express 5 on Node.js with TypeScript (run via tsx in dev)
- **API Routes** (server/routes.ts):
  - `POST /api/sheets/validate` - Validates a Google Sheet ID and API key, returns spreadsheet title and sheet tab names
  - `POST /api/sheets/data` - Fetches all data from a specified sheet tab, returns headers + data rows as dynamic key-value objects
- **Google Integration**: Uses `googleapis` npm package to access Google Sheets API v4
- **Input Validation**: Zod schemas validate all incoming request bodies
- **Development**: Vite dev server runs as middleware with HMR

### Key Design Decisions
1. **Client-side config storage**: Sheet credentials stored in localStorage, making the app stateless per-user without requiring authentication
2. **Dynamic column detection**: Dashboard automatically detects numeric vs categorical columns and generates appropriate charts/stats
3. **No database needed**: Core functionality is stateless - data comes directly from Google Sheets on each request
4. **Path aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`, `@assets/` maps to `attached_assets/`

### How to Connect a Google Sheet
1. Get a Google API Key from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Enable the Google Sheets API in the Google Cloud project
3. Make the spreadsheet viewable by "Anyone with the link"
4. Copy the Sheet ID from the URL (between `/d/` and `/edit`)
5. Enter both on the Home page and click "Connect Sheet"

## External Dependencies

### Services & APIs
- **Google Sheets API v4**: Core data source - requires user-provided API key and publicly shared spreadsheet
- **Microsoft Azure AD**: SSO authentication via MSAL - requires MICROSOFT_CLIENT_ID and MICROSOFT_TENANT_ID

### Authentication
- **Microsoft SSO**: Login/logout via @azure/msal-browser and @azure/msal-react
- Auth config fetched from server endpoint `GET /api/auth/config` (exposes clientId and tenantId)
- `client/src/lib/authConfig.ts`: MSAL configuration, fetches from server
- `client/src/lib/authContext.ts`: React context to track if auth is enabled
- `client/src/components/LoginPage.tsx`: Centered login page with Microsoft sign-in button
- `client/src/components/LogoutButton.tsx`: Shows user name + logout button in dashboard header
- When MICROSOFT_CLIENT_ID is not set, auth is bypassed and the app loads directly

### Key npm Packages
- **@azure/msal-browser** + **@azure/msal-react**: Microsoft SSO authentication
- **googleapis**: Official Google API client for accessing Sheets data server-side
- **express** (v5): HTTP server framework
- **@tanstack/react-query**: Async state management with auto-refetch
- **recharts**: Charting library for dashboard visualizations
- **react-hook-form** + **zod**: Form handling and validation
- **wouter**: Client-side routing
- **date-fns**: Date formatting utilities

### Environment Variables
- `NODE_ENV` - Set to "production" for production builds
- `MICROSOFT_CLIENT_ID` - Azure AD Application (client) ID for SSO
- `MICROSOFT_TENANT_ID` - Azure AD Tenant ID for SSO
- `GOOGLE_SHEETS_API_KEY` - Google API key for Sheets access
- `GOOGLE_SHEET_ID` - Default Google Sheet ID
