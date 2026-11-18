import { createApp } from "./src/app.js";

const app = createApp({ env: process.env });
const port = porta(process.env.PORT);

function porta(value) {
  if (value === undefined || value === "") return 3463;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 65535) return 3463;
  return number;
}
const server = app.listen(port, () => {
  const address = server.address();
  const actual = typeof address === "object" && address ? address.port : port;
  console.log(`[gateway] listening port=${actual}`);
});
