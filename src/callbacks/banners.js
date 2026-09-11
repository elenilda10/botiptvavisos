import { enviarTelegram } from "../services/telegram.js";

export async function handleBannersCallback(env, callback) {
  const data = callback.data;
  const chatId = callback.message.chat.id;

  if (data === "banner:menu") {
    return mostrarMenuBanners(env, callback);
  }

  if (data === "banner:status") {
    const ultimo =
      (await env.KV_BOT_BANNERS.get(
        "ultimo_banner"
      )) || "nenhum";

    await enviarTelegram(
      env.TELEGRAM_TOKEN,
      "sendMessage",
      {
        chat_id: chatId,

        text:
          "📊 <b>STATUS DOS BANNERS</b>\n\n" +
          `Último banner enviado: <b>${ultimo}</b>\n\n` +
          "🕗 Horário automático: <b>20:00</b>\n" +
          "🌎 Fuso: <b>Brasília</b>",

        parse_mode: "HTML",

        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "⬅️ Voltar",
                callback_data: "menu:banners"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  if (data === "banner:reset") {
    await env.KV_BOT_BANNERS.delete(
      "ultimo_banner"
    );

    await enviarTelegram(
      env.TELEGRAM_TOKEN,
      "sendMessage",
      {
        chat_id: chatId,

        text:
          "🔄 <b>Alternância dos banners resetada.</b>\n\n" +
          "O próximo disparo começará novamente pelo Banner 1.",

        parse_mode: "HTML",

        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "⬅️ Voltar",
                callback_data: "menu:banners"
              }
            ]
          ]
        }
      }
    );
  }
}

// -------------------------------------------------------------
// MENU BANNERS
// -------------------------------------------------------------

export async function mostrarMenuBanners(env, callback) {
  const chatId = callback.message.chat.id;

  const ultimo =
    (await env.KV_BOT_BANNERS.get(
      "ultimo_banner"
    )) || "Nenhum";

  await enviarTelegram(
    env.TELEGRAM_TOKEN,
    "sendMessage",
    {
      chat_id: chatId,

      text:
        "🖼 <b>BANNERS AUTOMÁTICOS</b>\n\n" +
        "━━━━━━━━━━━━━━━━━━\n" +
        "⏰ Horário: <b>20:00</b>\n" +
        `🔄 Último banner: <b>${ultimo}</b>\n` +
        "━━━━━━━━━━━━━━━━━━\n\n" +
        "Gerencie os banners automáticos abaixo:",

      parse_mode: "HTML",

      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📊 Status",
              callback_data: "banner:status"
            }
          ],
          [
            {
              text: "🔄 Resetar Alternância",
              callback_data: "banner:reset"
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
