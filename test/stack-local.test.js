import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { devJwt } from "./helpers.js";

test("stack local: receita sai com o médico enviado e o log mostra OpenAI", async () => {
  const proc = spawn(process.execPath, ["server.js"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: {
      PATH: process.env.PATH,
      PORT: "0",
      LLM_MOCK: "1",
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      SUPABASE_JWT_SECRET: "",
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
    const token = devJwt();
    const receita = await fetch(`http://127.0.0.1:${port}/api/v1/documents/receita`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Connection: "close",
      },
      body: JSON.stringify({
        paciente: { nome: "Paciente de Teste" },
        medicamentos: [{ nome: "Dipirona 500mg", posologia: "1 comp a cada 8h" }],
        medico: { nome: "Dra. Teste Alfa", crm: "111111/MG" },
      }),
    });
    const receitaBody = await receita.json();
    assert.equal(receita.status, 200);
    assert.match(receitaBody.document, /Dra\. Teste Alfa/);
    assert.match(receitaBody.document, /111111\/MG/);
    assert.equal(receitaBody.document.includes("Roeder"), false);

    const ia = await fetch(`http://127.0.0.1:${port}/api/v1/ai/clinical`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Connection: "close",
      },
      body: JSON.stringify({ messages: [{ role: "user", content: "nota de teste da stack local" }] }),
    });
    const iaBody = await ia.json();
    assert.equal(ia.status, 200);
    assert.equal(iaBody.provider, "openai");
    assert.match(iaBody.response, /nota de teste da stack local/);

    await esperar(() => saida.includes("[provider] openai"), () => saida);
    assert.match(saida, /\[provider\] openai/);
    assert.equal(saida.includes("api.openai.com"), false);
    assert.equal(saida.includes("api.anthropic.com"), false);
  } finally {
    proc.kill("SIGTERM");
    await new Promise((resolve) => proc.once("exit", resolve));
  }
});

function esperarPorta(proc, ler) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`gateway não subiu: ${ler()}`)), 8000);
    const tentar = () => {
      const match = ler().match(/\[gateway\] listening port=(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
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

function esperar(ok, ler) {
  return new Promise((resolve, reject) => {
    const inicio = Date.now();
    const timer = setInterval(() => {
      if (ok()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - inicio > 3000) {
        clearInterval(timer);
        reject(new Error(`log sem provedor: ${ler()}`));
      }
    }, 20);
  });
}
