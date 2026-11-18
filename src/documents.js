export function textoReceita({ paciente, medicamentos, medico, hoje }) {
  const body = medicamentos
    .map((m, i) => `${i + 1}. ${m.nome} — ${m.posologia || "conforme orientação"}${m.observacao ? `\n   ${m.observacao}` : ""}`)
    .join("\n");
  return `RECEITUÁRIO MÉDICO

Paciente: ${paciente.nome}${paciente.cpf ? `\nCPF: ${paciente.cpf}` : ""}${paciente.idade ? `\nIdade: ${paciente.idade}` : ""}

Prescrição:
${body}

${hoje}

${medico.nome}
${medico.crm}
`;
}

export function textoAtestado({ paciente, dias, cid, periodo, medico, hoje }) {
  return `ATESTADO MÉDICO

Atesto para os devidos fins que ${paciente.nome}${paciente.cpf ? `, portador(a) do CPF ${paciente.cpf}` : ""}, esteve sob meus cuidados médicos nesta data, necessitando de afastamento de suas atividades por ${dias} (${dias === 1 ? "um" : dias} dias)${periodo ? `, no período de ${periodo}` : ""}.

${cid ? `CID-10: ${cid}\n\n` : ""}${hoje}

${medico.nome}
${medico.crm}
`;
}

export function textoPedidoExames({ paciente, exames, hipotese, medico, hoje }) {
  return `PEDIDO DE EXAMES

Paciente: ${paciente.nome}${paciente.cpf ? `\nCPF: ${paciente.cpf}` : ""}

Solicito:
${exames.map((e, i) => `${i + 1}. ${e}`).join("\n")}

${hipotese ? `Hipótese diagnóstica (CID): ${hipotese}\n\n` : ""}${hoje}

${medico.nome}
${medico.crm}
`;
}
