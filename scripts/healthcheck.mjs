const port = process.env.PORT || "3463";
const host = process.env.HEALTHCHECK_HOST || "127.0.0.1";
const url = `http://${host}:${port}/health`;

try {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok || body?.ok !== true || body?.service !== "openclaw-gateway") {
    console.error(`[health] falhou ${response.status} ${url}`);
    process.exit(1);
  }
  console.log(`[health] ok ${url}`);
} catch (error) {
  console.error(`[health] ${url} ${error.message}`);
  process.exit(1);
}
