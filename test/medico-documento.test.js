import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { post, withServer } from "./helpers.js";

const MEDICO_A = { nome: "Dra. Teste Alfa", crm: "111111/MG" };
const MEDICO_B = { nome: "Dr. Teste Beta", crm: "222222/RJ" };
const PROIBIDO = ["Roeder", "25.456"];

test("receita, atestado e pedido usam o nome e o CRM enviados", async () => {
  await withServer({ env: {} }, async ({ port }) => {
    const receita = await post(port, "/api/v1/documents/receita", {
      paciente: { nome: "Paciente Um" },
      medicamentos: [{ nome: "Dipirona 500mg", posologia: "1 comp a cada 6h" }],
      medico: MEDICO_A,
    });
    const receitaBody = await receita.json();
    assert.equal(receita.status, 200);
    assert.match(receitaBody.document, /Dra\. Teste Alfa/);
    assert.match(receitaBody.document, /111111\/MG/);

    const outro = await post(port, "/api/v1/documents/receita", {
      paciente: { nome: "Paciente Dois" },
      medicamentos: [{ nome: "Soro", posologia: "conforme orientação" }],
      medico: MEDICO_B,
    });
    const outroBody = await outro.json();
    assert.match(outroBody.document, /Dr\. Teste Beta/);
    assert.match(outroBody.document, /222222\/RJ/);
    assert.doesNotMatch(outroBody.document, /111111\/MG/);

    const atestado = await post(port, "/api/v1/documents/atestado", {
      paciente: { nome: "Paciente Um" },
      dias: 2,
      medico: MEDICO_B,
    });
    const atestadoBody = await atestado.json();
    assert.match(atestadoBody.document, /Dr\. Teste Beta/);
    assert.match(atestadoBody.document, /222222\/RJ/);

    const pedido = await post(port, "/api/v1/documents/pedido-exames", {
      paciente: { nome: "Paciente Um" },
      exames: ["Hemograma"],
      medico: MEDICO_A,
    });
    const pedidoBody = await pedido.json();
    assert.match(pedidoBody.document, /Dra\. Teste Alfa/);
    assert.match(pedidoBody.document, /111111\/MG/);
  });
});

test("sem nome ou CRM o documento não sai e não há profissional padrão", async () => {
  await withServer({ env: {} }, async ({ port }) => {
    for (const medico of [undefined, {}, { nome: "Sem CRM" }, { crm: "123/SP" }, { nome: "  ", crm: "123/SP" }]) {
      const res = await post(port, "/api/v1/documents/receita", {
        paciente: { nome: "Paciente Um" },
        medicamentos: [{ nome: "Dipirona" }],
        medico,
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.error, "medico_obrigatorio");
      assert.match(body.message, /não usa um profissional padrão/);
      const serializado = JSON.stringify(body);
      for (const trecho of PROIBIDO) assert.equal(serializado.includes(trecho), false);
    }
  });
});

test("o código do gateway não traz médico fixo", () => {
  const raiz = new URL("..", import.meta.url).pathname;
  const arquivos = [];
  function visitar(dir) {
    for (const nome of readdirSync(dir)) {
      if (nome === "node_modules" || nome === "test") continue;
      const caminho = join(dir, nome);
      const info = statSync(caminho);
      if (info.isDirectory()) visitar(caminho);
      else if (/\.(js|md|json)$/.test(nome)) arquivos.push(caminho);
    }
  }
  visitar(raiz);
  const fontes = arquivos.map((arquivo) => readFileSync(arquivo, "utf8")).join("\n");
  for (const trecho of PROIBIDO) {
    assert.equal(fontes.includes(trecho), false, trecho);
  }
});
