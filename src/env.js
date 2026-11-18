export function porta(value) {
  if (value === undefined || value === "") return 3463;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 65535) return 3463;
  return number;
}

export function hostDeEscuta(value) {
  if (value === undefined || value === "") return "0.0.0.0";
  return value;
}

/** Impede resposta falsa quando o processo está marcado como produção. */
export function erroDeProducao(env) {
  if (env.NODE_ENV === "production" && env.LLM_MOCK === "1") {
    return "LLM_MOCK=1 não sobe com NODE_ENV=production. Em produção deixe LLM_MOCK vazio.";
  }
  return null;
}

export function avisosDeAmbiente(env) {
  const avisos = [];
  if (env.LLM_MOCK === "1") {
    avisos.push("LLM_MOCK=1: respostas locais, sem provedor. Em produção deixe vazio.");
  }
  if (!env.OPENAI_API_KEY && env.LLM_MOCK !== "1") {
    avisos.push("OPENAI_API_KEY ausente.");
  }
  if (!env.SUPABASE_JWT_SECRET) {
    avisos.push("SUPABASE_JWT_SECRET ausente: o JWT não é verificado.");
  }
  if (!env.SUPABASE_URL) {
    avisos.push("SUPABASE_URL ausente.");
  }
  return avisos;
}
