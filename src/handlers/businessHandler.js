import { enviarTelegram } from "../services/telegram.js";

/**
 * Integração inicial com Telegram Business.
 * Modo de teste: responde somente quando a mensagem recebida pela conta
 * Business for exatamente /business_teste ou "teste business".
 * Assim, o fluxo normal do bot continua isolado.
 */
export async function handleBusinessConnection(env, connection) {
  console.log("[BUSINESS] conexão", {
    id: connection?.id,
    user_id: connection?.user?.id,
    user_chat_id: connection?.user_chat_id,
    is_enabled: connection?.is_enabled,
    rights: connection?.rights
  });
}

export async function handleBusinessMessage(env, message) {
  const token = env.BOT_TOKEN || env.TELEGRAM_TOKEN || env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("[BUSINESS] Token do Telegram não configurado.");
    return;
  }

  const connectionId = message?.business_connection_id;
  const chatId = message?.chat?.id;
  const texto = (message?.text || "").trim().toLowerCase();

  console.log("[BUSINESS] mensagem", {
    business_connection_id: connectionId,
    chat_id: chatId,
    message_id: message?.message_id,
    from_id: message?.from?.id,
    text: message?.text
  });

  if (!connectionId || !chatId) return;

  // Evita responder automaticamente a toda conversa durante o primeiro teste.
  if (texto !== "/business_teste" && texto !== "teste business") return;

  await enviarTelegram(token, "sendMessage", {
    business_connection_id: connectionId,
    chat_id: chatId,
    text: "✅ Telegram Business conectado com sucesso!\n\nEsta resposta foi enviada pelo bot usando a conexão da sua conta Business.",
    reply_parameters: message?.message_id
      ? { message_id: message.message_id }
      : undefined
  });
}

export async function handleEditedBusinessMessage(env, message) {
  console.log("[BUSINESS] mensagem editada", {
    business_connection_id: message?.business_connection_id,
    chat_id: message?.chat?.id,
    message_id: message?.message_id,
    text: message?.text
  });
}

export async function handleDeletedBusinessMessages(env, deleted) {
  console.log("[BUSINESS] mensagens apagadas", {
    business_connection_id: deleted?.business_connection_id,
    chat_id: deleted?.chat?.id,
    message_ids: deleted?.message_ids
  });
}
