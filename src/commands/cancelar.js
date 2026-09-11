import { enviarTelegram } from "../services/telegram.js";

export async function comandoCancelar(env, message) {
  const chatId = message.chat.id;
  const userId = message.from.id.toString();

  await env.KV_BOT_BANNERS.delete(
    `state_${userId}`
  );

  await enviarTelegram(
    env.TELEGRAM_TOKEN,
    "sendMessage",
    {
      chat_id: chatId,

      text:
        "❌ <b>Operação cancelada.</b>\n\n" +
        "O fluxo atual foi encerrado.",

      parse_mode: "HTML",

      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🏠 Voltar ao Painel",
              callback_data: "menu:inicio"
            }
          ]
        ]
      }
    }
  );
}
