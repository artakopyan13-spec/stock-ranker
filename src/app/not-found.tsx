import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card p-10 text-center">
      <div className="text-2xl font-semibold">Not found</div>
      <p className="text-muted mt-2 text-sm">That ticker, watchlist or share link does not exist here.</p>
      <Link href="/" className="btn btn-primary mt-5 no-underline">Back to search</Link>
    </div>
  );
}
