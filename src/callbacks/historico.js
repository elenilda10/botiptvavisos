import { enviarTelegram } from "../services/telegram.js";

export async function handleHistoricoCallback(
  env,
  callback
) {
  const data = callback.data;

  if (data === "historico:listar") {
    return mostrarHistorico(env, callback);
  }

  if (data === "historico:limpar") {
    await env.KV_BOT_BANNERS.delete(
      "historico_envios"
    );

    await enviarTelegram(
      env.TELEGRAM_TOKEN,
      "sendMessage",
      {
        chat_id: callback.message.chat.id,

        text:
          "🗑 <b>Histórico apagado com sucesso.</b>",

        parse_mode: "HTML",

        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "⬅️ Histórico",
                callback_data: "menu:historico"
              }
            ]
          ]
        }
      }
    );
  }
}

// -------------------------------------------------------------
// MOSTRAR HISTÓRICO
// -------------------------------------------------------------

export async function mostrarHistorico(
  env,
  callback
) {
  const chatId = callback.message.chat.id;

  const raw =
    await env.KV_BOT_BANNERS.get(
      "historico_envios"
    );

  let historico = [];

  if (raw) {
    try {
      historico = JSON.parse(raw);
    } catch {
      historico = [];
    }
  }

  if (historico.length === 0) {
    await enviarTelegram(
      env.TELEGRAM_TOKEN,
      "sendMessage",
      {
        chat_id: chatId,

        text:
          "📜 <b>HISTÓRICO DE ENVIOS</b>\n\n" +
          "Nenhum disparo registrado ainda.",

        parse_mode: "HTML",

        reply_markup: {
          inline_keyboard: [
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

  let texto =
    "📜 <b>HISTÓRICO DE ENVIOS</b>\n\n";

  historico
    .slice(0, 10)
    .forEach((item, index) => {
      const dataFormatada =
        new Date(item.data).toLocaleString(
          "pt-BR",
          {
            timeZone: "America/Sao_Paulo"
          }
        );

      texto +=
        `<b>${index + 1}.</b> ${dataFormatada}\n` +
        `✅ ${item.sucessos} enviados\n` +
        `❌ ${item.erros} erros\n` +
        `👥 ${item.total} grupos\n\n`;
    });

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
              text: "🔄 Atualizar",
              callback_data: "historico:listar"
            }
          ],
          [
            {
              text: "🗑 Limpar Histórico",
              callback_data: "historico:limpar"
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
