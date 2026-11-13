# TaskFlow

TaskFlow is a learning project for building a full-stack task manager with Next.js, TypeScript, MongoDB, and Better Auth.

## Run the dashboard

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Private task updates

Open dashboards refresh their task list every two seconds while visible and when
the tab becomes active. Refreshes use the authenticated, owner-scoped
`GET /api/tasks` endpoint, so each session receives only its own tasks. Updates
are near-real-time polling rather than WebSockets; this avoids requiring a
persistent custom server and works with standard Next.js Node or serverless
hosting. The dashboard shows the latest synchronization state and time, and
highlights changed tasks received by polling. The overview's Recent Activity
feed reads authenticated, owner-scoped records written by task mutation routes;
it starts empty and does not backfill actions from before activity tracking was
added. No specific deployment provider is configured in this project.

## Project structure

```text
src/
├── app/                  # App Router routes, shared layout, and global styles
│   ├── layout.tsx
│   ├── page.tsx          # Redirects / to /dashboard
│   ├── dashboard/
│   │   └── [[...section]]/page.tsx # Shared dashboard views and sidebar
│   ├── tasks/page.tsx    # Legacy route redirects
│   ├── upcoming/page.tsx
│   ├── completed/page.tsx
│   └── settings/page.tsx
│   └── globals.css       # Shared responsive styling
├── components/
│   └── tasks/
│       └── taskflow-dashboard.tsx
└── types/
    └── task.ts           # Shared task and form types
```

The project uses Next.js's `src/` directory. The route in `src/app/page.tsx` stays intentionally small and renders the task dashboard feature from `src/components/tasks/`. The task shape is shared from `src/types/`, so the UI and future API/model code can agree on the same status, priority, and category types. The `@/` TypeScript alias points to `src/`.

## Current milestone: dashboard UI

- The dashboard is a client component because its search, filters, status controls, and task form respond to user input.
- React state holds the demo task list. It is saved in `sessionStorage` so task edits survive navigation between dashboard pages and refreshes in the same browser tab. It is still local demo data and is not synced or backed up.
- Sidebar links use the App Router under `/dashboard` for Overview, My Tasks, Upcoming, Completed, and Settings. The shared optional catch-all route keeps the dashboard shell mounted while switching views. Upcoming separates overdue, due-today, and future tasks without changing sample due dates. The previous top-level routes redirect to their dashboard equivalents.
- Project shortcuts filter the task list by category. The profile menu links to workspace settings; it is a demo account, not an authenticated session.
- Task actions show success feedback; deleting asks for confirmation. Settings clearly marks account and sync features as coming soon.
- `src/app/globals.css` contains the responsive layout and component styles; the interface uses CSS and inline SVG icons, without additional UI dependencies.
- `src/app/layout.tsx` sets the shared document shell and page metadata.
- Environment files such as `.env.local` are ignored by Git. Add one only when a feature needs environment variables, and do not prefix server-only secrets with `NEXT_PUBLIC_`.

The sample tasks and any changes are demonstration data saved only for the current browser tab. Authentication and task ownership are not implemented yet.

## Planned milestones

1. Add `lib/` for the MongoDB connection when database access is implemented.
2. Add Better Auth registration, login, logout, and protected routes.
3. Add a Mongoose Task model and owner-scoped CRUD API.
4. Add `api/` route handlers and connect the dashboard to them as those features are built.
5. Add validation, error handling, tests, and deployment.
6. Add OpenAI task assistance after the core task flow is working.
