# Publicar o gateway

O processo escuta `PORT` (vazio = 3463) e responde `GET /health`. O app chama `POST /api/v1/...` no mesmo host em que está aberto. Este runbook sobe o processo e encaminha só `/api/v1/*` para ele. Não grava segredo, domínio ou e-mail no git.

Nada daqui foi executado em produção. Quem for publicar escolhe uma forma de subir o processo e uma forma de proxy.

Variáveis de shell deste runbook (não vão para o git):

```bash
export REPO_URL="https://github.com/andreroederdelima-lang/openclaw-gateway.git"
export REPO_DIR="/opt/openclaw-gateway"
export ENV_FILE="/etc/openclaw-gateway.env"
export GATEWAY_PORT="3463"
export APP_ORIGIN="https://app.exemplo"
export GATEWAY_PUBLIC_ORIGIN="https://gateway.exemplo"
export GATEWAY_PUBLIC_HOST="gateway.exemplo"
export SUPABASE_ACCESS_TOKEN=""
```

`APP_ORIGIN` é o host do front. `GATEWAY_PUBLIC_ORIGIN` é um nome que já resolve na máquina do processo, com `https`, sem barra no final. Troque os exemplos antes de rodar. `SUPABASE_ACCESS_TOKEN` é o access token de uma sessão do projeto em `SUPABASE_URL`, não a senha. Não cole esse valor em arquivo do repositório.

## 1. Código e ambiente

```bash
sudo mkdir -p "$REPO_DIR"
sudo chown "$USER" "$REPO_DIR"
git clone "$REPO_URL" "$REPO_DIR"
cd "$REPO_DIR"
git checkout main
sudo install -m 600 .env.example "$ENV_FILE"
sudoedit "$ENV_FILE"
```

No arquivo de ambiente, preencha `PORT` com o mesmo valor de `GATEWAY_PORT`, `OPENAI_API_KEY`, `SUPABASE_URL` e `SUPABASE_JWT_SECRET`. Deixe `LLM_MOCK` vazio. `ANTHROPIC_API_KEY` pode ficar vazio. Confira que o segredo ficou fora do git:

```bash
sudo grep -E '^(PORT|LLM_MOCK|SUPABASE_URL)=' "$ENV_FILE"
git -C "$REPO_DIR" status --short
test ! -e "$REPO_DIR/.env"
```

O `grep` mostra a porta, o mock e a URL do projeto. Não imprime a chave.

## 2. Subir o processo

Use só um dos três. Os três leem `PORT` do ambiente. Com `NODE_ENV=production` e `LLM_MOCK=1` o processo encerra e não escuta.

### 2.a Docker

A imagem já traz `HEALTHCHECK` em `GET /health` (`scripts/healthcheck.mjs`). Dentro do container o processo escuta em `0.0.0.0`. No host a porta fica só em `127.0.0.1`.

```bash
cd "$REPO_DIR"
sudo docker build -t openclaw-gateway:local .
sudo docker rm -f openclaw-gateway >/dev/null 2>&1 || true
sudo docker run -d --name openclaw-gateway \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -p "127.0.0.1:${GATEWAY_PORT}:${GATEWAY_PORT}" \
  openclaw-gateway:local
```

Não defina `HOST=127.0.0.1` dentro do container: a porta publicada deixa de chegar no processo.

A CI deste repositório sobe essa imagem sem chave e espera o healthcheck ficar `healthy`. O comando é `bash scripts/container-health.sh`.

### 2.b systemd

```bash
sudo useradd --system --home "$REPO_DIR" --shell /usr/sbin/nologin openclaw || true
sudo chown -R openclaw:openclaw "$REPO_DIR"
sudo cp "$REPO_DIR/deploy/openclaw-gateway.service" /etc/systemd/system/openclaw-gateway.service
NODE_BIN="$(command -v node)"
test -n "$NODE_BIN"
sudo sed -i "s|^ExecStart=.*|ExecStart=${NODE_BIN} server.js|" /etc/systemd/system/openclaw-gateway.service
sudo systemctl daemon-reload
sudo systemctl enable --now openclaw-gateway
sudo systemctl status openclaw-gateway --no-pager
```

No arquivo de ambiente deste modo, `HOST=127.0.0.1` se o proxy estiver na mesma máquina.

### 2.c PM2

