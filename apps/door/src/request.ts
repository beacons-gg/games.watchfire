/** What a fetch call asks for: its method (upper case) and URL, from either way of calling fetch. */
export function requestOf(input: RequestInfo | URL, init?: RequestInit): { method: string; url: URL; read: boolean } {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const url = new URL(input instanceof Request ? input.url : String(input));
  return { method, url, read: method === "GET" || method === "HEAD" };
}
