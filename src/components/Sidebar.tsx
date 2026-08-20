"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface UserProfile {
  username: string;
  role: string;
  assignedBranch: string | null;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (pathname === "/login") return;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user);
        }
      })
      .catch(() => {});
  }, [pathname]);

  // Don't show sidebar on login page
  if (pathname === "/login") return null;

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPERADMIN";

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo" style={{ background: "transparent", boxShadow: "none" }}>
          <img src="/logo.jpg" alt="Skoda Logo" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
        </div>
        <div>
          <div className="sidebar-title">SGA Skoda</div>
          <div className="sidebar-subtitle">CRM Dashboard</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <Link
          href="/dashboard"
          className={`sidebar-link ${pathname === "/dashboard" ? "active" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          Dashboard
        </Link>

        <Link
          href="/calendar"
          className={`sidebar-link ${pathname === "/calendar" ? "active" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          Calendar
        </Link>

        {isAdmin && (
          <>
            <Link
              href="/activity"
              className={`sidebar-link ${pathname === "/activity" ? "active" : ""}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
              </svg>
              User Activity
            </Link>
            <Link
              href="/consultants"
              className={`sidebar-link ${pathname === "/consultants" ? "active" : ""}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Consultants
            </Link>
            <Link
              href="/accounts"
              className={`sidebar-link ${pathname === "/accounts" ? "active" : ""}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Accounts
            </Link>
          </>
        )}

        <Link
          href="/settings"
          className={`sidebar-link ${pathname === "/settings" ? "active" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
          Settings
        </Link>
      </nav>

      <div className="sidebar-footer">
        {user && (
          <div style={{ marginBottom: 12, padding: "0 4px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{user.username}</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "1px 6px",
                  borderRadius: 4,
                  background:
                    user.role === "SUPERADMIN"
                      ? "linear-gradient(135deg, rgba(147, 51, 234, 0.25), rgba(79, 70, 229, 0.25))"
                      : user.role === "ADMIN"
                      ? "rgba(0, 200, 83, 0.15)"
                      : "rgba(33, 150, 243, 0.15)",
                  color:
                    user.role === "SUPERADMIN"
                      ? "#a855f7"
                      : user.role === "ADMIN"
                      ? "#00e676"
                      : "#448aff",
                  border: user.role === "SUPERADMIN" ? "1px solid rgba(168, 85, 247, 0.4)" : "none",
                }}
              >
                {user.role}
              </span>
              {user.assignedBranch && (
                <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize" }}>
                  • {user.assignedBranch.replace(/_/g, " ")}
                </span>
              )}
            </div>
          </div>
        )}

        <button className="logout-btn" onClick={handleLogout}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Logout
        </button>
      </div>

    </aside>
  );
}
