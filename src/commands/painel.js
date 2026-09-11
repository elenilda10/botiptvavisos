import { enviarTelegram, editarTela } from "../services/telegram.js";
import { listarGrupos } from "../services/groups.js";

export async function comandoPainel(env, message) {
  const chatId = message.chat.id;
  const userId = message.from.id.toString();
  await env.KV_BOT_BANNERS.delete(`state_${userId}`);

  const grupos = await listarGrupos(env);
  const texto =
    "🤖 <b>PAINEL ADMINISTRATIVO</b>\n\n" +
    "━━━━━━━━━━━━━━━━━━\n" +
    "📊 <b>Status do sistema</b>\n" +
    "━━━━━━━━━━━━━━━━━━\n\n" +
    `👥 Grupos: <b>${grupos.length}</b>\n` +
    "🟢 Bot: <b>Online</b>\n\n" +
    "Escolha uma opção:";

  const teclado = [
    [{ text: "📢 Novo Disparo", callback_data: "menu:disparo" }],
    [{ text: "👥 Gerenciar Grupos", callback_data: "menu:grupos" }],
    [
      { text: "🖼 Banners", callback_data: "menu:banners" },
      { text: "📜 Histórico", callback_data: "menu:historico" }
    ],
    [{ text: "⚙️ Configurações", callback_data: "menu:config" }]
  ];

  // Callback: reaproveita a mensagem do painel para manter o chat limpo.
  if (message.message_id && !message.text?.startsWith("/")) {
    return editarTela(env.TELEGRAM_TOKEN, { message }, texto, teclado);
  }

  return enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
    chat_id: chatId,
    text: texto,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: teclado }
  });
}
