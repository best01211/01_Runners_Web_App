/** Development-only timings. Never logs URLs, tokens, query values or user data. */
export async function measure<T>(stage: string, work: () => PromiseLike<T>): Promise<T> {
  if (process.env.NODE_ENV !== "development") return await work();
  const start = performance.now();
  try { return await work(); }
  finally { console.info(`[perf] ${stage} ${(performance.now() - start).toFixed(1)}ms`); }
}

export const timedSupabaseFetch: typeof fetch = (input, init) => {
  if (process.env.NODE_ENV !== "development") return fetch(input, init);
  const path = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).pathname;
  const table = /^\/rest\/v1\/([a-z_]+)$/.exec(path)?.[1];
  const stage = path.startsWith("/auth/") ? "supabase.auth" : table ? `supabase.query.${table}` : "supabase.http";
  return measure(stage, () => fetch(input, init));
};
