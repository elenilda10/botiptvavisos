import { enviarTelegram } from "../services/telegram.js";
import { atualizarPainel } from "../services/panel.js";

export const SEND_FLOW = "send";

export function tecladoTipoDisparo() {
  return [
    [
      { text: "📝 Texto", callback_data: "disparo:tipo:texto" },
      { text: "🖼 Foto", callback_data: "disparo:tipo:foto" }
    ],
    [
      { text: "🎥 Vídeo", callback_data: "disparo:tipo:video" },
      { text: "🧩 Sticker", callback_data: "disparo:tipo:sticker" }
    ],
    [
      { text: "🎞 GIF", callback_data: "disparo:tipo:animation" }
    ],
    [
      { text: "❌ Cancelar", callback_data: "disparo:cancelar" }
    ]
  ];
}

export function textoInicioDisparo() {
  return (
    "📢 <b>NOVO DISPARO</b>\n\n" +
    "Escolha o tipo de publicação que deseja montar.\n\n" +
    "Depois você poderá adicionar <b>legenda/texto</b> e <b>botões com URL</b> quando o tipo permitir.\n\n" +
    "🧹 Tudo o que o bot pedir para você enviar será apagado após ser recebido.\n" +
    "🔒 Enquanto este fluxo estiver ativo, /start, /painel e os outros comandos ficam bloqueados.\n" +
    "👁️ Antes do disparo será mostrada uma prévia para confirmar ou cancelar."
  );
}

export async function iniciarDisparo(env, {
  chatId,
  userId,
  panelMessageId = null
}) {
  const state = {
    flow: SEND_FLOW,
    step: "WAITING_TYPE",
    userId: String(userId),
    panelMessageId: panelMessageId || null,
    mediaType: null,
    expectedMediaType: null,
    fileId: null,
    caption: "",
    buttons: null,
    fixar: false,
    previewMessageIds: [],
    previewButtonsMessageId: null
  };

  await env.KV_BOT_BANNERS.put(
    `state_${state.userId}`,
    JSON.stringify(state),
    { expirationTtl: 3600 }
  );

  if (panelMessageId) {
    return atualizarPainel(
      env,
      chatId,
      panelMessageId,
      textoInicioDisparo(),
      tecladoTipoDisparo()
    );
  }

  const painel = await enviarTelegram(
    env.TELEGRAM_TOKEN,
    "sendMessage",
    {
      chat_id: chatId,
      text: textoInicioDisparo(),
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: tecladoTipoDisparo()
      }
    }
  );

  state.panelMessageId = painel.message_id;

  await env.KV_BOT_BANNERS.put(
    `state_${state.userId}`,
    JSON.stringify(state),
    { expirationTtl: 3600 }
  );

  return painel;
}

export async function comandoSend(env, message) {
  const chatId = message.chat.id;
  const userId = message.from.id.toString();

  try {
    await enviarTelegram(env.TELEGRAM_TOKEN, "deleteMessage", {
      chat_id: chatId,
      message_id: message.message_id
    });
  } catch (error) {
    console.warn(
      "[DISPARO] Não foi possível apagar /send:",
      error.message || error
    );
  }

  await env.KV_BOT_BANNERS.delete(`state_${userId}`);

  return iniciarDisparo(env, {
    chatId,
    userId
  });
}
