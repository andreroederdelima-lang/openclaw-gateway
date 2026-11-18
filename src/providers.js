const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/** OpenAI primeiro. Anthropic só se a chamada OpenAI não responder. */
export function ordemProvedores(env) {
  const ordem = [];
  if (env.LLM_MOCK === "1" || env.OPENAI_API_KEY) ordem.push("openai");
  if (env.ANTHROPIC_API_KEY) ordem.push("anthropic");
  return ordem;
}

export function textoMock(messages) {
  const last = [...messages].reverse().find((m) => m && m.role === "user" && typeof m.content === "string");
  const entrada = (last?.content ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
  if (!entrada) return "Resposta de teste (provedor local). Nenhum texto foi recebido.";
  return `Resposta de teste (provedor local). Texto recebido: ${entrada}`;
}

/**
 * @returns {Promise<{ provider: "openai" | "anthropic", mode: "live" | "mock", text: string } | null>}
 */
export async function completarTexto({ env, fetchImpl, log, system, messages, textoLocal }) {
  const logger = log ?? { info() {}, error() {} };
  for (const provider of ordemProvedores(env)) {
    try {
      if (provider === "openai" && env.LLM_MOCK === "1") {
        logger.info("[provider] openai mode=mock");
        return { provider: "openai", mode: "mock", text: textoLocal ? textoLocal(messages) : textoMock(messages) };
      }
      const text = provider === "openai"
        ? await chamarOpenAI({ env, fetchImpl, system, messages })
        : await chamarAnthropic({ env, fetchImpl, system, messages });
      logger.info(`[provider] ${provider}`);
      return { provider, mode: "live", text };
    } catch (e) {
      logger.error(`[${provider}] ${e.message}`);
    }
  }
  return null;
}

async function chamarOpenAI({ env, fetchImpl, system, messages }) {
  const response = await fetchImpl(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `http ${response.status}`);
  }
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("resposta vazia");
  return text;
}

async function chamarAnthropic({ env, fetchImpl, system, messages }) {
  const response = await fetchImpl(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `http ${response.status}`);
  }
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("resposta vazia");
  return text;
}

export async function transcreverImagens({ env, fetchImpl, log, images }) {
  const logger = log ?? { info() {}, error() {} };
  if (env.LLM_MOCK === "1" || !env.OPENAI_API_KEY) return null;
  try {
    const text = await chamarOpenAI({
      env,
      fetchImpl,
      system: "Transcreva somente o texto visível nas imagens, em português. Não complete trechos ilegíveis e não invente paciente, diagnóstico ou conduta. Se não houver texto legível, responda apenas: Não foi possível ler a imagem.",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Transcreva as anotações destas imagens." },
          ...images.map((img) => ({
            type: "image_url",
            image_url: { url: `data:${img.mediaType};base64,${img.data}` },
          })),
        ],
      }],
    });
    logger.info("[provider] openai");
    return { provider: "openai", mode: "live", text: text.trim() };
  } catch (e) {
    logger.error(`[openai] ${e.message}`);
    return null;
  }
}

export const PROVEDOR_INDISPONIVEL = {
  error: "provedor_indisponivel",
  message: "O serviço de IA não respondeu. Nada foi gerado.",
};

export const VISAO_INDISPONIVEL = {
  error: "visao_indisponivel",
  message: "A leitura da imagem precisa do provedor de IA. Nada foi transcrito.",
};
