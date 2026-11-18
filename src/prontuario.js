export const NAO_INFORMADO = "Não informado na nota.";

const CAMPOS = ["queixaPrincipal", "historia", "exameFisico", "hipoteses", "conduta", "cid"];

export function montarProntuario({ paciente = {}, campos, hoje }) {
  const nome = linha(paciente.nome) || "—";
  const idade = linha(paciente.idade) || "—";
  const sexo = linha(paciente.sexo) || "—";
  return `PRONTUÁRIO
Paciente: ${nome}   Idade: ${idade}   Sexo: ${sexo}
Data: ${hoje}

S — Subjetivo (Queixa / HMA):
${campos.queixaPrincipal}
${campos.historia}

O — Objetivo (Exame físico):
${campos.exameFisico}

A — Avaliação (Hipóteses):
${campos.hipoteses}
CID-10: ${campos.cid}

P — Plano (Conduta):
${campos.conduta}
`;
}

/** Ecoa a nota recebida. O que não está nela fica explícito, sem diagnóstico inventado. */
export function prontuarioDeNota(texto, paciente, hoje) {
  const nota = linha(texto);
  const campos = {
    queixaPrincipal: nota.slice(0, 280) || NAO_INFORMADO,
    historia: nota || NAO_INFORMADO,
    exameFisico: NAO_INFORMADO,
    hipoteses: NAO_INFORMADO,
    conduta: NAO_INFORMADO,
    cid: NAO_INFORMADO,
  };
  return { ...campos, full: montarProntuario({ paciente, campos, hoje }) };
}

export function prontuarioDoModelo(raw, paciente, hoje) {
  const obj = typeof raw === "string" ? JSON.parse(extrairJson(raw)) : raw;
  const campos = {};
  for (const campo of CAMPOS) campos[campo] = textoCampo(obj?.[campo]);
  return { ...campos, full: montarProntuario({ paciente, campos, hoje }) };
}

export function extrairJson(text) {
  const limpo = String(text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const inicio = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  if (inicio === -1 || fim <= inicio) throw new Error("json ausente");
  return limpo.slice(inicio, fim + 1);
}

function textoCampo(value) {
  if (typeof value !== "string") return NAO_INFORMADO;
  const texto = value.replace(/\s+/g, " ").trim();
  return texto || NAO_INFORMADO;
}

function linha(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").trim();
}
