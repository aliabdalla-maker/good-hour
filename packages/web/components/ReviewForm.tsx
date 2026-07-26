"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReviewPublic } from "@gihtcx/shared";
import { api, ApiError } from "../lib/apiClient";
import { Button } from "./ui/Button";

export function ReviewForm({ bookingId }: { bookingId: string }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<ReviewPublic>("/reviews", { bookingId, rating, comment: comment || undefined }),
    onSuccess: () => {
      setDone(true);
      qc.invalidateQueries({ queryKey: ["catalog"] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Could not submit review"),
  });

  if (done) return <p className="mt-3 text-sm text-emerald-600">✓ Thanks for reviewing this booking!</p>;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="mb-1 text-xs font-medium text-slate-500">Rate your stay</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex" role="radiogroup" aria-label="rating">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setRating(i)}
              aria-label={`${i} star${i > 1 ? "s" : ""}`}
              className={`text-xl leading-none ${i <= rating ? "text-amber-400" : "text-slate-300"}`}
            >
              ★
            </button>
          ))}
        </div>
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional comment"
          maxLength={1000}
          className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-sm"
        />
        <Button type="button" onClick={() => { setError(null); mutation.mutate(); }} disabled={mutation.isPending}>
          {mutation.isPending ? "…" : "Submit"}
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
