"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card p-8 border-l-2 border-l-red">
      <div className="font-semibold text-red">Something went wrong</div>
      <p className="text-sm text-muted mt-2 whitespace-pre-wrap">{error.message}</p>
      <button type="button" className="btn mt-4" onClick={reset}>Try again</button>
    </div>
  );
}
