import { createApp } from "./src/app.js";
import { avisosDeAmbiente, erroDeProducao, hostDeEscuta, porta } from "./src/env.js";

const bloqueio = erroDeProducao(process.env);
if (bloqueio) {
  console.error(`[gateway] ${bloqueio}`);
  process.exit(1);
}

for (const aviso of avisosDeAmbiente(process.env)) {
  console.error(`[gateway] ${aviso}`);
}

const app = createApp({ env: process.env });
const port = porta(process.env.PORT);
const host = hostDeEscuta(process.env.HOST);
const server = app.listen(port, host, () => {
  const address = server.address();
  const actual = typeof address === "object" && address ? address.port : port;
  console.log(`[gateway] listening port=${actual} host=${host}`);
});
