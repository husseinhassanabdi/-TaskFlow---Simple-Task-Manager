import Link from "next/link";
import { redirect } from "next/navigation";
import AdminNavigation from "@/components/admin/admin-navigation";
import { getAdminSession } from "@/lib/authorization";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const adminSession = await getAdminSession();
  if (!adminSession) {
    const session = await getSession();
    redirect(session ? "/dashboard" : "/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/admin" aria-label="TaskFlow Admin">
          <span className="brand-mark"><span aria-hidden="true">✓</span></span>
          <span>taskflow<span className="brand-period">.</span></span>
        </Link>
        <div className="workspace-switcher">
          <div className="workspace-avatar">A</div>
          <span className="workspace-copy"><strong>Administration</strong><small>Admin workspace</small></span>
        </div>
        <nav className="sidebar-nav admin-layout-nav" aria-label="Admin navigation">
          <AdminNavigation isAdmin variant="desktop" />
        </nav>
        <div className="sidebar-bottom">
          <Link className="nav-item admin-back-link" href="/dashboard"><span aria-hidden="true">←</span><span>Task workspace</span></Link>
        </div>
      </aside>
      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>Administration</span><span className="breadcrumb-slash">/</span><strong>Admin Dashboard</strong></div>
          <span className="admin-layout-user">{adminSession.user.name}</span>
        </header>
        <nav className="mobile-nav" aria-label="Admin navigation">
          <AdminNavigation isAdmin variant="mobile" />
          <Link className="mobile-nav-item" href="/dashboard">Task workspace</Link>
        </nav>
        <div className="dashboard-content admin-layout-content">{children}</div>
      </section>
    </div>
  );
}
