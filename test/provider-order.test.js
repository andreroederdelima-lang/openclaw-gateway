import assert from "node:assert/strict";
import test from "node:test";
import { ordemProvedores } from "../src/providers.js";
import { jsonResponse, post, withServer } from "./helpers.js";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

test("a ordem começa em OpenAI e o mock local não chama a rede", () => {
  assert.deepEqual(ordemProvedores({ LLM_MOCK: "1", ANTHROPIC_API_KEY: "anth" }), ["openai", "anthropic"]);
  assert.deepEqual(ordemProvedores({ OPENAI_API_KEY: "sk", ANTHROPIC_API_KEY: "anth" }), ["openai", "anthropic"]);
  assert.deepEqual(ordemProvedores({ ANTHROPIC_API_KEY: "anth" }), ["anthropic"]);
  assert.deepEqual(ordemProvedores({}), []);
});

test("com as duas chaves, a primeira chamada é OpenAI e o log registra o provedor", async () => {
  const chamadas = [];
  const fetchImpl = async (url) => {
    chamadas.push(String(url));
    if (String(url) === OPENAI_URL) {
      return jsonResponse({ choices: [{ message: { content: "conduta de teste" } }] });
    }
    throw new Error("anthropic não deveria ser chamado");
  };

  await withServer(
    { env: { OPENAI_API_KEY: "sk-test", ANTHROPIC_API_KEY: "anth-test" }, fetchImpl },
    async ({ port, logs }) => {
      const res = await post(port, "/api/v1/ai/clinical", {
        messages: [{ role: "user", content: "nota de teste" }],
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.provider, "openai");
      assert.equal(body.mode, "live");
      assert.equal(body.response, "conduta de teste");
      assert.deepEqual(chamadas, [OPENAI_URL]);
      assert.ok(logs.some((linha) => linha === "[provider] openai"));
    },
  );
});

test("OpenAI que falha cai para o segundo provedor", async () => {
  const chamadas = [];
  const fetchImpl = async (url) => {
    chamadas.push(String(url));
    if (String(url) === OPENAI_URL) return jsonResponse({ error: { message: "falhou" } }, 500);
    if (String(url) === ANTHROPIC_URL) return jsonResponse({ content: [{ text: "fallback de teste" }] });
    throw new Error(`url inesperada ${url}`);
  };

  await withServer(
    { env: { OPENAI_API_KEY: "sk-test", ANTHROPIC_API_KEY: "anth-test" }, fetchImpl },
    async ({ port, logs }) => {
      const res = await post(port, "/api/v1/ai/clinical", {
        messages: [{ role: "user", content: "nota de teste" }],
      });
      const body = await res.json();
      assert.equal(body.provider, "anthropic");
      assert.equal(body.response, "fallback de teste");
      assert.deepEqual(chamadas, [OPENAI_URL, ANTHROPIC_URL]);
      assert.ok(logs.some((linha) => linha.startsWith("[openai]")));
      assert.ok(logs.includes("[provider] anthropic"));
    },
  );
});

test("sem chave, LLM_MOCK responde como OpenAI e não inventa paciente", async () => {
  let chamadas = 0;
  const fetchImpl = async () => {
    chamadas += 1;
    throw new Error("não deveria haver rede");
  };

  await withServer({ env: { LLM_MOCK: "1" }, fetchImpl }, async ({ port, logs }) => {
    const res = await post(port, "/api/v1/ai/clinical", {
      messages: [{ role: "user", content: "nota de teste sem paciente fictício" }],
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.provider, "openai");
    assert.equal(body.mode, "mock");
    assert.match(body.response, /nota de teste sem paciente fictício/);
    assert.equal(chamadas, 0);
    assert.ok(logs.some((linha) => linha.includes("[provider] openai")));
  });
});

test("sem provedor a resposta é erro, não texto clínico inventado", async () => {
  await withServer({ env: {} }, async ({ port }) => {
    const res = await post(port, "/api/v1/ai/clinical", {
      messages: [{ role: "user", content: "nota de teste" }],
    });
    const body = await res.json();
    assert.equal(res.status, 503);
    assert.equal(body.error, "provedor_indisponivel");
    assert.match(body.message, /Nada foi gerado/);
    assert.equal(JSON.stringify(body).includes("UpToDate"), false);
  });
});
