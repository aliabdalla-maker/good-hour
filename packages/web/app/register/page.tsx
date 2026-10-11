"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/apiClient";

export default function RegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"TRAVELLER" | "SUPPLIER">("TRAVELLER");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await api.post("/auth/register", { email, password, role, marketingOptIn });
      queryClient.setQueryData(["me"], user);
      router.push(role === "SUPPLIER" ? "/dashboard/supplier" : "/search");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="font-display mb-6 text-2xl font-semibold">Create an account</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          I am a...
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "TRAVELLER" | "SUPPLIER")}
            className="rounded border border-slate-300 px-3 py-2"
          >
            <option value="TRAVELLER">Traveller (booking rooms, cars &amp; travel)</option>
            <option value="SUPPLIER">Supplier (listing rooms, cars &amp; travel)</option>
          </select>
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            required
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            I am 18 or over and agree to the{" "}
            <Link href="/terms" className="text-brand-600 underline" target="_blank">Terms of Service</Link> and{" "}
            <Link href="/privacy" className="text-brand-600 underline" target="_blank">Privacy Policy</Link>.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={marketingOptIn}
            onChange={(e) => setMarketingOptIn(e.target.checked)}
            className="mt-0.5"
          />
          <span>Send me occasional offers and news by email (optional — unsubscribe any time).</span>
        </label>
        {error && <p className="text-sm text-danger-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "Creating account..." : "Register"}
        </button>
      </form>
    </div>
  );
}
