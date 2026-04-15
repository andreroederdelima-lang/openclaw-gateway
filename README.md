# OpenClaw Gateway

HTTP API multi-tenant que expõe capacidades do OpenClaw para a plataforma Ordem Plena Medical.

## Endpoints

Todos os endpoints requerem `Authorization: Bearer <supabase_jwt>`.

- `GET /health` — status público
- `POST /api/v1/ai/clinical` — IA de suporte clínico (Claude Haiku / OpenAI fallback)
- `POST /api/v1/documents/receita` — gera texto de receita médica
- `POST /api/v1/documents/atestado` — gera atestado
- `POST /api/v1/documents/pedido-exames` — gera pedido de exames
- `POST /api/v1/documents/sign-intent` — instruções para assinatura Bird ID ICP-Brasil
- `POST /api/v1/sbar/format` — formata passagem de caso SBAR

## Deploy

PM2 na VPS (porta 3463), exposto publicamente via proxy em `https://medical.ordemplena.com/api/v1/*`.

## Env

```
PORT=3463
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...   # fallback
SUPABASE_JWT_SECRET= # opcional — sem ele, JWT é decodificado sem verificação (dev)
```
