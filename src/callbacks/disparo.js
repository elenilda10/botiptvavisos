import { enviarTelegram } from "../services/telegram.js";
import { atualizarPainel } from "../services/panel.js";
import { listarGrupos } from "../services/groups.js";

export async function handleDisparoCallback(env, callback) {
  const data = callback.data, chatId = callback.message.chat.id, userId = callback.from.id.toString(), stateKey = `state_${userId}`;
  if (data === "disparo:cancelar") {
    const raw = await env.KV_BOT_BANNERS.get(stateKey);
    if (raw) try { const s = JSON.parse(raw); await apagarPrevia(env, chatId, s); await apagarMensagem(env, chatId, s.confirmMessageId); } catch {}
    await env.KV_BOT_BANNERS.delete(stateKey); try { await apagarMensagem(env, chatId, callback.message.message_id); } catch {}
    return enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", { chat_id: chatId, text: "❌ <b>Disparo cancelado.</b>\n\nNenhuma mensagem foi enviada.", parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🏠 Voltar ao Painel", callback_data: "menu:inicio" }]] } });
  }
  const raw = await env.KV_BOT_BANNERS.get(stateKey); if (!raw) return estadoExpirado(env, callback);
  const state = JSON.parse(raw); state.userId = userId; state.panelMessageId ||= callback.message.message_id;
  if (data === "disparo:botoes") { state.step = "WAITING_BUTTONS_INPUT"; await salvarEstado(env, stateKey, state); return atualizarPainel(env, chatId, state.panelMessageId, "🔘 <b>ADICIONAR BOTÕES</b>\n\nEnvie:\n<code>Comprar - https://site.com</code>\n\nNo caso de álbum, os botões serão enviados logo abaixo do álbum.", [[{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }]]); }
  if (data === "disparo:sem_botoes") { state.buttons = null; state.step = "WAITING_CONFIRMATION"; await apagarMensagem(env, chatId, callback.message.message_id); state.panelMessageId = null; await salvarEstado(env, stateKey, state); return mostrarConfirmacao(env, chatId, state); }
  if (data === "disparo:confirmar") {
    if (state.sending) return; state.sending = true; await salvarEstado(env, stateKey, state); await apagarPrevia(env, chatId, state); await apagarMensagem(env, chatId, state.confirmMessageId || callback.message.message_id);
    const grupos = await listarGrupos(env); const status = await enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", { chat_id: chatId, text: `🚀 <b>Iniciando disparo...</b>\n\n📡 Destinos: <b>${grupos.length}</b> grupos`, parse_mode: "HTML" });
    let sucessos = 0, erros = 0; const markup = state.buttons ? { inline_keyboard: state.buttons } : undefined;
    for (const id of grupos) { try { await enviarConteudo(env, id, state, markup); sucessos++; } catch (e) { erros++; console.error(`[DISPARO] Erro no grupo ${id}:`, e); } await sleep(1500); }
    await env.KV_BOT_BANNERS.delete(stateKey); await salvarHistorico(env, { tipo: "manual", sucessos, erros, total: grupos.length, data: Date.now() });
    return atualizarPainel(env, chatId, status.message_id, `✅ <b>DISPARO FINALIZADO</b>\n\n📤 Enviados: <b>${sucessos}</b>\n❌ Erros: <b>${erros}</b>\n👥 Total: <b>${grupos.length}</b>`, [[{ text: "📢 Novo Disparo", callback_data: "menu:disparo" }], [{ text: "🏠 Painel", callback_data: "menu:inicio" }]]);
  }
}

export async function mostrarConfirmacao(env, chatId, state) {
  state.userId = String(state.userId || ""); if (!state.userId) throw new Error("Admin não identificado.");
  await apagarPrevia(env, chatId, state); await apagarMensagem(env, chatId, state.confirmMessageId);
  const markup = state.buttons ? { inline_keyboard: state.buttons } : undefined;
  const previa = await enviarConteudo(env, chatId, state, markup);
  state.previewMessageIds = Array.isArray(previa) ? previa.map(m => m?.message_id).filter(Boolean) : [previa?.message_id].filter(Boolean);
  state.previewMessageId = state.previewMessageIds[0] || null;
  const grupos = await listarGrupos(env);
  const confirmacao = await enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", { chat_id: chatId, text: `👁️ <b>PRÉVIA DO DISPARO</b>\n\n👥 Destinos: <b>${grupos.length} grupos</b>\n\nConfira a publicação acima. Deseja confirmar o disparo?`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "✅ Confirmar Disparo", callback_data: "disparo:confirmar" }], [{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }]] } });
  state.confirmMessageId = confirmacao?.message_id || null; state.step = "WAITING_CONFIRMATION"; await salvarEstado(env, `state_${state.userId}`, state); return confirmacao;
}

