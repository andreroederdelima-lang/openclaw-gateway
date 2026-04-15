import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3463;
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

// Auth middleware — verifies Supabase JWT
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "missing_token" });

  if (SUPABASE_JWT_SECRET) {
    try {
      const payload = jwt.verify(token, SUPABASE_JWT_SECRET);
      req.user = { id: payload.sub, email: payload.email, role: payload.role };
      return next();
    } catch (e) {
      return res.status(401).json({ error: "invalid_token", detail: e.message });
    }
  }
  // Fallback: decode without verification (dev only)
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}

// Health
app.get("/health", (_req, res) => res.json({ ok: true, service: "openclaw-gateway", version: "0.1.0" }));

// IA Clínica — chat endpoint for diagnostic support
app.post("/api/v1/ai/clinical", requireAuth, async (req, res) => {
  const { messages = [], context = {} } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages_required" });
  }

  const systemPrompt = `Você é um assistente clínico para médicos brasileiros. Forneça raciocínio clínico, diagnósticos diferenciais, condutas baseadas em evidência e interações medicamentosas. Sempre cite diretrizes quando possível (SBC, SBP, SBIM, Ministério da Saúde, UpToDate). NUNCA substitua o julgamento clínico — a decisão e responsabilidade são sempre do médico. Seja objetivo e direto.${context.patient ? `\n\nContexto: ${JSON.stringify(context.patient)}` : ""}`;

  // Prefer Anthropic if available
  if (ANTHROPIC_API_KEY) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: systemPrompt,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await r.json();
      if (data.error) {
        console.error("[anthropic] error:", data.error);
      } else {
        const response = data.content?.[0]?.text;
        if (response) return res.json({ response, mode: "live", provider: "anthropic" });
      }
    } catch (e) {
      console.error("[anthropic] exception:", e.message);
    }
  }

  // OpenAI fallback
  if (OPENAI_API_KEY) {
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          temperature: 0.3,
        }),
      });
      const data = await r.json();
      if (!data.error) {
        const response = data.choices?.[0]?.message?.content;
        if (response) return res.json({ response, mode: "live", provider: "openai" });
      } else {
        console.error("[openai] error:", data.error);
      }
    } catch (e) {
      console.error("[openai] exception:", e.message);
    }
  }

  // Stub
  res.json({
    response: "[Modo stub — nenhum provedor de IA está respondendo agora.]\n\nSua pergunta foi registrada. Para raciocínio clínico real, a IA acessará: SBC, SBP, SBIM, Bulário da Anvisa, UpToDate e seus protocolos locais. Sempre valide com evidência.",
    mode: "stub",
  });
});

// Documentos — gerar texto formatado de receita/atestado/pedido
app.post("/api/v1/documents/receita", requireAuth, (req, res) => {
  const { paciente, medicamentos = [], medico } = req.body;
  if (!paciente || medicamentos.length === 0) {
    return res.status(400).json({ error: "invalid_payload" });
  }
  const body = medicamentos
    .map((m, i) => `${i + 1}. ${m.nome} — ${m.posologia || "conforme orientação"}${m.observacao ? `\n   ${m.observacao}` : ""}`)
    .join("\n");

  const receita = `RECEITUÁRIO MÉDICO

Paciente: ${paciente.nome}${paciente.cpf ? `\nCPF: ${paciente.cpf}` : ""}${paciente.idade ? `\nIdade: ${paciente.idade}` : ""}

Prescrição:
${body}

${new Date().toLocaleDateString("pt-BR")}

${medico?.nome || "Dr. André Roeder de Lima"}
${medico?.crm || "CRM-SC 25.456"}
`;
  res.json({ document: receita, kind: "receita" });
});

app.post("/api/v1/documents/atestado", requireAuth, (req, res) => {
  const { paciente, dias, cid, periodo, medico } = req.body;
  if (!paciente?.nome || !dias) return res.status(400).json({ error: "invalid_payload" });
  const atestado = `ATESTADO MÉDICO

Atesto para os devidos fins que ${paciente.nome}${paciente.cpf ? `, portador(a) do CPF ${paciente.cpf}` : ""}, esteve sob meus cuidados médicos nesta data, necessitando de afastamento de suas atividades por ${dias} (${dias === 1 ? "um" : dias} dias)${periodo ? `, no período de ${periodo}` : ""}.

${cid ? `CID-10: ${cid}\n\n` : ""}${new Date().toLocaleDateString("pt-BR")}

${medico?.nome || "Dr. André Roeder de Lima"}
${medico?.crm || "CRM-SC 25.456"}
`;
  res.json({ document: atestado, kind: "atestado" });
});

app.post("/api/v1/documents/pedido-exames", requireAuth, (req, res) => {
  const { paciente, exames = [], hipotese, medico } = req.body;
  if (!paciente?.nome || exames.length === 0) return res.status(400).json({ error: "invalid_payload" });
  const pedido = `PEDIDO DE EXAMES

Paciente: ${paciente.nome}${paciente.cpf ? `\nCPF: ${paciente.cpf}` : ""}

Solicito:
${exames.map((e, i) => `${i + 1}. ${e}`).join("\n")}

${hipotese ? `Hipótese diagnóstica (CID): ${hipotese}\n\n` : ""}${new Date().toLocaleDateString("pt-BR")}

${medico?.nome || "Dr. André Roeder de Lima"}
${medico?.crm || "CRM-SC 25.456"}
`;
  res.json({ document: pedido, kind: "pedido-exames" });
});

// SBAR — format structured handoff
app.post("/api/v1/sbar/format", requireAuth, (req, res) => {
  const { situation, background, assessment, recommendation, patient } = req.body;
  const sbar = `PASSAGEM DE CASO — SBAR
${patient ? `Paciente: ${patient}\n\n` : ""}
S — SITUAÇÃO
${situation || "—"}

B — BACKGROUND / HISTÓRICO
${background || "—"}

A — AVALIAÇÃO
${assessment || "—"}

R — RECOMENDAÇÃO / CONDUTA
${recommendation || "—"}

${new Date().toLocaleString("pt-BR")}
`;
  res.json({ sbar });
});

// Bird ID signing intent — returns instructions (actual signing happens via Telegram bot for now)
app.post("/api/v1/documents/sign-intent", requireAuth, (req, res) => {
  const { document, kind } = req.body;
  res.json({
    intent_id: `intent_${Date.now()}`,
    instructions: "Para assinatura ICP-Brasil com Bird ID: 1) Envie o PDF ao bot @BirdIDSignerBot no Telegram, 2) Autorize com seu certificado Bird ID, 3) Receba o PDF assinado. A integração direta via API está sendo desenvolvida.",
    kind,
    document,
  });
});

app.listen(PORT, () => {
  console.log(`OpenClaw Gateway listening on :${PORT}`);
});
