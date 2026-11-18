/** Nome e CRM vêm do corpo enviado pelo app. Não existe profissional padrão. */
export function medicoEnviado(medico) {
  const nome = linha(medico?.nome);
  const crm = linha(medico?.crm);
  if (!nome || !crm) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "medico_obrigatorio",
        message: "Informe o nome e o CRM do médico. O documento não usa um profissional padrão.",
      },
    };
  }
  return { ok: true, medico: { nome, crm } };
}

function linha(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").trim();
}
