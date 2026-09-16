import { enviarTelegram } from "../services/telegram.js";

export async function comandoSend(env, message) {
  const chatId = message.chat.id;
  const userId = message.from.id.toString();

  // Mantém o chat administrativo limpo: apaga o /send enviado pelo usuário.
  try {
    await enviarTelegram(env.TELEGRAM_TOKEN, "deleteMessage", {
      chat_id: chatId,
      message_id: message.message_id
    });
  } catch (error) {
    console.warn("[DISPARO] Não foi possível apagar /send:", error.message || error);
  }

  const painel = await enviarTelegram(
    env.TELEGRAM_TOKEN,
    "sendMessage",
    {
      chat_id: chatId,
      text:
        "📢 <b>NOVO DISPARO</b>\n\n" +
        "Envie agora o conteúdo que deseja disparar.\n\n" +
        "Você pode enviar:\n" +
        "📝 Texto\n" +
        "🖼 Foto\n" +
        "🎥 Vídeo\n" +
        "🎞 GIF / Animação\n\n" +
        "🧹 Sua mensagem será apagada após ser recebida.\n" +
        "👁️ Antes do envio aos grupos, você verá uma prévia para confirmar ou cancelar.",
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "❌ Cancelar",
              callback_data: "disparo:cancelar"
            }
          ]
        ]
      }
    }
  );

  await env.KV_BOT_BANNERS.put(
    `state_${userId}`,
    JSON.stringify({
      step: "WAITING_MEDIA",
      userId,
      panelMessageId: painel.message_id
    }),
    {
      expirationTtl: 3600
    }
  );
}