O `ecosystem.config.cjs` liga `NODE_ENV=production` e não carrega segredo. O resto vem do arquivo de ambiente.

O arquivo de ambiente foi criado com modo 600. Para o seu usuário ler:

```bash
sudo chgrp "$USER" "$ENV_FILE"
sudo chmod 640 "$ENV_FILE"
cd "$REPO_DIR"
npm ci --omit=dev
set -a
. "$ENV_FILE"
set +a
export NODE_ENV=production
export PORT="$GATEWAY_PORT"
pm2 start ecosystem.config.cjs --update-env
pm2 save
pm2 startup
```

Rode o comando que o `pm2 startup` imprimir. Não use Docker e PM2 ao mesmo tempo na mesma porta.

## 3. Health na máquina

```bash
curl -fsS "http://127.0.0.1:${GATEWAY_PORT}/health"
PORT="$GATEWAY_PORT" node "$REPO_DIR/scripts/healthcheck.mjs"
```

Resposta esperada: JSON com `"ok":true` e `"service":"openclaw-gateway"`. O script termina com código 0 e imprime `[health] ok`.

No Docker, o estado do `HEALTHCHECK` fica `healthy`:

```bash
sudo docker inspect -f '{{.State.Health.Status}}' openclaw-gateway
```

Se o público do gateway já existir:

```bash
curl -fsS "${GATEWAY_PUBLIC_ORIGIN}/health"
```

`/health` não passa pelo rewrite de `/api/v1/*`. O host do app continua sem essa rota.

## 4. Proxy de /api/v1/*

O front faz `POST /api/v1/ai/clinical` em `APP_ORIGIN`, com `Authorization: Bearer` do JWT do Supabase e corpo `{"messages":[{"role":"user","content":"..."}]}`. A resposta de sucesso é JSON com `response`, `mode` e `provider`. Com chave OpenAI e mock desligado, `provider` é `openai` e `mode` é `live`.

Escolha um proxy.

### 4.a Rewrite no projeto do app (Vercel)

O `vercel.json` do app já manda para `index.html` o que não começa com `api/`. `/api/v1` hoje não tem função e responde 404 da plataforma. O rewrite abaixo entra na frente e encaminha para o gateway. Vale para todos os hosts desse projeto.

No clone do app, com `GATEWAY_PUBLIC_ORIGIN` exportado:

```bash
python3 - <<'PY'
import json, os
origin = os.environ["GATEWAY_PUBLIC_ORIGIN"].rstrip("/")
path = os.environ.get("VERCEL_JSON", "vercel.json")
with open(path) as handle:
    data = json.load(handle)
rewrite = {"source": "/api/v1/:path*", "destination": origin + "/api/v1/:path*"}
rest = [item for item in data.get("rewrites", []) if item.get("source") != rewrite["source"]]
data["rewrites"] = [rewrite, *rest]
with open(path, "w") as handle:
    json.dump(data, handle, indent=2)
    handle.write("\n")
PY
git diff -- vercel.json
```

Confira o diff: a origem tem de ser o valor de `GATEWAY_PUBLIC_ORIGIN`, em `https`, e o arquivo não pode ter chave. Aí publique o app pelo fluxo normal desse repositório. Este repositório do gateway não faz esse deploy.

O rewrite não publica `GET /health` no host do app. O teste de saúde continua no processo e, se houver nome público, em `GATEWAY_PUBLIC_ORIGIN/health`.

### 4.b Caddy no host que já atende o gateway

Arquivo novo, sem substituir o Caddyfile inteiro se já existir outros sites:

```bash
sudo tee "/etc/caddy/Caddyfile.d/${GATEWAY_PUBLIC_HOST}.caddy" >/dev/null <<EOF
${GATEWAY_PUBLIC_HOST} {
  reverse_proxy 127.0.0.1:${GATEWAY_PORT}
}
EOF
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -fsS "${GATEWAY_PUBLIC_ORIGIN}/health"
```

Se o próprio `APP_ORIGIN` termina neste Caddy, acrescente o handle no site que já existe. `$APP_UPSTREAM` é o front atual. Não aponte os dois handles para o gateway.

