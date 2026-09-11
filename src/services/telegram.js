export async function enviarTelegram(token, metodo, payload) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/${metodo}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const resultado = await response.json();

  if (!response.ok || !resultado.ok) {
    throw new Error(
      resultado.description ||
      `Telegram HTTP ${response.status}`
    );
  }

  return resultado.result;
}


// -------------------------------------------------------------
// EDITAR TELA DO PAINEL
// -------------------------------------------------------------

export async function editarTela(
  token,
  callback,
  texto,
  teclado
) {
  const chatId = callback.message.chat.id;
  const messageId = callback.message.message_id;

  try {
    return await enviarTelegram(
      token,
      "editMessageText",
      {
        chat_id: chatId,
        message_id: messageId,
        text: texto,
        parse_mode: "HTML",
        reply_markup: teclado
          ? {
              inline_keyboard: teclado
            }
          : undefined
      }
    );

  } catch (error) {

    // Não considera erro quando a tela já está exatamente igual
    if (
      error.message?.includes(
        "message is not modified"
      )
    ) {
      return null;
    }

    throw error;
  }
}
