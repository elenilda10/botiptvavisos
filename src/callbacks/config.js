import {
  ADMINS_AUTORIZADOS,
  LISTA_GRUPOS
} from "../config/constants.js";

import { enviarTelegram } from "../services/telegram.js";

export async function handleConfigCallback(
  env,
  callback
) {
  const data = callback.data;
  const chatId = callback.message.chat.id;

  // ---------------------------------------------------------
  // MENU
  // ---------------------------------------------------------

  if (data === "config:menu") {
    return mostrarConfiguracoes(
      env,
      callback
    );
  }

  // ---------------------------------------------------------
  // STATUS
  // ---------------------------------------------------------

  if (data === "config:status") {
    await enviarTelegram(
      env.TELEGRAM_TOKEN,
      "sendMessage",
      {
        chat_id: chatId,

        text:
          "🟢 <b>STATUS DO SISTEMA</b>\n\n" +
          "🤖 Bot: <b>Online</b>\n" +
          `👥 Grupos: <b>${LISTA_GRUPOS.length}</b>\n` +
          `👤 Administradores: <b>${ADMINS_AUTORIZADOS.length}</b>\n` +
          "💾 KV: <b>Ativo</b>\n" +
          "📡 Telegram API: <b>Configurada</b>",

        parse_mode: "HTML",

        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "⬅️ Voltar",
                callback_data: "menu:config"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  // ---------------------------------------------------------
  // ADMINS
  // ---------------------------------------------------------

  if (data === "config:admins") {
    let texto =
      "👤 <b>ADMINISTRADORES</b>\n\n";

    ADMINS_AUTORIZADOS.forEach(
      (admin, index) => {
        texto +=
          `${index + 1}. <code>${admin}</code>\n`;
      }
    );

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
                text: "⬅️ Voltar",
                callback_data: "menu:config"
              }
            ]
          ]
        }
      }
    );
  }
}

// -------------------------------------------------------------
// MENU CONFIGURAÇÕES
// -------------------------------------------------------------

export async function mostrarConfiguracoes(
  env,
  callback
) {
  const chatId = callback.message.chat.id;

  await enviarTelegram(
    env.TELEGRAM_TOKEN,
    "sendMessage",
    {
      chat_id: chatId,

      text:
        "⚙️ <b>CONFIGURAÇÕES</b>\n\n" +
        "Escolha uma opção:",

      parse_mode: "HTML",

      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🟢 Status do Sistema",
              callback_data: "config:status"
            }
          ],
          [
            {
              text: "👤 Administradores",
              callback_data: "config:admins"
            }
          ],
          [
            {
              text: "⬅️ Painel",
              callback_data: "menu:inicio"
            }
          ]
        ]
      }
    }
  );
}
