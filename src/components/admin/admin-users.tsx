"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import AdminUserActions from "@/components/admin/admin-user-actions";
import type { AdminUserListItem } from "@/components/admin/admin-user-actions";

const PAGE_SIZE = 10;

type UsersResponse = {
  users: AdminUserListItem[];
  total: number;
  currentUserId: string;
};

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [currentUserId, setCurrentUserId] = useState("");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [searchField, setSearchField] = useState<"name" | "email">("name");
  const [appliedSearchField, setAppliedSearchField] = useState<"name" | "email">("name");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const pageCount = Math.ceil(total / PAGE_SIZE);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      search: searchValue,
      searchField: appliedSearchField,
    });

    async function loadUsers() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/admin/users?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null);
          const message =
            typeof body === "object" &&
            body !== null &&
            "error" in body &&
            typeof body.error === "string"
              ? body.error
              : "Unable to load users. Please try again.";
          throw new Error(message);
        }

        const result = (await response.json()) as UsersResponse;
        if (!Array.isArray(result.users) || typeof result.total !== "number") {
          throw new Error("The user list response was invalid.");
        }
        setUsers(result.users);
        setTotal(result.total);
        setCurrentUserId(result.currentUserId);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load users. Please try again.",
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadUsers();
    return () => controller.abort();
  }, [page, searchValue, appliedSearchField, retryCount]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearchValue(searchInput.trim());
    setAppliedSearchField(searchField);
  }

  const firstUserNumber = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastUserNumber = Math.min(page * PAGE_SIZE, total);

  return (
    <main className="app-shell">
      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">
            <Link href="/admin" className="admin-users-back">Admin</Link>
            <span className="breadcrumb-slash">/</span>
            <strong>Users</strong>
          </div>
          <Link className="admin-users-dashboard-link" href="/dashboard">Back to dashboard</Link>
        </header>

        <div className="dashboard-content admin-users-content">
          <section className="welcome-row">
            <div>
              <p className="eyebrow welcome-eyebrow">ADMINISTRATION</p>
              <h1>User Management</h1>
              <p className="welcome-subtitle">View and search registered TaskFlow users.</p>
            </div>
          </section>

          <section className="panel admin-users-panel" aria-labelledby="registered-users-heading">
            <div className="admin-users-toolbar">
              <div>
                <h2 id="registered-users-heading">Registered users</h2>
                <p>Browse accounts and their access roles.</p>
              </div>
              <form className="admin-users-search" onSubmit={handleSearch}>
                <label className="admin-users-search-field">
                  <span className="sr-only">Search users by</span>
                  <select
                    value={searchField}
                    onChange={(event) => {
                      if (event.target.value === "name" || event.target.value === "email") {
                        setSearchField(event.target.value);
                      }
                    }}
                  >
                    <option value="name">Name</option>
                    <option value="email">Email</option>
                  </select>
                </label>
                <label className="admin-users-search-input">
                  <span className="sr-only">Search users</span>
                  <input
                    type="search"
                    placeholder={`Search by ${searchField}...`}
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                  />
                </label>
                <button className="button button-primary" type="submit">Search</button>
              </form>
            </div>

            {error ? (
              <div className="admin-users-state" role="alert">
                <strong>Couldn&apos;t load users</strong>
                <p>{error}</p>
                <button className="button button-quiet" onClick={() => setRetryCount((count) => count + 1)}>
                  Try again
                </button>
              </div>
            ) : isLoading ? (
              <div className="admin-users-state" role="status">Loading users…</div>
            ) : users.length === 0 ? (
              <div className="admin-users-state">
                <strong>{searchValue ? "No matching users" : "No users yet"}</strong>
                <p>{searchValue ? "Try a different name or email." : "Registered users will appear here."}</p>
              </div>
            ) : (
              <>
                <div className="admin-users-table-wrap">
                  <table className="admin-users-table">
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Email</th>
                        <th scope="col">Role</th>
                        <th scope="col">Status</th>
                        <th scope="col">Registration date</th>
                        <th scope="col"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id}>
                          <td className="admin-user-name">{user.name}</td>
                          <td>{user.email}</td>
                          <td>
                            <span className={`admin-user-role ${user.role === "Admin" ? "admin-user-role-admin" : ""}`}>
                              {user.role}
                            </span>
                          </td>
                          <td>
                            <span className={`admin-user-status ${user.banned ? "admin-user-status-banned" : ""}`}>
                              {user.banned ? "Banned" : "Active"}
                            </span>
                          </td>
                          <td>{new Date(user.registeredAt).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}</td>
                          <td className="admin-user-actions-cell">
                            <AdminUserActions
                              user={user}
                              currentUserId={currentUserId}
                              onChanged={() => setRetryCount((count) => count + 1)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <footer className="admin-users-pagination">
                  <span>Showing {firstUserNumber}–{lastUserNumber} of {total}</span>
                  <div>
                    <button
                      className="button button-quiet"
                      type="button"
                      disabled={page <= 1 || isLoading}
                      onClick={() => setPage((current) => current - 1)}
                    >
                      Previous
                    </button>
                    <span>Page {page} of {pageCount}</span>
                    <button
                      className="button button-quiet"
                      type="button"
                      disabled={page >= pageCount || isLoading}
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Next
                    </button>
                  </div>
                </footer>
              </>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
