import { comandoPainel } from "../commands/painel.js";
import { enviarTelegram } from "../services/telegram.js";

import { mostrarMenuGrupos } from "./grupos.js";
import { mostrarMenuBanners } from "./banners.js";
import { mostrarHistorico } from "./historico.js";
import { mostrarConfiguracoes } from "./config.js";

export async function handleMenuCallback(env, callback) {
  const data = callback.data;
  const chatId = callback.message.chat.id;
  const userId = callback.from.id.toString();

  // ---------------------------------------------------------
  // PAINEL PRINCIPAL
  // ---------------------------------------------------------

  if (data === "menu:inicio") {
    return comandoPainel(env, callback.message);
  }

  // ---------------------------------------------------------
  // NOVO DISPARO
  // ---------------------------------------------------------

  if (data === "menu:disparo") {
    await env.KV_BOT_BANNERS.put(
      `state_${userId}`,
      JSON.stringify({
        step: "WAITING_MEDIA"
      }),
      {
        expirationTtl: 3600
      }
    );

    await enviarTelegram(
      env.TELEGRAM_TOKEN,
      "sendMessage",
      {
        chat_id: chatId,

        text:
          "📢 <b>NOVO DISPARO</b>\n\n" +
          "━━━━━━━━━━━━━━━━━━\n" +
          "📸 <b>Envie o conteúdo</b>\n" +
          "━━━━━━━━━━━━━━━━━━\n\n" +
          "Você pode enviar:\n\n" +
          "📝 Texto\n" +
          "🖼 Foto\n" +
          "🎥 Vídeo\n" +
          "🎞 GIF / Animação\n\n" +
          "Depois que o conteúdo for recebido, você poderá escolher os botões e confirmar o disparo.",

        parse_mode: "HTML",

        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "❌ Cancelar",
                callback_data: "disparo:cancelar"
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

    return;
  }

  // ---------------------------------------------------------
  // GRUPOS
  // ---------------------------------------------------------

  if (data === "menu:grupos") {
    return mostrarMenuGrupos(env, callback);
  }

  // ---------------------------------------------------------
  // BANNERS
  // ---------------------------------------------------------

  if (data === "menu:banners") {
    return mostrarMenuBanners(env, callback);
  }

  // ---------------------------------------------------------
  // HISTÓRICO
  // ---------------------------------------------------------

  if (data === "menu:historico") {
    return mostrarHistorico(env, callback);
  }

  // ---------------------------------------------------------
  // CONFIGURAÇÕES
  // ---------------------------------------------------------

  if (data === "menu:config") {
    return mostrarConfiguracoes(env, callback);
  }
}
