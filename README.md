# OpenClaw Gateway

HTTP API multi-tenant que expõe capacidades do OpenClaw para a plataforma Ordem Plena Medical.

## Endpoints

Todos os endpoints requerem `Authorization: Bearer <supabase_jwt>`.

- `GET /health` — status público
- `POST /api/v1/ai/clinical` — IA de suporte clínico (OpenAI primeiro; o segundo provedor só entra se o OpenAI não responder)
- `POST /api/v1/documents/receita` — gera texto de receita médica
- `POST /api/v1/documents/atestado` — gera atestado
- `POST /api/v1/documents/pedido-exames` — gera pedido de exames
- `POST /api/v1/documents/sign-intent` — instruções para assinatura Bird ID ICP-Brasil
- `POST /api/v1/sbar/format` — formata passagem de caso SBAR

## Deploy

PM2 na VPS (`PORT` ou 3463). O proxy do app encaminha `/api/v1/*` para esse processo. O host do proxy fica na configuração do ambiente.

Receita, atestado e pedido de exames exigem `medico.nome` e `medico.crm` no corpo. Não há profissional padrão.

## Env

```
PORT=3463
OPENAI_API_KEY=...        # provedor principal
ANTHROPIC_API_KEY=...     # só se o OpenAI não responder
LLM_MOCK=1                # só em teste local, sem chave e sem rede
SUPABASE_JWT_SECRET=      # opcional — sem ele, JWT é decodificado sem verificação (dev)
```
