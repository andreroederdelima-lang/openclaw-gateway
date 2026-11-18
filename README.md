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
- `POST /api/v1/sbar/format` — formata passagem de caso SBAR já separada
- `POST /api/v1/prontuario/generate` — estrutura uma nota em prontuário
- `POST /api/v1/sbar/photo` — transcreve fotos de anotação
- `POST /api/v1/sbar/organize` — organiza uma transcrição em SBAR

## Deploy

O passo a passo copiável está em `docs/DEPLOY.md`. Há Dockerfile com healthcheck, unidade systemd e PM2. A porta sai de `PORT`. O proxy do app encaminha só `/api/v1/*`. Domínio e segredo ficam fora do git.

Receita, atestado e pedido de exames exigem `medico.nome` e `medico.crm` no corpo. Não há profissional padrão.

## Env

A lista fechada, sem valores, está em `.env.example`. Em produção `LLM_MOCK` fica vazio. Com `NODE_ENV=production` e `LLM_MOCK=1` o processo não sobe.
