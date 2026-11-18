import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";
import { medicoEnviado } from "./medico.js";
import { completarTexto, PROVEDOR_INDISPONIVEL } from "./providers.js";
import { textoAtestado, textoPedidoExames, textoReceita } from "./documents.js";

export function createApp({ env = process.env, fetchImpl = fetch, log } = {}) {
  const logger = log ?? { info: console.log, error: console.error };
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "10mb" }));

  const hoje = () => new Date().toLocaleDateString("pt-BR");

  function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "missing_token" });

    if (env.SUPABASE_JWT_SECRET) {
      try {
        const payload = jwt.verify(token, env.SUPABASE_JWT_SECRET);
        req.user = { id: payload.sub, email: payload.email, role: payload.role };
        return next();
      } catch (e) {
        return res.status(401).json({ error: "invalid_token", detail: e.message });
      }
    }

    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
      req.user = { id: payload.sub, email: payload.email, role: payload.role };
      return next();
    } catch {
      return res.status(401).json({ error: "invalid_token" });
    }
  }

  app.get("/health", (_req, res) => res.json({ ok: true, service: "openclaw-gateway", version: "0.2.0" }));

  app.post("/api/v1/ai/clinical", requireAuth, async (req, res) => {
    const { messages = [], context = {} } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages_required" });
    }

    const system = `Você é um assistente clínico para médicos brasileiros. Forneça raciocínio clínico, diagnósticos diferenciais, condutas baseadas em evidência e interações medicamentosas. Sempre cite diretrizes quando possível (SBC, SBP, SBIM, Ministério da Saúde, UpToDate). NUNCA substitua o julgamento clínico — a decisão e responsabilidade são sempre do médico. Seja objetivo e direto.${context.patient ? `\n\nContexto: ${JSON.stringify(context.patient)}` : ""}`;

    const result = await completarTexto({ env, fetchImpl, log: logger, system, messages });
    if (!result) return res.status(503).json(PROVEDOR_INDISPONIVEL);
    return res.json({ response: result.text, mode: result.mode, provider: result.provider });
  });

  app.post("/api/v1/documents/receita", requireAuth, (req, res) => {
    const { paciente, medicamentos = [], medico } = req.body ?? {};
    if (!paciente || medicamentos.length === 0) return res.status(400).json({ error: "invalid_payload" });
    const assinatura = medicoEnviado(medico);
    if (!assinatura.ok) return res.status(assinatura.status).json(assinatura.body);
    const document = textoReceita({ paciente, medicamentos, medico: assinatura.medico, hoje: hoje() });
    res.json({ document, kind: "receita" });
  });

  app.post("/api/v1/documents/atestado", requireAuth, (req, res) => {
    const { paciente, dias, cid, periodo, medico } = req.body ?? {};
    if (!paciente?.nome || !dias) return res.status(400).json({ error: "invalid_payload" });
    const assinatura = medicoEnviado(medico);
    if (!assinatura.ok) return res.status(assinatura.status).json(assinatura.body);
    const document = textoAtestado({
      paciente,
      dias,
      cid,
      periodo,
      medico: assinatura.medico,
      hoje: hoje(),
    });
    res.json({ document, kind: "atestado" });
  });

  app.post("/api/v1/documents/pedido-exames", requireAuth, (req, res) => {
    const { paciente, exames = [], hipotese, medico } = req.body ?? {};
    if (!paciente?.nome || exames.length === 0) return res.status(400).json({ error: "invalid_payload" });
    const assinatura = medicoEnviado(medico);
    if (!assinatura.ok) return res.status(assinatura.status).json(assinatura.body);
    const document = textoPedidoExames({
      paciente,
      exames,
      hipotese,
      medico: assinatura.medico,
      hoje: hoje(),
    });
    res.json({ document, kind: "pedido-exames" });
  });

  app.post("/api/v1/sbar/format", requireAuth, (req, res) => {
    const { situation, background, assessment, recommendation, patient } = req.body ?? {};
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

  app.post("/api/v1/documents/sign-intent", requireAuth, (req, res) => {
    const { document, kind } = req.body ?? {};
    res.json({
      intent_id: `intent_${Date.now()}`,
      instructions: "Para assinatura ICP-Brasil com Bird ID: 1) Envie o PDF ao bot @BirdIDSignerBot no Telegram, 2) Autorize com seu certificado Bird ID, 3) Receba o PDF assinado. A integração direta via API está sendo desenvolvida.",
      kind,
      document,
    });
  });

  return app;
}
