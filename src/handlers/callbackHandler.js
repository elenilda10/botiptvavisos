import { ADMINS_AUTORIZADOS } from "../config/constants.js";
import { enviarTelegram, editarTela } from "../services/telegram.js";

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

  if (!userId || !chatId || !data) return;

  if (ADMINS_AUTORIZADOS.length > 0 && !ADMINS_AUTORIZADOS.includes(userId)) {
    try {
      await enviarTelegram(env.TELEGRAM_TOKEN, "answerCallbackQuery", {
        callback_query_id: callback.id,
        text: "⛔ Você não possui permissão para usar este painel.",
        show_alert: true
      });
    } catch (error) {
      console.error("[CALLBACK] Erro ao avisar usuário não autorizado:", error);
    }
    return;
  }

  try {
    await enviarTelegram(env.TELEGRAM_TOKEN, "answerCallbackQuery", {
      callback_query_id: callback.id
    });
  } catch (error) {
    console.warn("[CALLBACK] Não foi possível responder callback:", error);
  }

  try {
    if (data.startsWith("menu:")) return await handleMenuCallback(env, callback);
    if (data.startsWith("disparo:")) return await handleDisparoCallback(env, callback);
    if (data.startsWith("grupo:")) return await handleGruposCallback(env, callback);
    if (data.startsWith("banner:")) return await handleBannersCallback(env, callback);
    if (data.startsWith("historico:")) return await handleHistoricoCallback(env, callback);
    if (data.startsWith("config:")) return await handleConfigCallback(env, callback);

    console.warn(`[CALLBACK] Callback desconhecido recebido: ${data}`);

    return editarTela(
      env.TELEGRAM_TOKEN,
      callback,
      "⚠️ <b>Opção não reconhecida.</b>\n\nVolte ao painel e tente novamente.",
      [[{ text: "🏠 Painel", callback_data: "menu:inicio" }]]
    );
  } catch (error) {
    console.error(`[CALLBACK] Erro ao processar "${data}":`, error);

    try {
      return await editarTela(
        env.TELEGRAM_TOKEN,
        callback,
        "❌ <b>Ocorreu um erro ao processar essa ação.</b>\n\nTente novamente ou volte ao painel principal.",
        [[{ text: "🏠 Painel", callback_data: "menu:inicio" }]]
      );
    } catch (telegramError) {
      console.error("[CALLBACK] Erro ao atualizar mensagem de erro:", telegramError);
    }
  }
}
