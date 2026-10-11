"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "../../../components/RequireAuth";
import { Card } from "../../../components/ui/Card";
import {
  FAMILY_LABELS,
  REQUIREMENTS,
  strongestEvidence,
  type EvidenceKind,
  type RequirementRow,
  type RequirementVerdict,
} from "../../../lib/requirementsData";

/**
 * Readiness — the requirements register, in the product.
 *
 * It is here because the register's own lesson is that a status nobody sees is a
 * status nobody maintains. FR-030 (liquidity) went unmeasured for an entire build
 * while a capability dashboard read healthy.
 *
 * Two design decisions worth stating, because both resist the pull of a flattering
 * dashboard:
 *
 *  1. **Evidence kind is shown as prominently as the verdict.** A requirement
 *     "Met" on the strength of one human glance is not the same claim as one
 *     backed by an automated test, and collapsing them is exactly how "written"
 *     came to be read as "working".
 *  2. **The default filter is Must-haves that are not Met.** Opening this page
 *     shows the outstanding work, not the score.
 */

const VERDICT_STYLE: Record<RequirementVerdict, { chip: string; dot: string }> = {
  Met: { chip: "bg-success-50 text-success-800 border-success-200", dot: "bg-success-600" },
  "Partially met": {
    chip: "bg-warning-50 text-warning-800 border-warning-200",
    dot: "bg-warning-600",
  },
  "Not met": { chip: "bg-danger-50 text-danger-800 border-danger-200", dot: "bg-danger-600" },
  "Not started": { chip: "bg-slate-50 text-slate-600 border-slate-200", dot: "bg-slate-400" },
};

const EVIDENCE_STYLE: Record<EvidenceKind, { label: string; chip: string; title: string }> = {
  test: {
    label: "tested",
    chip: "bg-success-50 text-success-800 border-success-200",
    title: "An automated assertion fails if this breaks",
  },
  prod: {
    label: "in production",
    chip: "bg-info-50 text-info-800 border-info-200",
    title: "Real traffic has exercised this",
  },
  manual: {
    label: "checked once",
    chip: "bg-warning-50 text-warning-800 border-warning-200",
    title: "A human verified it once; nothing guards it",
  },
  code: {
    label: "written only",
    chip: "bg-slate-100 text-slate-600 border-slate-200",
    title: "The code exists; nothing verifies it",
  },
};

const VERDICTS: RequirementVerdict[] = ["Met", "Partially met", "Not met", "Not started"];

export default function ReadinessPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <Readiness />
    </RequireAuth>
  );
}