```bash
export APP_HOST="${APP_HOST:?hostname de APP_ORIGIN}"
export APP_UPSTREAM="${APP_UPSTREAM:?origem do front}"
sudo tee /etc/caddy/Caddyfile.d/app-api.caddy >/dev/null <<EOF
${APP_HOST} {
  handle /api/v1/* {
    reverse_proxy 127.0.0.1:${GATEWAY_PORT}
  }
  handle {
    reverse_proxy ${APP_UPSTREAM}
  }
}
EOF
```

Não use este arquivo se o site do app já está em outro bloco com o mesmo hostname.

### 4.c Nginx

`proxy_pass` sem caminho no final preserva `/api/v1/...`.

Gateway com nome próprio (`/health` e `/api/v1` no processo):

```bash
sudo tee "/etc/nginx/sites-available/openclaw-gateway.conf" >/dev/null <<EOF
server {
  server_name ${GATEWAY_PUBLIC_HOST};
  location / {
    proxy_pass http://127.0.0.1:${GATEWAY_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header Authorization \$http_authorization;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF
sudo ln -sfn /etc/nginx/sites-available/openclaw-gateway.conf /etc/nginx/sites-enabled/openclaw-gateway.conf
```

No host do app, só o prefixo da API, dentro do `server` que já atende `APP_ORIGIN`:

```bash
sudo tee /etc/nginx/snippets/openclaw-api.conf >/dev/null <<EOF
location /api/v1/ {
  proxy_pass http://127.0.0.1:${GATEWAY_PORT};
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header Authorization \$http_authorization;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto \$scheme;
}
EOF
```

Inclua o snippet no `server` do app com `include /etc/nginx/snippets/openclaw-api.conf;` e recarregue:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5. Prova no domínio do app

Direto no processo (mock desligado, chave preenchida). Isto não passa pelo proxy:

```bash
curl -sS -D - -o /tmp/clinical-local.json \
  -X POST "http://127.0.0.1:${GATEWAY_PORT}/api/v1/ai/clinical" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Responda apenas: publicacao ok"}]}'
python3 -c 'import json; d=json.load(open("/tmp/clinical-local.json")); assert d["provider"]=="openai" and d["mode"]=="live" and d["response"]'
```

Pelo domínio do app, o mesmo corpo. HTTP 200 e o mesmo formato fecham o item. 404 é proxy ausente. 401 é JWT recusado ou header perdido no proxy. 503 é provedor sem resposta.

```bash
curl -sS -D - -o /tmp/clinical-app.json \
  -X POST "${APP_ORIGIN}/api/v1/ai/clinical" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Responda apenas: publicacao ok"}]}'
python3 -c 'import json; d=json.load(open("/tmp/clinical-app.json")); assert d["provider"]=="openai" and d["mode"]=="live" and isinstance(d["response"], str)'
rm -f /tmp/clinical-local.json /tmp/clinical-app.json
```

Não use texto de paciente real. Apague os JSON temporários, como no `rm` acima.

## 6. Reverter

Primeiro tire o proxy, para o app deixar de enviar tráfego. Depois pare o processo.

Rewrite do app: no clone do app,

```bash
python3 - <<'PY'
import json, os
path = os.environ.get("VERCEL_JSON", "vercel.json")
with open(path) as handle:
    data = json.load(handle)
data["rewrites"] = [item for item in data.get("rewrites", []) if item.get("source") != "/api/v1/:path*"]
with open(path, "w") as handle:
    json.dump(data, handle, indent=2)
    handle.write("\n")
PY
```

Publique de novo o app, ou promova o deployment anterior no painel. `/api/v1` volta a responder 404 da plataforma.

Caddy:

```bash
sudo rm -f "/etc/caddy/Caddyfile.d/${GATEWAY_PUBLIC_HOST}.caddy"
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Se o bloco entrou no Caddyfile do app, apague só o `handle /api/v1/*` e recarregue.

Nginx: apague o `location /api/v1/` ou o `server` do gateway, `sudo nginx -t` e `sudo systemctl reload nginx`.

Parar o processo (só o modo que foi usado):

```bash
sudo docker rm -f openclaw-gateway
sudo systemctl disable --now openclaw-gateway
pm2 delete openclaw-gateway
pm2 save
```

O arquivo `$ENV_FILE` pode ficar no disco, fora do git. Para removê-lo: `sudo shred -u "$ENV_FILE"` se o `shred` existir, ou `sudo rm -f "$ENV_FILE"`.
