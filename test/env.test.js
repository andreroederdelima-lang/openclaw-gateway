import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { avisosDeAmbiente, erroDeProducao, hostDeEscuta, porta } from "../src/env.js";

test("porta e host saem do ambiente", () => {
  assert.equal(porta(undefined), 3463);
  assert.equal(porta(""), 3463);
  assert.equal(porta("3463"), 3463);
  assert.equal(porta("0"), 0);
  assert.equal(porta("nao"), 3463);
  assert.equal(hostDeEscuta(undefined), "0.0.0.0");
  assert.equal(hostDeEscuta(""), "0.0.0.0");
  assert.equal(hostDeEscuta("127.0.0.1"), "127.0.0.1");
});

test("produção recusa mock e o exemplo não traz valor", () => {
  assert.equal(erroDeProducao({ NODE_ENV: "production", LLM_MOCK: "1" })?.includes("LLM_MOCK"), true);
  assert.equal(erroDeProducao({ NODE_ENV: "production", LLM_MOCK: "" }), null);
  assert.equal(erroDeProducao({ LLM_MOCK: "1" }), null);

  const avisos = avisosDeAmbiente({});
  assert.equal(avisos.some((linha) => linha.includes("OPENAI_API_KEY")), true);
  assert.equal(avisos.some((linha) => linha.includes("SUPABASE_URL")), true);
  assert.equal(avisosDeAmbiente({ LLM_MOCK: "1" }).some((linha) => linha.includes("LLM_MOCK=1")), true);

  const exemplo = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  for (const key of [
    "PORT",
    "HOST",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "LLM_MOCK",
    "SUPABASE_URL",
    "SUPABASE_JWT_SECRET",
  ]) {
    assert.match(exemplo, new RegExp(`^${key}=$`, "m"));
  }
  assert.equal(exemplo.includes("http"), false);
  assert.equal(exemplo.includes("@"), false);
});

test("o systemd do runbook instala o lock antes de subir", () => {
  const doc = readFileSync(new URL("../docs/DEPLOY.md", import.meta.url), "utf8");
  const bloco = doc.split("### 2.b systemd")[1].split("### 2.c")[0];
  const instalar = bloco.indexOf("npm ci --omit=dev");
  const subir = bloco.indexOf("systemctl enable");
  assert.ok(instalar >= 0);
  assert.ok(subir > instalar);
});
