/**
 * Promise.allSettled with a concurrency cap and an optional deadline, preserving input order.
 *
 * Built for serverless functions with a hard wall-clock cap (Vercel Hobby: 60s). Tasks not yet
 * started when the deadline passes are reported as rejected instead of being run, so the caller
 * returns partial results rather than being killed mid-flight with nothing to show.
 */
export async function runPool<T>(tasks: Array<() => Promise<T>>, limit: number, deadline = Infinity): Promise<PromiseSettledResult<T>[]> {
  const results = new Array<PromiseSettledResult<T>>(tasks.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= tasks.length) return;
      if (Date.now() >= deadline) {
        results[i] = { status: "rejected", reason: new Error("skipped: time budget reached") };
        continue;
      }
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, worker));
  return results;
}