function Readiness() {
  const [showOnlyOutstanding, setShowOnlyOutstanding] = useState(true);
  const [family, setFamily] = useState<"all" | "FR" | "NFR" | "CR">("all");

  const counts = useMemo(() => {
    const byVerdict = Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<
      RequirementVerdict,
      number
    >;
    for (const r of REQUIREMENTS) byVerdict[r.verdict] += 1;
    return byVerdict;
  }, []);

  const outstandingMusts = useMemo(
    () => REQUIREMENTS.filter((r) => r.priority === "Must" && r.verdict !== "Met"),
    []
  );

  // "Met on one human glance" — the weakest claim the register permits, and the
  // number most worth staring at.
  const manualOnly = useMemo(
    () => REQUIREMENTS.filter((r) => r.verdict === "Met" && strongestEvidence(r) === "manual"),
    []
  );

  const rows = useMemo(() => {
    let out = REQUIREMENTS;
    if (family !== "all") out = out.filter((r) => r.family === family);
    if (showOnlyOutstanding) out = out.filter((r) => r.priority === "Must" && r.verdict !== "Met");
    const order = { Must: 0, Should: 1, Could: 2, "Won't": 3 } as const;
    const vOrder = { "Not met": 0, "Not started": 1, "Partially met": 2, Met: 3 } as const;
    return [...out].sort(
      (a, b) => vOrder[a.verdict] - vOrder[b.verdict] || order[a.priority] - order[b.priority]
    );
  }, [family, showOnlyOutstanding]);

  return (
    <div>
      <h1 className="font-display mb-1 text-2xl font-semibold">Readiness</h1>
      <p className="mb-6 text-sm text-slate-500">
        Every requirement stated for this platform, with a testable acceptance criterion and how it
        is actually known. Generated from{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5">docs/REQUIREMENTS.md</code>; a stale copy
        fails the test suite.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {VERDICTS.map((v) => (
          <Card key={v} className="animate-fade-in-up p-4">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${VERDICT_STYLE[v].dot}`}
                aria-hidden="true"
              />
              <p className="text-xs uppercase tracking-wide text-slate-500">{v}</p>
            </div>
            <p className="mt-1 text-2xl font-semibold">{counts[v]}</p>
            <p className="text-xs text-slate-500">
              {Math.round((counts[v] / REQUIREMENTS.length) * 100)}% of {REQUIREMENTS.length}
            </p>
          </Card>
        ))}
      </div>

      {outstandingMusts.length > 0 && (
        <Card className="mb-4 border-danger-200 bg-danger-50 p-4">
          <p className="text-sm font-semibold text-danger-800">
            {outstandingMusts.length} Must-have requirements are not met
          </p>
          <p className="mt-1 text-xs text-danger-700">
            A Must that is not met is not a backlog item; it is a statement that the platform does
            not yet do something it is required to do.
          </p>
        </Card>
      )}

      {manualOnly.length > 0 && (
        <Card className="mb-6 border-warning-200 bg-warning-50 p-4">
          <p className="text-sm font-semibold text-warning-800">
            {manualOnly.length} requirements are &ldquo;Met&rdquo; on a single human check
          </p>
          <p className="mt-1 text-xs text-warning-800">
            Nothing guards these: a regression in any of them would ship silently. Converting them
            to automated tests is the cheapest way to make this page mean more:{" "}
            {manualOnly.map((r) => r.id).join(", ")}
          </p>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-6 items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={showOnlyOutstanding}
            onChange={(e) => setShowOnlyOutstanding(e.target.checked)}
            className="h-4 w-4"
          />
          Only outstanding Must-haves
        </label>
        <div className="flex gap-2">
          {(["all", "FR", "NFR", "CR"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFamily(f)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                family === f
                  ? "border-brand-500 bg-brand-50 text-brand-800"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {f === "all" ? "All" : FAMILY_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <RequirementCard key={r.id} row={r} />
        ))}
        {rows.length === 0 && (
          <Card className="p-6 text-center">
            <p className="text-sm font-medium text-success-800">
              No outstanding Must-haves in this family.
            </p>
          </Card>
        )}
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Live liquidity figures on the{" "}
        <Link href="/admin/erp" className="font-medium text-brand-700 underline">
          ERP
        </Link>{" "}
        page · compliance detail in <code className="rounded bg-slate-100 px-1">docs/COMPLIANCE.md</code>
      </p>
    </div>
  );
}

function RequirementCard({ row }: { row: RequirementRow }) {
  const style = VERDICT_STYLE[row.verdict];
  return (
    <Card className="animate-fade-in-up p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
              {row.id}
            </code>
            <span className="font-medium text-slate-900">{row.requirement}</span>
          </p>
          <p className="mt-1 text-sm text-slate-600">{row.criterion}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
            {row.priority}
          </span>
          <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${style.chip}`}>
            {row.verdict}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        {row.evidenceKinds.length === 0 ? (
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
            no evidence cited
          </span>
        ) : (
          row.evidenceKinds.map((kind) => (
            <span
              key={kind}
              title={EVIDENCE_STYLE[kind].title}
              className={`rounded-md border px-2 py-0.5 text-xs font-medium ${EVIDENCE_STYLE[kind].chip}`}
            >
              {EVIDENCE_STYLE[kind].label}
            </span>
          ))
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{row.evidence}</span>
      </div>
    </Card>
  );
}
