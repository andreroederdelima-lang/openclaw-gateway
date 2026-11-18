import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;

test("GET /health no processo e o script de healthcheck", async () => {
  const proc = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      PORT: "0",
      HOST: "127.0.0.1",
      LLM_MOCK: "1",
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      SUPABASE_JWT_SECRET: "",
      SUPABASE_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let saida = "";
  proc.stdout.on("data", (chunk) => {
    saida += chunk;
  });
  proc.stderr.on("data", (chunk) => {
    saida += chunk;
  });

  try {
    const port = await esperarPorta(proc, () => saida);
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, "openclaw-gateway");

    const check = spawn(process.execPath, ["scripts/healthcheck.mjs"], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        PORT: String(port),
        HEALTHCHECK_HOST: "127.0.0.1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let checkOut = "";
    check.stdout.on("data", (chunk) => {
      checkOut += chunk;
    });
    check.stderr.on("data", (chunk) => {
      checkOut += chunk;
    });
    const code = await esperarSaida(check);
    assert.equal(code, 0);
    assert.match(checkOut, /\[health\] ok/);
  } finally {
    proc.kill("SIGTERM");
    await new Promise((resolve) => proc.once("exit", resolve));
  }
});

test("produção com LLM_MOCK=1 não escuta", async () => {
  const proc = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      PORT: "0",
      NODE_ENV: "production",
      LLM_MOCK: "1",
      OPENAI_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let saida = "";
  proc.stdout.on("data", (chunk) => {
    saida += chunk;
  });
  proc.stderr.on("data", (chunk) => {
    saida += chunk;
  });
  const code = await esperarSaida(proc);
  assert.notEqual(code, 0);
  assert.match(saida, /LLM_MOCK=1/);
  assert.equal(saida.includes("listening"), false);
});

function esperarPorta(proc, ler) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`gateway não subiu: ${ler()}`)), 8000);
    const tentar = () => {
      const match = ler().match(/\[gateway\] listening port=(\d+)/);
      if (!match) return;
      clearTimeout(timer);
      resolve(Number(match[1]));
    };
    proc.stdout.on("data", tentar);
    proc.stderr.on("data", tentar);
    proc.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`gateway encerrou (${code}): ${ler()}`));
    });
    tentar();
  });
}

function esperarSaida(proc) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("processo não encerrou"));
    }, 8000);
    proc.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}
