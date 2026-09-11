import { ADMINS_AUTORIZADOS } from "../config/constants.js";
import { enviarTelegram } from "../services/telegram.js";

import { handleMenuCallback } from "../callbacks/menu.js";
import { handleDisparoCallback } from "../callbacks/disparo.js";
import { handleGruposCallback } from "../callbacks/grupos.js";
import { handleBannersCallback } from "../callbacks/banners.js";
import { handleHistoricoCallback } from "../callbacks/historico.js";
import { handleConfigCallback } from "../callbacks/config.js";

export async function handleCallback(env, callback) {
  const userId = callback.from?.id?.toString();
  const chatId = callback.message?.chat?.id;
  const data = callback.data;

  if (!userId || !chatId || !data) {
    return;
  }

  // -----------------------------------------------------------
  // SEGURANÇA
  // -----------------------------------------------------------

  if (
    ADMINS_AUTORIZADOS.length > 0 &&
    !ADMINS_AUTORIZADOS.includes(userId)
  ) {
    try {
      await enviarTelegram(
        env.TELEGRAM_TOKEN,
        "answerCallbackQuery",
        {
          callback_query_id: callback.id,
          text: "⛔ Você não possui permissão para usar este painel.",
          show_alert: true
        }
      );
    } catch (error) {
      console.error(
        "[CALLBACK] Erro ao avisar usuário não autorizado:",
        error
      );
    }

    return;
  }

  // -----------------------------------------------------------
  // RESPONDE AO CLIQUE IMEDIATAMENTE
  // -----------------------------------------------------------

  try {
    await enviarTelegram(
      env.TELEGRAM_TOKEN,
      "answerCallbackQuery",
      {
        callback_query_id: callback.id
      }
    );
  } catch (error) {
    /*
      O callback pode expirar caso alguma requisição demore.
      Não queremos interromper o funcionamento do painel por isso.
    */
    console.warn(
      "[CALLBACK] Não foi possível responder callback:",
      error
    );
  }

  // -----------------------------------------------------------
  // ROTEAMENTO DOS CALLBACKS
  // -----------------------------------------------------------

  try {
    // menu:inicio
    // menu:disparo
    // menu:grupos
    // menu:banners
    // menu:historico
    // menu:config
    if (data.startsWith("menu:")) {
      return await handleMenuCallback(
        env,
        callback
      );
    }

    // disparo:todos
    // disparo:limpar
    // disparo:continuar
    // disparo:confirmar
    // disparo:cancelar
    if (data.startsWith("disparo:")) {
      return await handleDisparoCallback(
        env,
        callback
      );
    }

    // grupo:adicionar
    // grupo:listar
    // grupo:remover
    // grupo:ativar:ID
    // grupo:desativar:ID
    if (data.startsWith("grupo:")) {
      return await handleGruposCallback(
        env,
        callback
      );
    }

    // banner:listar
    // banner:enviar
    // banner:config
    if (data.startsWith("banner:")) {
      return await handleBannersCallback(
        env,
        callback
      );
    }

    // historico:listar
    // historico:detalhes:ID
    if (data.startsWith("historico:")) {
      return await handleHistoricoCallback(
        env,
        callback
      );
    }

    // config:menu
    // config:admins
    // config:status
    if (data.startsWith("config:")) {
      return await handleConfigCallback(
        env,
        callback
      );
    }

    // ---------------------------------------------------------
    // CALLBACK DESCONHECIDO
    // ---------------------------------------------------------

    console.warn(
      `[CALLBACK] Callback desconhecido recebido: ${data}`
    );

    await enviarTelegram(
      env.TELEGRAM_TOKEN,
      "sendMessage",
      {
        chat_id: chatId,
        text:
          "⚠️ <b>Opção não reconhecida.</b>\n\n" +
          "Abra novamente o painel usando /painel.",
        parse_mode: "HTML"
      }
    );
  } catch (error) {
    console.error(
      `[CALLBACK] Erro ao processar "${data}":`,
      error
    );

    // ---------------------------------------------------------
    // MENSAGEM DE ERRO PARA O ADMIN
    // ---------------------------------------------------------

    try {
      await enviarTelegram(
        env.TELEGRAM_TOKEN,
        "sendMessage",
        {
          chat_id: chatId,

          text:
            "❌ <b>Ocorreu um erro ao processar essa ação.</b>\n\n" +
            "Tente novamente ou use /painel para retornar ao menu principal.",

          parse_mode: "HTML"
        }
      );
    } catch (telegramError) {
      console.error(
        "[CALLBACK] Erro ao enviar mensagem de erro:",
        telegramError
      );
    }
  }
}
