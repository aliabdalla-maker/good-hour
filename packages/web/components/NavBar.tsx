"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ERP_ADMIN_EMAIL, type NotificationPublic } from "@gihtcx/shared";
import { useCurrentUser } from "../lib/useCurrentUser";
import { api } from "../lib/apiClient";
import { cn } from "../lib/cn";

function useUnreadCount(enabled: boolean) {
  const { data } = useQuery<NotificationPublic[]>({
    queryKey: ["notifications"],
    queryFn: () => api.get<NotificationPublic[]>("/notifications"),
    enabled,
    refetchInterval: 15000,
  });
  return data?.filter((n) => !n.readAt).length ?? 0;
}

export function NavBar() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount(Boolean(user));

  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await api.post("/auth/logout");
    } catch {
      // Swallow deliberately. Previously an unhandled rejection here — a
      // network blip, or the global 100/min rate limiter returning 429 — meant
      // setQueryData never ran, so clicking "Log out" did absolutely nothing:
      // no error, no visual change. Signing out locally must never depend on
      // the network call succeeding.
    } finally {
      // clear(), not setQueryData(["me"], null). The old version left every
      // other cached query intact, so the previous user's wallet balance,
      // bookings and notifications stayed in memory (and on screen) after
      // logout — a data-leak on any shared device.
      queryClient.clear();
      setOpen(false);
      setLoggingOut(false);
      // Leave whatever authenticated page they were on. Without this, logging
      // out from a public page changed only the nav, which reads as "nothing
      // happened", and RequireAuth pages could briefly render stale content.
      router.replace("/login");
    }
  }

  // Four primary destinations, deliberately.
  //
  // "Auctions" and "Request a match" used to sit here as siblings, which read as
  // two products when they are two directions of one mechanic: a buyer states what
  // they want and sellers compete downward. That duplication is real below the UI
  // too — BookingRequest/SupplierOffer and REVERSE auctions are separate tables —
  // and merging the schemas would mean migrating live booking data. Presenting one
  // door is the part that can be fixed today without touching production rows.
  //
  // Discovery is preserved: /browse carries a prominent "Request a match" card.
  const primaryLinks = [
    { href: "/browse", label: "Browse" },
    { href: "/search", label: "Search by time" },
    { href: "/market", label: "Products & services" },
    { href: "/auctions", label: "Auctions & requests" },
  ];
  const roleLinks = [
    // The wallet belongs to every signed-in account, not a single role.
    ...(user ? [{ href: "/wallet", label: "Wallet" }] : []),
    ...(user?.role === "SUPPLIER"
      ? [
          { href: "/dashboard/supplier", label: "Supplier dashboard" },
          { href: "/sourcing", label: "Import listings" },
        ]
      : []),
    ...(user?.role === "TRAVELLER" ? [{ href: "/dashboard/traveller", label: "My bookings" }] : []),
    ...(user?.role === "ADMIN"
      ? [
          { href: "/admin/crm", label: "CRM" },
          { href: "/admin/campaigns", label: "Campaigns" },
          { href: "/admin/verification", label: "Verification" },
        ]
      : []),
    // Not a role check -- this one link is for the single owner-operator
    // account only, hidden from every other ADMIN too.
    ...(user?.email === ERP_ADMIN_EMAIL ? [{ href: "/admin/erp", label: "ERP" }] : []),
  ];

  const Wordmark = (
    <Link href="/browse" className="flex items-center gap-2 text-lg font-semibold text-slate-900" onClick={() => setOpen(false)}>
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-sm text-white">◷</span>
      Good Hours
    </Link>
  );

  const NotificationsLink =
    user &&
    (
      <Link
        href="/notifications"
        onClick={() => setOpen(false)}
        className="relative inline-flex items-center gap-1 text-slate-600 hover:text-slate-900"
      >
        Notifications
        {unread > 0 && (
          <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-xs font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
    );

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        {Wordmark}

        {/* Desktop */}
        <div className="hidden items-center gap-4 text-sm md:flex">
          {[...primaryLinks, ...roleLinks].map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-6 items-center text-slate-600 hover:text-slate-900">
              {l.label}
            </Link>
          ))}
          {NotificationsLink}
          {user ? (
            <button onClick={handleLogout} disabled={loggingOut} className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              {loggingOut ? "Signing out…" : "Log out"}
            </button>
          ) : (
            <>
              <Link href="/login" className="inline-flex min-h-6 items-center text-slate-600 hover:text-slate-900">
                Log in
              </Link>
              <Link href="/register" className="rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700">
                Register
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Toggle menu"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile drawer */}
      <div className={cn("border-t border-slate-200 md:hidden", open ? "block" : "hidden")}>
        <div className="mx-auto flex max-w-5xl flex-col gap-1 px-6 py-3 text-sm">
          {[...primaryLinks, ...roleLinks].map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-2 py-2 text-slate-700 hover:bg-slate-100">
              {l.label}
            </Link>
          ))}
          {user && (
            <Link href="/notifications" onClick={() => setOpen(false)} className="rounded-lg px-2 py-2 text-slate-700 hover:bg-slate-100">
              Notifications {unread > 0 && <span className="ml-1 rounded-full bg-brand-600 px-1.5 text-xs text-white">{unread}</span>}
            </Link>
          )}
          <div className="mt-2 border-t border-slate-100 pt-2">
            {user ? (
              <button onClick={handleLogout} disabled={loggingOut} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left text-slate-700 disabled:opacity-60">
                Log out ({user.email})
              </button>
            ) : (
              <div className="flex gap-2">
                <Link href="/login" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-center">
                  Log in
                </Link>
                <Link href="/register" onClick={() => setOpen(false)} className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-center font-medium text-white">
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
