import { enviarTelegram } from "../services/telegram.js";
import { atualizarPainel } from "../services/panel.js";
import { apagarPrevia } from "../callbacks/disparo.js";

export async function comandoCancelar(env, message) {
  const chatId = message.chat.id;
  const userId = message.from.id.toString();
  const stateKey = `state_${userId}`;

  let state = null;
  let panelMessageId = null;

  const rawState =
    await env.KV_BOT_BANNERS.get(stateKey);

  if (rawState) {
    try {
      state = JSON.parse(rawState);
      panelMessageId =
        state?.panelMessageId || null;
    } catch {
      state = null;
      panelMessageId = null;
    }
  }

  // O próprio /cancelar também é informação de controle e
  // deve desaparecer do chat administrativo.
  if (message.message_id) {
    try {
      await enviarTelegram(
        env.TELEGRAM_TOKEN,
        "deleteMessage",
        {
          chat_id: chatId,
          message_id: message.message_id
        }
      );
    } catch {
      // Melhor esforço.
    }
  }

  if (state?.flow === "send") {
    await apagarPrevia(
      env,
      chatId,
      state
    );
  }

  await env.KV_BOT_BANNERS.delete(
    stateKey
  );

  const texto =
    "❌ <b>Operação cancelada.</b>\n\n" +
    "O fluxo atual foi encerrado.";

  const teclado = [
    [
      {
        text: "🏠 Voltar ao Painel",
        callback_data: "menu:inicio"
      }
    ]
  ];

  if (panelMessageId) {
    return atualizarPainel(
      env,
      chatId,
      panelMessageId,
      texto,
      teclado
    );
  }

  return enviarTelegram(
    env.TELEGRAM_TOKEN,
    "sendMessage",
    {
      chat_id: chatId,
      text: texto,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: teclado
      }
    }
  );
}
