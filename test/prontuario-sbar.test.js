import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { devJwt, jsonResponse, post, withServer } from "./helpers.js";

const NOTA = "nota de teste: dor de cabeca ha 2 dias";
const FOTO = {
  mediaType: "image/png",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
};
const TEXTO_FIXO = ["leito 305", "BEG, LOC", "IAM sem supra"];

test("nota de teste vira prontuário pelo provedor OpenAI sem texto inventado", async () => {
  let chamadas = 0;
  await withServer(
    {
      env: { LLM_MOCK: "1" },
      fetchImpl: async () => {
        chamadas += 1;
        throw new Error("não deveria haver rede");
      },
    },
    async ({ port, logs }) => {
      const res = await post(port, "/api/v1/prontuario/generate", {
        texto: NOTA,
        paciente: { nome: "Paciente Nota", idade: "40", sexo: "F" },
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.provider, "openai");
      assert.equal(body.mode, "mock");
      assert.match(body.historia, /nota de teste/);
      assert.match(body.full, /Paciente Nota/);
      assert.equal(body.exameFisico, "Não informado na nota.");
      assert.equal(chamadas, 0);
      assert.ok(logs.some((linha) => linha.includes("[provider] openai")));
      for (const trecho of TEXTO_FIXO) assert.equal(JSON.stringify(body).includes(trecho), false);
    },
  );
});

test("sem nota o prontuário não é gerado", async () => {
  await withServer({ env: { LLM_MOCK: "1" } }, async ({ port }) => {
    const res = await post(port, "/api/v1/prontuario/generate", { texto: "   " });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.match(body.message, /Envie a nota/);
  });
});

test("foto sem provedor de visão devolve erro e não preenche texto fixo", async () => {
  await withServer({ env: { LLM_MOCK: "1" } }, async ({ port }) => {
    const res = await post(port, "/api/v1/sbar/photo", { images: [FOTO] });
    const body = await res.json();
    assert.equal(res.status, 503);
    assert.match(body.message, /Nada foi transcrito/);
    for (const trecho of TEXTO_FIXO) assert.equal(JSON.stringify(body).includes(trecho), false);
  });
});

test("com OpenAI, a foto devolve só a transcrição do provedor", async () => {
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    const user = body.messages.find((m) => m.role === "user");
    assert.equal(Array.isArray(user.content), true);
    assert.equal(user.content.some((parte) => parte.type === "image_url"), true);
    return jsonResponse({ choices: [{ message: { content: "anotacao lida no teste" } }] });
  };
  await withServer({ env: { OPENAI_API_KEY: "sk-test" }, fetchImpl }, async ({ port, logs }) => {
    const res = await post(port, "/api/v1/sbar/photo", { images: [FOTO] });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.transcript, "anotacao lida no teste");
    assert.equal(body.provider, "openai");
    assert.ok(logs.includes("[provider] openai"));
    assert.equal(JSON.stringify(body).includes("leito 305"), false);
  });
});

test("transcrição vira SBAR sem completar campos que não estão no texto", async () => {
  await withServer({ env: { LLM_MOCK: "1" } }, async ({ port }) => {
    const res = await post(port, "/api/v1/sbar/organize", { transcript: NOTA });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.provider, "openai");
    assert.match(body.situation, /nota de teste/);
    assert.equal(body.assessment, "Não identificado na transcrição.");
    assert.equal(body.recommendation, "Não identificado na transcrição.");
  });
});

test("stack local: prontuário via API e foto sem texto fixo", async () => {
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
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(saida)), 8000);
      const tentar = () => {
        const match = saida.match(/\[gateway\] listening port=(\d+)/);
        if (!match) return;
        clearTimeout(timer);
        resolve(Number(match[1]));
      };
      proc.stdout.on("data", tentar);
      proc.once("exit", () => {
        clearTimeout(timer);
        reject(new Error(saida));
      });
    });
    const token = devJwt();
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Connection: "close",
    };
    const prontuario = await fetch(`http://127.0.0.1:${port}/api/v1/prontuario/generate`, {
      method: "POST",
      headers,
      body: JSON.stringify({ texto: NOTA, paciente: { nome: "Paciente Nota" } }),
    });
    const prontuarioBody = await prontuario.json();
    assert.equal(prontuario.status, 200);
    assert.match(prontuarioBody.historia, /nota de teste/);
    assert.equal(prontuarioBody.provider, "openai");

    const foto = await fetch(`http://127.0.0.1:${port}/api/v1/sbar/photo`, {
      method: "POST",
      headers,
      body: JSON.stringify({ images: [FOTO] }),
    });
    const fotoBody = await foto.json();
    assert.equal(foto.status, 503);
    assert.match(fotoBody.message, /Nada foi transcrito/);
    for (const trecho of TEXTO_FIXO) assert.equal(JSON.stringify(fotoBody).includes(trecho), false);
    assert.match(saida, /\[provider\] openai/);
  } finally {
    proc.kill("SIGTERM");
    await new Promise((resolve) => proc.once("exit", resolve));
  }
});
