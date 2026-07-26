"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Role } from "@gihtcx/shared";
import { useCurrentUser } from "../lib/useCurrentUser";
import { Spinner } from "./ui/Spinner";

/**
 * Client-side guard for pages that need a session. Unauthenticated users are
 * sent to /login (with a return path); a role mismatch bounces to /browse.
 * Avoids ever surfacing a raw "Authentication required" API error to the user.
 */
export function RequireAuth({ children, roles }: { children: React.ReactNode; roles?: Role[] }) {
  const { data: user, isLoading } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();

  const wrongRole = Boolean(user && roles && !roles.includes(user.role));

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (wrongRole) {
      router.replace("/browse");
    }
  }, [user, isLoading, wrongRole, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Spinner /> <span className="ml-2 text-sm">Loading…</span>
      </div>
    );
  }
  if (!user || wrongRole) {
    return <div className="py-24 text-center text-sm text-slate-500">Redirecting…</div>;
  }
  return <>{children}</>;
}
