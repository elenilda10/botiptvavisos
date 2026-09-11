import { enviarTelegram } from "./telegram.js";

export async function atualizarPainel(env, chatId, messageId, texto, teclado) {
  if (!messageId) {
    return enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: texto,
      parse_mode: "HTML",
      reply_markup: teclado ? { inline_keyboard: teclado } : undefined
    });
  }

  try {
    return await enviarTelegram(env.TELEGRAM_TOKEN, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: texto,
      parse_mode: "HTML",
      reply_markup: teclado ? { inline_keyboard: teclado } : undefined
    });
  } catch (error) {
    if (error.message?.includes("message is not modified")) return null;
    throw error;
  }
}

export function painelMessageId(state, message) {
  return state?.panelMessageId || message?.message_id || null;
}
