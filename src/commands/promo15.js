import { enviarTelegram } from "../services/telegram.js";
import { LISTA_GRUPOS } from "../config/constants.js";

function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

export async function comandoPromo15(env, message) {
  const chatId = message.chat.id;

  const foto =
    "https://i.ibb.co/XfD93hhG/file-7.jpg";

  const legenda =
    "⚡ ENTRETENIMENTO POR APENAS R$1 POR DIA!\n\n" +
    "📺 São 15 dias de acesso por apenas R$15.\n\n" +
    "💰 R$1 por dia. Simples, econômico e flexível.\n\n" +
    "👉 Chama no privado!";

  await enviarTelegram(
    env.TELEGRAM_TOKEN,
    "sendMessage",
    {
      chat_id: chatId,

      text:
        "🚀 <b>Iniciando promoção /15...</b>\n\n" +
        `👥 Destinos: <b>${LISTA_GRUPOS.length}</b>`,

      parse_mode: "HTML"
    }
  );

  let sucessos = 0;
  let erros = 0;

  for (const grupoId of LISTA_GRUPOS) {
    try {
      await enviarTelegram(
        env.TELEGRAM_TOKEN,
        "sendPhoto",
        {
          chat_id: grupoId,
          photo: foto,
          caption: legenda,
          parse_mode: "HTML",

          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "👉 Chama no privado!",
                  url: "https://t.me/Admmachine"
                }
              ]
            ]
          }
        }
      );

      sucessos++;
    } catch (error) {
      erros++;

      console.error(
        `[PROMO15] Erro no grupo ${grupoId}:`,
        error
      );
    }

    await sleep(1500);
  }

  await enviarTelegram(
    env.TELEGRAM_TOKEN,
    "sendMessage",
    {
      chat_id: chatId,

      text:
        "✅ <b>Promoção /15 finalizada.</b>\n\n" +
        `✅ Sucessos: <b>${sucessos}</b>\n` +
        `❌ Erros: <b>${erros}</b>`,

      parse_mode: "HTML",

      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🏠 Painel",
              callback_data: "menu:inicio"
            }
          ]
        ]
      }
    }
  );
}
