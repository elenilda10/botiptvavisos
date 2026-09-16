import { enviarTelegram } from "../services/telegram.js";
import { atualizarPainel } from "../services/panel.js";
import { listarGrupos } from "../services/groups.js";

export async function handleDisparoCallback(env, callback) {
  const data = callback.data;
  const chatId = callback.message.chat.id;
  const userId = callback.from.id.toString();
  const stateKey = `state_${userId}`;

  if (data === "disparo:cancelar") {
    const rawState = await env.KV_BOT_BANNERS.get(stateKey);
    if (rawState) {
      try {
        const state = JSON.parse(rawState);
        await apagarPrevia(env, chatId, state);
        await apagarMensagem(env, chatId, state.confirmMessageId);
      } catch {}
    }
    await env.KV_BOT_BANNERS.delete(stateKey);
    try { await apagarMensagem(env, chatId, callback.message.message_id); } catch {}
    return enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: "❌ <b>Disparo cancelado.</b>\n\nNenhuma mensagem foi enviada.",
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🏠 Voltar ao Painel", callback_data: "menu:inicio" }]] }
    });
  }

  const rawState = await env.KV_BOT_BANNERS.get(stateKey);
  if (!rawState) return estadoExpirado(env, callback);
  const state = JSON.parse(rawState);
  state.userId = userId;
  state.panelMessageId ||= callback.message.message_id;

  if (data === "disparo:botoes") {
    state.step = "WAITING_BUTTONS_INPUT";
    await salvarEstado(env, stateKey, state);
    return atualizarPainel(env, chatId, state.panelMessageId,
      "🔘 <b>ADICIONAR BOTÕES</b>\n\nEnvie os botões neste formato:\n\n<code>Comprar - https://site.com</code>\n\nDois lado a lado:\n<code>Comprar - https://site.com | Suporte - https://t.me/suporte</code>",
      [[{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }]]);
  }

  if (data === "disparo:sem_botoes") {
    state.buttons = null;
    state.step = "WAITING_CONFIRMATION";

    // Apaga a tela "Deseja adicionar botões?" antes de montar a prévia.
    await apagarMensagem(env, chatId, callback.message.message_id);
    state.panelMessageId = null;
    await salvarEstado(env, stateKey, state);

    return mostrarConfirmacao(env, chatId, state, false);
  }

  if (data === "disparo:confirmar") {
    if (state.sending === true) return;
    state.sending = true;
    await salvarEstado(env, stateKey, state);

    await apagarPrevia(env, chatId, state);
    await apagarMensagem(env, chatId, state.confirmMessageId || callback.message.message_id);

    const grupos = await listarGrupos(env);
    const status = await enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: `🚀 <b>Iniciando disparo...</b>\n\n📡 Destinos: <b>${grupos.length}</b> grupos`,
      parse_mode: "HTML"
    });

    let sucessos = 0;
    let erros = 0;
    const replyMarkup = state.buttons ? { inline_keyboard: state.buttons } : undefined;

    for (const grupoId of grupos) {
      try {
        await enviarConteudo(env, grupoId, state, replyMarkup);
        sucessos++;
      } catch (error) {
        erros++;
        console.error(`[DISPARO] Erro no grupo ${grupoId}:`, error);
      }
      await sleep(1500);
    }

    await env.KV_BOT_BANNERS.delete(stateKey);
    await salvarHistorico(env, { tipo: "manual", sucessos, erros, total: grupos.length, data: Date.now() });

    return atualizarPainel(env, chatId, status.message_id,
      "✅ <b>DISPARO FINALIZADO</b>\n\n" +
      `📤 Enviados: <b>${sucessos}</b>\n❌ Erros: <b>${erros}</b>\n👥 Total: <b>${grupos.length}</b>`,
      [[{ text: "📢 Novo Disparo", callback_data: "menu:disparo" }], [{ text: "🏠 Painel", callback_data: "menu:inicio" }]]);
  }
}

export async function mostrarConfirmacao(env, chatId, state) {
  state.userId = String(state.userId || "");
  if (!state.userId) throw new Error("Não foi possível identificar o admin para salvar a prévia.");

  await apagarPrevia(env, chatId, state);
  await apagarMensagem(env, chatId, state.confirmMessageId);

  // 1) Envia a prévia EXATAMENTE como ficará no grupo.
  const botoesPublicacao = state.buttons ? { inline_keyboard: state.buttons } : undefined;
  const previa = await enviarConteudo(env, chatId, state, botoesPublicacao);
  state.previewMessageId = previa?.message_id || null;

  // 2) Só depois da prévia envia a confirmação/cancelamento em outra mensagem.
  const grupos = await listarGrupos(env);
  const confirmacao = await enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
    chat_id: chatId,
    text: "👁️ <b>PRÉVIA DO DISPARO</b>\n\n" +
      `👥 Destinos: <b>${grupos.length} grupos</b>\n\nConfira a publicação acima. Deseja confirmar o disparo?`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Confirmar Disparo", callback_data: "disparo:confirmar" }],
        [{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }]
      ]
    }
  });

  state.confirmMessageId = confirmacao?.message_id || null;
  state.step = "WAITING_CONFIRMATION";
  await salvarEstado(env, `state_${state.userId}`, state);
  return confirmacao;
}

async function apagarMensagem(env, chatId, messageId) {
  if (!messageId) return;
  try {
    await enviarTelegram(env.TELEGRAM_TOKEN, "deleteMessage", { chat_id: chatId, message_id: messageId });
  } catch (error) {
    console.warn("[LIMPEZA] Não foi possível apagar mensagem:", error.message || error);
  }
}

async function apagarPrevia(env, chatId, state) {
  if (!state?.previewMessageId) return;
  await apagarMensagem(env, chatId, state.previewMessageId);
  state.previewMessageId = null;
}

async function enviarConteudo(env, chatId, state, replyMarkup) {
  const payload = { chat_id: chatId, parse_mode: "HTML" };
  if (replyMarkup) payload.reply_markup = replyMarkup;

  if (state.mediaType === "photo") {
    payload.photo = state.fileId;
    if (state.caption) payload.caption = state.caption;
    return enviarTelegram(env.TELEGRAM_TOKEN, "sendPhoto", payload);
  }
  if (state.mediaType === "video") {
    payload.video = state.fileId;
    if (state.caption) payload.caption = state.caption;
    return enviarTelegram(env.TELEGRAM_TOKEN, "sendVideo", payload);
  }
  if (state.mediaType === "animation") {
    payload.animation = state.fileId;
    if (state.caption) payload.caption = state.caption;
    return enviarTelegram(env.TELEGRAM_TOKEN, "sendAnimation", payload);
  }

  payload.text = state.caption;
  return enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", payload);
}

async function salvarEstado(env, key, state) {
  return env.KV_BOT_BANNERS.put(key, JSON.stringify(state), { expirationTtl: 3600 });
}

async function salvarHistorico(env, registro) {
  let historico = [];
  const raw = await env.KV_BOT_BANNERS.get("historico_envios");
  if (raw) {
    try { historico = JSON.parse(raw); } catch { historico = []; }
  }
  historico.unshift(registro);
  await env.KV_BOT_BANNERS.put("historico_envios", JSON.stringify(historico.slice(0, 30)));
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function estadoExpirado(env, callback) {
  return atualizarPainel(env, callback.message.chat.id, callback.message.message_id,
    "⚠️ <b>Essa operação expirou.</b>\n\nInicie um novo disparo.",
    [[{ text: "📢 Novo Disparo", callback_data: "menu:disparo" }], [{ text: "🏠 Painel", callback_data: "menu:inicio" }]]);
}
