import { createApp } from "../src/app.js";

export function devJwt(payload = { sub: "tenant-a", email: "a@example.com", role: "authenticated" }) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

export function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

export async function withServer(options, fn) {
  const logs = [];
  const log = {
    info(message) {
      logs.push(message);
    },
    error(message) {
      logs.push(message);
    },
  };
  const app = createApp({ ...options, log, env: { SUPABASE_JWT_SECRET: "", ...options.env } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    return await fn({ port, logs });
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

export function post(port, path, body, token = devJwt()) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Connection: "close",
    },
    body: JSON.stringify(body),
  });
}
