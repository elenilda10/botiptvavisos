import { ADMINS_AUTORIZADOS } from "../config/constants.js";
import { editarTela } from "../services/telegram.js";
import { listarGrupos } from "../services/groups.js";

export async function handleConfigCallback(env, callback) {
  const data = callback.data;

  if (data === "config:menu") {
    return mostrarConfiguracoes(env, callback);
  }

  if (data === "config:status") {
    const grupos = await listarGrupos(env);

    return editarTela(
      env.TELEGRAM_TOKEN,
      callback,
      "🟢 <b>STATUS DO SISTEMA</b>\n\n" +
        "🤖 Bot: <b>Online</b>\n" +
        `👥 Grupos: <b>${grupos.length}</b>\n` +
        `👤 Administradores: <b>${ADMINS_AUTORIZADOS.length}</b>\n` +
        "💾 KV: <b>Ativo</b>\n" +
        "📡 Telegram API: <b>Configurada</b>",
      [[{ text: "⬅️ Voltar", callback_data: "menu:config" }]]
    );
  }

  if (data === "config:admins") {
    let texto = "👤 <b>ADMINISTRADORES</b>\n\n";

    ADMINS_AUTORIZADOS.forEach((admin, index) => {
      texto += `${index + 1}. <code>${admin}</code>\n`;
    });

    return editarTela(
      env.TELEGRAM_TOKEN,
      callback,
      texto,
      [[{ text: "⬅️ Voltar", callback_data: "menu:config" }]]
    );
  }
}

export async function mostrarConfiguracoes(env, callback) {
  return editarTela(
    env.TELEGRAM_TOKEN,
    callback,
    "⚙️ <b>CONFIGURAÇÕES</b>\n\nEscolha uma opção:",
    [
      [{ text: "🟢 Status do Sistema", callback_data: "config:status" }],
      [{ text: "👤 Administradores", callback_data: "config:admins" }],
      [{ text: "⬅️ Painel", callback_data: "menu:inicio" }]
    ]
  );
}
