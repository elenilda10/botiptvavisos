import { enviarTelegram } from "../services/telegram.js";
import { LISTA_GRUPOS } from "../config/constants.js";

export async function comandoPainel(env, message) {
  const chatId = message.chat.id;
  const userId = message.from.id.toString();

  // Limpa qualquer operação anterior
  await env.KV_BOT_BANNERS.delete(
    `state_${userId}`
  );

  const totalGrupos = LISTA_GRUPOS.length;

  const texto =
    "🤖 <b>PAINEL ADMINISTRATIVO</b>\n\n" +

    "━━━━━━━━━━━━━━━━━━\n" +
    "📊 <b>Status do sistema</b>\n" +
    "━━━━━━━━━━━━━━━━━━\n\n" +

    `👥 Grupos: <b>${totalGrupos}</b>\n` +
    "🟢 Bot: <b>Online</b>\n\n" +

    "Escolha uma opção:";

  await enviarTelegram(
    env.TELEGRAM_TOKEN,
    "sendMessage",
    {
      chat_id: chatId,

      text: texto,

      parse_mode: "HTML",

      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📢 Novo Disparo",
              callback_data: "menu:disparo"
            }
          ],

          [
            {
              text: "👥 Gerenciar Grupos",
              callback_data: "menu:grupos"
            }
          ],

          [
            {
              text: "🖼 Banners",
              callback_data: "menu:banners"
            },
            {
              text: "📜 Histórico",
              callback_data: "menu:historico"
            }
          ],

          [
            {
              text: "⚙️ Configurações",
              callback_data: "menu:config"
            }
          ]
        ]
      }
    }
  );
}
