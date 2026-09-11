import { editarTela } from "../services/telegram.js";

export async function handleHistoricoCallback(env, callback) {
  const data = callback.data;

  if (data === "historico:listar") {
    return mostrarHistorico(env, callback);
  }

  if (data === "historico:limpar") {
    await env.KV_BOT_BANNERS.delete("historico_envios");

    return editarTela(
      env.TELEGRAM_TOKEN,
      callback,
      "🗑 <b>Histórico apagado com sucesso.</b>",
      [[{ text: "⬅️ Histórico", callback_data: "menu:historico" }]]
    );
  }
}

export async function mostrarHistorico(env, callback) {
  const raw = await env.KV_BOT_BANNERS.get("historico_envios");
  let historico = [];

  if (raw) {
    try {
      historico = JSON.parse(raw);
    } catch {
      historico = [];
    }
  }

  if (historico.length === 0) {
    return editarTela(
      env.TELEGRAM_TOKEN,
      callback,
      "📜 <b>HISTÓRICO DE ENVIOS</b>\n\nNenhum disparo registrado ainda.",
      [[{ text: "⬅️ Painel", callback_data: "menu:inicio" }]]
    );
  }

  let texto = "📜 <b>HISTÓRICO DE ENVIOS</b>\n\n";

  historico.slice(0, 10).forEach((item, index) => {
    const dataFormatada = new Date(item.data).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo"
    });

    texto +=
      `<b>${index + 1}.</b> ${dataFormatada}\n` +
      `✅ ${item.sucessos} enviados\n` +
      `❌ ${item.erros} erros\n` +
      `👥 ${item.total} grupos\n\n`;
  });

  return editarTela(
    env.TELEGRAM_TOKEN,
    callback,
    texto,
    [
      [{ text: "🔄 Atualizar", callback_data: "historico:listar" }],
      [{ text: "🗑 Limpar Histórico", callback_data: "historico:limpar" }],
      [{ text: "⬅️ Painel", callback_data: "menu:inicio" }]
    ]
  );
}
