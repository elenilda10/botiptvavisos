import { enviarTelegram } from "../services/telegram.js";

const getToken = (env) =>
  env.BOT_TOKEN || env.TELEGRAM_TOKEN || env.TELEGRAM_BOT_TOKEN;

const menuPrincipal = {
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

const botaoVoltar = {
  inline_keyboard: [
    [{ text: "⬅️ Voltar ao menu", callback_data: "business_menu" }]
  ]
};

const menuPlanos = {
  inline_keyboard: [
    [
      { text: "📺 Mensal", callback_data: "business_plano_mensal" },
      { text: "📺 Trimestral", callback_data: "business_plano_trimestral" }
    ],
    [{ text: "⬅️ Voltar", callback_data: "business_menu" }]
  ]
};

async function editarMensagemBusiness(token, callback, text, replyMarkup) {
  const message = callback?.message;
  const connectionId = message?.business_connection_id;
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;

  if (!connectionId || !chatId || !messageId) {
    throw new Error("Callback sem dados suficientes da conexão Business.");
  }

  return enviarTelegram(token, "editMessageText", {
    business_connection_id: connectionId,
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: replyMarkup
  });
}

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
    text: "🤖 Atendimento\n\nOlá! Telegram Business conectado com sucesso. Escolha uma opção:",
    reply_markup: menuPrincipal,
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

  try {
    await enviarTelegram(token, "answerCallbackQuery", {
      callback_query_id: callback.id
    });

    if (data === "business_menu") {
      await editarMensagemBusiness(
        token,
        callback,
        "🤖 Atendimento\n\nEscolha uma opção:",
        menuPrincipal
      );
      return true;
    }

    if (data === "business_planos") {
      await editarMensagemBusiness(
        token,
        callback,
        "💳 Planos\n\nEscolha o período que deseja consultar:",
        menuPlanos
      );
      return true;
    }

    const telas = {
      business_teste_gratis: {
        text: "📺 Teste grátis\n\n✅ Tela de teste funcionando pelo Telegram Business.",
        markup: botaoVoltar
      },
      business_renovacao: {
        text: "🔄 Renovação\n\n✅ Área de renovação funcionando pelo Telegram Business.",
        markup: botaoVoltar
      },
      business_atendente: {
        text: "👨‍💻 Atendente\n\n✅ Área de atendimento funcionando pelo Telegram Business.",
        markup: botaoVoltar
      },
      business_plano_mensal: {
        text: "📺 Plano mensal\n\n✅ Opção mensal selecionada.",
        markup: menuPlanos
      },
      business_plano_trimestral: {
        text: "📺 Plano trimestral\n\n✅ Opção trimestral selecionada.",
        markup: menuPlanos
      }
    };

    const tela = telas[data];
    if (tela) {
      await editarMensagemBusiness(token, callback, tela.text, tela.markup);
    }
  } catch (error) {
    if (!error.message?.includes("message is not modified")) {
      console.error("[BUSINESS] Erro no callback/editMessageText:", error);
    }
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
