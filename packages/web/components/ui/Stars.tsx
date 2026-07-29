export function Stars({
  rating,
  count,
  showEmpty = true,
}: {
  rating: number | null;
  count?: number;
  showEmpty?: boolean;
}) {
  if (rating == null || (count != null && count === 0)) {
    return showEmpty ? <span className="text-xs text-slate-500">No reviews yet</span> : null;
  }
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${rating} out of 5`}>
      <span className="text-sm leading-none">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={i <= full ? "text-warning-400" : "text-slate-300"}>
            ★
          </span>
        ))}
      </span>
      <span className="text-xs font-medium text-slate-600">
        {rating.toFixed(1)}
        {count != null ? ` (${count})` : ""}
      </span>
    </span>
  );
}
