"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";

interface UserSessionState {
  username: string;
  role: string;
  assignedBranch?: string | null;
  isSuperAdmin?: boolean;
  impersonatingFrom?: string | null;
}

export function ImpersonationBanner() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<UserSessionState | null>(null);
  const [exiting, setExiting] = useState(false);

  const checkSession = useCallback(async () => {
    if (pathname === "/login") {
      setSession(null);
      return;
    }
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setSession(data.user);
        } else {
          setSession(null);
        }
      } else {
        setSession(null);
      }
    } catch {
      setSession(null);
    }
  }, [pathname]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const handleStopImpersonation = async () => {
    setExiting(true);
    try {
      const res = await fetch("/api/auth/stop-impersonate", {
        method: "POST",
      });
      if (res.ok) {
        await checkSession();
        router.refresh();
        window.location.href = "/accounts";
      } else {
        alert("Failed to exit impersonation");
      }
    } catch (err) {
      console.error("Stop impersonation error:", err);
      alert("An error occurred while exiting impersonation");
    } finally {
      setExiting(false);
    }
  };

  if (!session?.impersonatingFrom || pathname === "/login") {
    return null;
  }

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 999999,
        background: "linear-gradient(90deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%)",
        color: "#ffffff",
        padding: "8px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 4px 20px rgba(99, 102, 241, 0.4)",
        fontSize: "13px",
        fontWeight: 600,
        letterSpacing: "0.01em",
        borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "16px" }}>🎭</span>
        <span>
          Impersonating <strong>{session.username}</strong>
          <span
            style={{
              marginLeft: "8px",
              padding: "2px 8px",
              borderRadius: "12px",
              background: "rgba(255, 255, 255, 0.2)",
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            {session.role}
          </span>
          {session.assignedBranch && (
            <span style={{ opacity: 0.9, marginLeft: "6px" }}>
              • Branch: <strong style={{ textTransform: "capitalize" }}>{session.assignedBranch.replace(/_/g, " ")}</strong>
            </span>
          )}
        </span>
        <span style={{ opacity: 0.75, fontSize: "12px" }}>
          (Developer Superadmin Session: {session.impersonatingFrom})
        </span>
      </div>

      <button
        onClick={handleStopImpersonation}
        disabled={exiting}
        style={{
          background: "#ffffff",
          color: "#4f46e5",
          border: "none",
          padding: "5px 14px",
          borderRadius: "6px",
          fontWeight: 700,
          fontSize: "12px",
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          transition: "transform 0.15s ease, background 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.03)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
        }}
      >
        <span>✕</span>
        <span>{exiting ? "Exiting..." : "Stop Impersonating"}</span>
      </button>
    </div>
  );
}
