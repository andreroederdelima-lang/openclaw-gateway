import { extrairJson } from "./prontuario.js";

export const NAO_IDENTIFICADO = "Não identificado na transcrição.";

export function imagensValidas(images) {
  if (!Array.isArray(images) || images.length === 0) {
    return { ok: false, status: 400, body: { error: "imagem_obrigatoria", message: "Envie ao menos uma foto." } };
  }
  if (images.length > 4) {
    return { ok: false, status: 400, body: { error: "muitas_imagens", message: "Envie no máximo 4 fotos por vez." } };
  }
  const lista = [];
  for (const img of images) {
    const mediaType = typeof img?.mediaType === "string" ? img.mediaType.trim().toLowerCase() : "";
    const data = typeof img?.data === "string" ? img.data.replace(/\s+/g, "") : "";
    if (!mediaType.startsWith("image/") || data.length < 16 || !/^[a-z0-9+/=]+$/i.test(data)) {
      return { ok: false, status: 400, body: { error: "imagem_invalida", message: "Não foi possível ler a imagem enviada." } };
    }
    lista.push({ mediaType, data });
  }
  return { ok: true, images: lista };
}

export function sbarDeTranscricao(transcript) {
  const texto = typeof transcript === "string" ? transcript.trim() : "";
  return {
    situation: texto,
    background: NAO_IDENTIFICADO,
    assessment: NAO_IDENTIFICADO,
    recommendation: NAO_IDENTIFICADO,
  };
}

export function sbarDoModelo(raw, transcript) {
  const obj = typeof raw === "string" ? JSON.parse(extrairJson(raw)) : raw;
  const base = sbarDeTranscricao(transcript);
  return {
    situation: texto(obj?.situation) || base.situation,
    background: texto(obj?.background) || base.background,
    assessment: texto(obj?.assessment) || base.assessment,
    recommendation: texto(obj?.recommendation) || base.recommendation,
  };
}

function texto(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}