async function apagarMensagem(env, chatId, messageId) { if (!messageId) return; try { await enviarTelegram(env.TELEGRAM_TOKEN, "deleteMessage", { chat_id: chatId, message_id: messageId }); } catch (e) { console.warn("[LIMPEZA]", e.message || e); } }
async function apagarPrevia(env, chatId, state) {
  const ids = state?.previewMessageIds?.length ? state.previewMessageIds : state?.previewMessageId ? [state.previewMessageId] : [];
  for (const id of ids) await apagarMensagem(env, chatId, id);
  if (state?.previewButtonsMessageId) await apagarMensagem(env, chatId, state.previewButtonsMessageId);
  state.previewMessageIds = []; state.previewMessageId = null; state.previewButtonsMessageId = null;
}

async function enviarConteudo(env, chatId, state, replyMarkup) {
  const base = { chat_id: chatId };
  if (state.mediaType === "album") {
    const media = (state.album || []).map((item, index) => {
      const m = { type: item.type, media: item.media };
      if (item.caption) { m.caption = item.caption; m.parse_mode = "HTML"; }
      return m;
    });
    if (!media.length) throw new Error("Álbum vazio.");
    const enviados = await enviarTelegram(env.TELEGRAM_TOKEN, "sendMediaGroup", { ...base, media });
    // Telegram não aceita inline keyboard diretamente no sendMediaGroup; enviamos os botões logo abaixo.
    if (replyMarkup) {
      const btn = await enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", { ...base, text: "🔗 <b>Links</b>", parse_mode: "HTML", reply_markup: replyMarkup });
      if (chatId == state.userId) state.previewButtonsMessageId = btn?.message_id || null;
    }
    return enviados;
  }
  switch (state.mediaType) {
    case "photo": return enviarTelegram(env.TELEGRAM_TOKEN, "sendPhoto", { ...base, photo: state.fileId, caption: state.caption || undefined, parse_mode: "HTML", reply_markup: replyMarkup });
    case "video": return enviarTelegram(env.TELEGRAM_TOKEN, "sendVideo", { ...base, video: state.fileId, caption: state.caption || undefined, parse_mode: "HTML", reply_markup: replyMarkup });
    case "animation": return enviarTelegram(env.TELEGRAM_TOKEN, "sendAnimation", { ...base, animation: state.fileId, caption: state.caption || undefined, parse_mode: "HTML", reply_markup: replyMarkup });
    case "document": return enviarTelegram(env.TELEGRAM_TOKEN, "sendDocument", { ...base, document: state.fileId, caption: state.caption || undefined, parse_mode: "HTML", reply_markup: replyMarkup });
    case "audio": return enviarTelegram(env.TELEGRAM_TOKEN, "sendAudio", { ...base, audio: state.fileId, caption: state.caption || undefined, parse_mode: "HTML", reply_markup: replyMarkup });
    case "voice": return enviarTelegram(env.TELEGRAM_TOKEN, "sendVoice", { ...base, voice: state.fileId, caption: state.caption || undefined, parse_mode: "HTML", reply_markup: replyMarkup });
    case "video_note": return enviarTelegram(env.TELEGRAM_TOKEN, "sendVideoNote", { ...base, video_note: state.fileId });
    case "sticker": return enviarTelegram(env.TELEGRAM_TOKEN, "sendSticker", { ...base, sticker: state.fileId });
    case "poll": { const p = state.poll || {}; const x = { ...base, question: p.question, options: (p.options || []).map(text => ({ text })), is_anonymous: p.is_anonymous, type: p.type || "regular", allows_multiple_answers: p.allows_multiple_answers || false }; if (x.type === "quiz" && Number.isInteger(p.correct_option_id)) x.correct_option_id = p.correct_option_id; if (p.explanation) x.explanation = p.explanation; return enviarTelegram(env.TELEGRAM_TOKEN, "sendPoll", x); }
    case "location": return enviarTelegram(env.TELEGRAM_TOKEN, "sendLocation", { ...base, ...state.location });
    case "venue": return enviarTelegram(env.TELEGRAM_TOKEN, "sendVenue", { ...base, ...state.venue });
    case "contact": return enviarTelegram(env.TELEGRAM_TOKEN, "sendContact", { ...base, ...state.contact });
    case "dice": return enviarTelegram(env.TELEGRAM_TOKEN, "sendDice", { ...base, emoji: state.diceEmoji });
    default: return enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", { ...base, text: state.caption || "", parse_mode: "HTML", reply_markup: replyMarkup });
  }
}

async function salvarEstado(env, key, state) { return env.KV_BOT_BANNERS.put(key, JSON.stringify(state), { expirationTtl: 3600 }); }
async function salvarHistorico(env, r) { let h = []; const raw = await env.KV_BOT_BANNERS.get("historico_envios"); if (raw) try { h = JSON.parse(raw); } catch {} h.unshift(r); await env.KV_BOT_BANNERS.put("historico_envios", JSON.stringify(h.slice(0, 30))); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function estadoExpirado(env, callback) { return atualizarPainel(env, callback.message.chat.id, callback.message.message_id, "⚠️ <b>Essa operação expirou.</b>\n\nInicie um novo disparo.", [[{ text: "📢 Novo Disparo", callback_data: "menu:disparo" }], [{ text: "🏠 Painel", callback_data: "menu:inicio" }]]); }
