"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type AdminNavigationProps = {
  isAdmin: boolean;
  variant: "desktop" | "mobile";
};

function NavigationIcon({ name }: { name: "overview" | "users" }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  if (name === "overview") {
    return <svg {...common}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>;
  }

  return <svg {...common}><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="10" cy="7.5" r="3.5" /><path d="M17 11a3 3 0 1 0 0-6m3 15v-1.5a3.5 3.5 0 0 0-2.5-3.35" /></svg>;
}

export default function AdminNavigation({ isAdmin, variant }: AdminNavigationProps) {
  const pathname = usePathname();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isUsersPage = pathname === "/admin/users";
  const [isExpanded, setIsExpanded] = useState(isAdminRoute);

  useEffect(() => {
    if (isAdmin && isAdminRoute) setIsExpanded(true);
  }, [isAdmin, isAdminRoute]);

  if (!isAdmin) return null;

  const isMobile = variant === "mobile";
  const parentClass = isMobile ? "mobile-nav-item" : "nav-item";
  const childClass = isMobile ? "mobile-nav-item" : "nav-item";

  return (
    <div className={`admin-nav-group ${isMobile ? "admin-nav-group-mobile" : ""}`}>
      <button
        type="button"
        className={`${parentClass} admin-nav-toggle ${isAdminRoute ? "active" : ""}`}
        aria-expanded={isExpanded}
        aria-controls={`admin-subnav-${variant}`}
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        <NavigationIcon name="overview" />
        <span>Admin Dashboard</span>
        <svg className="admin-nav-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="m8 10 4 4 4-4" />
        </svg>
      </button>
      {isExpanded && (
        <div className={`admin-subnav ${isMobile ? "admin-subnav-mobile" : ""}`} id={`admin-subnav-${variant}`}>
          <Link
            className={`${childClass} admin-nav-link ${pathname === "/admin" ? "active" : ""}`}
            href="/admin"
            aria-current={pathname === "/admin" ? "page" : undefined}
          >
            <NavigationIcon name="overview" />
            <span>Overview</span>
          </Link>
          <Link
            className={`${childClass} admin-nav-link ${isUsersPage ? "active" : ""}`}
            href="/admin/users"
            aria-current={isUsersPage ? "page" : undefined}
          >
            <NavigationIcon name="users" />
            <span>Users</span>
          </Link>
        </div>
      )}
    </div>
  );
}
