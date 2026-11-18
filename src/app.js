import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";
import { medicoEnviado } from "./medico.js";
import { completarTexto, PROVEDOR_INDISPONIVEL, transcreverImagens, VISAO_INDISPONIVEL } from "./providers.js";
import { textoAtestado, textoPedidoExames, textoReceita } from "./documents.js";
import { prontuarioDeNota, prontuarioDoModelo } from "./prontuario.js";
import { imagensValidas, sbarDeTranscricao, sbarDoModelo } from "./sbar.js";

export function createApp({ env = process.env, fetchImpl = fetch, log } = {}) {
  const logger = log ?? { info: console.log, error: console.error };
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "20mb" }));

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

  app.post("/api/v1/prontuario/generate", requireAuth, async (req, res) => {
    const { texto, paciente = {} } = req.body ?? {};
    if (typeof texto !== "string" || !texto.trim()) {
      return res.status(400).json({ error: "nota_obrigatoria", message: "Envie a nota ou a transcrição da consulta." });
    }
    const nota = texto.trim();
    const data = hoje();
    const system = "Estruture a nota clínica em JSON com as chaves queixaPrincipal, historia, exameFisico, hipoteses, conduta e cid. Use somente o que está na nota. Se um campo não aparecer, use exatamente \"Não informado na nota.\". Não invente paciente, diagnóstico, exame ou conduta. Responda apenas o JSON.";
    const result = await completarTexto({
      env,
      fetchImpl,
      log: logger,
      system,
      messages: [{ role: "user", content: nota }],
      textoLocal: () => JSON.stringify(prontuarioDeNota(nota, paciente, data)),
    });
    if (!result) return res.status(503).json(PROVEDOR_INDISPONIVEL);
    try {
      const doc = prontuarioDoModelo(result.text, paciente, data);
      return res.json({ ...doc, provider: result.provider, mode: result.mode });
    } catch {
      return res.status(502).json({
        error: "resposta_invalida",
        message: "O serviço de IA devolveu um texto que não deu para organizar. Nada foi preenchido.",
      });
    }
  });

  app.post("/api/v1/sbar/photo", requireAuth, async (req, res) => {
    const imagens = imagensValidas(req.body?.images);
    if (!imagens.ok) return res.status(imagens.status).json(imagens.body);
    const result = await transcreverImagens({ env, fetchImpl, log: logger, images: imagens.images });
    if (!result?.text) return res.status(503).json(VISAO_INDISPONIVEL);
    return res.json({ transcript: result.text, provider: result.provider, mode: result.mode });
  });

  app.post("/api/v1/sbar/organize", requireAuth, async (req, res) => {
    const transcript = typeof req.body?.transcript === "string" ? req.body.transcript.trim() : "";
    if (!transcript) {
      return res.status(400).json({ error: "transcricao_obrigatoria", message: "Envie a transcrição antes de organizar a passagem." });
    }
    const system = "Organize a transcrição em JSON com as chaves situation, background, assessment e recommendation. Use somente o que está na transcrição. Se um campo não aparecer, use exatamente \"Não identificado na transcrição.\". Não invente paciente, diagnóstico ou conduta. Responda apenas o JSON.";
    const result = await completarTexto({
      env,
      fetchImpl,
      log: logger,
      system,
      messages: [{ role: "user", content: transcript }],
      textoLocal: () => JSON.stringify(sbarDeTranscricao(transcript)),
    });
    if (!result) return res.status(503).json(PROVEDOR_INDISPONIVEL);
    try {
      const sbar = sbarDoModelo(result.text, transcript);
      return res.json({ ...sbar, provider: result.provider, mode: result.mode });
    } catch {
      return res.status(502).json({
        error: "resposta_invalida",
        message: "O serviço de IA devolveu um texto que não deu para organizar. Nada foi preenchido.",
      });
    }
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
