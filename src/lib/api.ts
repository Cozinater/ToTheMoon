export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const code = body.error ?? "UNKNOWN";
    if (res.status === 401 && code === "UNAUTHORIZED" && window.location.pathname !== "/login") {
      window.location.assign("/login"); // session gone: full reload drops in-memory data
    }
    throw new ApiError(res.status, code, body.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}
