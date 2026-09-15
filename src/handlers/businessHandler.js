import { enviarTelegram } from "../services/telegram.js";

const getToken = (env) =>
  env.BOT_TOKEN || env.TELEGRAM_TOKEN || env.TELEGRAM_BOT_TOKEN;

const menuBusiness = {
  inline_keyboard: [
    [
      { text: "📺 Teste grátis", callback_data: "business_teste_gratis" },
      { text: "💳 Planos", callback_data: "business_planos" }
    ],
    [
      { text: "🔄 Renovação", callback_data: "business_renovacao" },
      { text: "👨‍💻 Atendente", callback_data: "business_atendente" }
    ]
  ]
};

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
  const token = getToken(env);
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
  if (texto !== "/business_teste" && texto !== "teste business") return;

  await enviarTelegram(token, "sendMessage", {
    business_connection_id: connectionId,
    chat_id: chatId,
    text: "🤖 Atendimento\n\nOlá! Telegram Business conectado com sucesso. Escolha uma opção para testar:",
    reply_markup: menuBusiness,
    reply_parameters: message?.message_id
      ? { message_id: message.message_id }
      : undefined
  });
}

export async function handleBusinessCallback(env, callback) {
  const data = callback?.data || "";
  if (!data.startsWith("business_")) return false;

  const token = getToken(env);
  if (!token) {
    console.error("[BUSINESS] Token do Telegram não configurado.");
    return true;
  }

  const connectionId = callback?.message?.business_connection_id;
  const chatId = callback?.message?.chat?.id;

  const respostas = {
    business_teste_gratis: "📺 Você selecionou: Teste grátis.\n\n✅ Callback Business funcionando!",
    business_planos: "💳 Você selecionou: Planos.\n\n✅ Callback Business funcionando!",
    business_renovacao: "🔄 Você selecionou: Renovação.\n\n✅ Callback Business funcionando!",
    business_atendente: "👨‍💻 Você selecionou: Atendente.\n\n✅ Callback Business funcionando!"
  };

  try {
    await enviarTelegram(token, "answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Opção recebida ✅"
    });

    if (connectionId && chatId) {
      await enviarTelegram(token, "sendMessage", {
        business_connection_id: connectionId,
        chat_id: chatId,
        text: respostas[data] || "✅ Opção recebida."
      });
    }
  } catch (error) {
    console.error("[BUSINESS] Erro no callback:", error);
  }

  return true;
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
