import { enviarTelegram } from "../services/telegram.js";
import { atualizarPainel } from "../services/panel.js";

export async function comandoCancelar(env, message) {
  const chatId = message.chat.id;
  const userId = message.from.id.toString();
  const stateKey = `state_${userId}`;

  let panelMessageId = null;
  const rawState = await env.KV_BOT_BANNERS.get(stateKey);

  if (rawState) {
    try {
      panelMessageId = JSON.parse(rawState)?.panelMessageId || null;
    } catch {
      panelMessageId = null;
    }
  }

  await env.KV_BOT_BANNERS.delete(stateKey);

  const texto =
    "❌ <b>Operação cancelada.</b>\n\n" +
    "O fluxo atual foi encerrado.";

  const teclado = [
    [{ text: "🏠 Voltar ao Painel", callback_data: "menu:inicio" }]
  ];

  if (panelMessageId) {
    return atualizarPainel(env, chatId, panelMessageId, texto, teclado);
  }

  return enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
    chat_id: chatId,
    text: texto,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: teclado }
  });
}
