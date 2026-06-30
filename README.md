# CivicMind AI — AI-Powered Community Operating System

CivicMind AI is an AI-powered city governance platform built with an event-driven multi-agent routing, priority, and verification system. This is not a complaint portal, but rather a community operating system.

## Sprint 1 Completion — Project Scaffold & Auth Foundation

Sprint 1 implements the complete foundation for the CivicMind AI client:
- **Project Scaffolding**: React 18, Vite, TypeScript strict mode.
- **Design System Integration**: Chapter 13 color palette, typography scale, spacing, and animations configured in Tailwind.
- **Firebase Initialization**: Authentication (Google Workspace OAuth & Email), Firestore rules/indexes, and Storage rules.
- **Role-Based Guards**: Protected routing shells securing Citizen pages vs. Official dashboards.
- **Reusable Component Library**: Custom alerts, Severity badges, Trust badges, and page loading spinners.
- **Responsive Layout Shells**: Sidebar navigation for officials (collapsible) and bottom nav/FAB for citizens.

---

## Directory Structure

```
civicmind-frontend/
├── public/
├── src/
│   ├── main.tsx                    # Vite entry point
│   ├── App.tsx                     # Root router + query/auth providers
│   ├── config/
│   │   ├── firebase.ts             # Firebase initializers (Auth, DB, Storage)
│   │   └── constants.ts            # App constants, category taxonomy, SLAs
│   ├── types/
│   │   ├── user.types.ts           # User profiles, trust levels, roles
│   │   ├── issue.types.ts          # Issue documents, status fields
│   │   ├── agent.types.ts          # Agent result documents, pipeline states
│   │   ├── verification.types.ts   # Verification schema
│   │   └── geo.types.ts            # Location and ward details
│   ├── hooks/
│   │   ├── useAuth.ts              # Firebase observer syncing authStore
│   │   └── useRequireAuth.ts       # Auth redirect guard helper
│   ├── stores/
│   │   ├── authStore.ts            # Zustand auth state
│   │   ├── reportStore.ts          # Report submission draft state
│   │   ├── mapStore.ts             # Map viewport, layers & filters
│   │   └── notificationStore.ts    # In-app notifications list
│   ├── components/
│   │   ├── auth/
│   │   │   ├── AuthGuard.tsx       # Auth route wrapper
│   │   │   └── RoleGuard.tsx       # RBAC role wrapper
│   │   ├── layout/
│   │   │   ├── CitizenLayout.tsx   # Mobile-first Citizen wrapper
│   │   │   ├── OfficialLayout.tsx  # Desktop-first Official sidebar wrapper
│   │   │   ├── Header.tsx          # Shared brand topbar
│   │   │   ├── Sidebar.tsx         # Sidebar for officials
│   │   │   └── MobileNav.tsx       # Bottom navbar for citizens
│   │   └── ui/
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       ├── SeverityBadge.tsx
│   │       ├── TrustBadge.tsx
│   │       ├── LoadingSpinner.tsx
│   │       ├── ErrorBoundary.tsx
│   │       ├── EmptyState.tsx
│   │       └── PageLoader.tsx
│   ├── pages/
│   │   ├── auth/
│   │   │   ├── SignInPage.tsx
│   │   │   ├── SignUpPage.tsx
│   │   │   └── OnboardingPage.tsx
│   │   ├── citizen/
│   │   │   ├── HomePage.tsx
│   │   │   ├── ReportPage.tsx
│   │   │   ├── PipelineViewPage.tsx
│   │   │   ├── IssueDetailPage.tsx
│   │   │   ├── MapPage.tsx
│   │   │   └── CommunityPage.tsx
│   │   └── official/
│   │       ├── DashboardPage.tsx
│   │       ├── IssueQueuePage.tsx
│   │       ├── OfficialIssueDetailPage.tsx
│   │       ├── SituationRoomPage.tsx
│   │       ├── AnalyticsPage.tsx
│   │       └── ExecutiveReportPage.tsx
│   ├── utils/
│   │   ├── date.utils.ts
│   │   ├── priority.utils.ts
│   │   └── geo.utils.ts
│   └── index.css                   # Core styling sheet
```

---

## Installation & Startup

### Pre-requisites
Ensure Node.js v20+ is installed.

### Setup Environment
1. Navigate to the frontend directory:
   ```bash
   cd civicmind-frontend
   ```
2. Set up environment variables in `.env` (a local template has been generated for you with mock/placeholder credentials for compilers to run cleanly).

### Install Dependencies & Start
1. Install project packages:
   ```bash
   npm install
   ```
2. Start the local Vite development server:
   ```bash
   npm run dev
   ```
