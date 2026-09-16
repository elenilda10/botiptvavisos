import { ADMINS_AUTORIZADOS } from "../config/constants.js";
import { comandoPainel } from "../commands/painel.js";
import { comandoSend } from "../commands/send.js";
import { comandoCancelar } from "../commands/cancelar.js";
import { comandoPromo15 } from "../commands/promo15.js";
import { adicionarGrupo } from "../services/groups.js";
import { atualizarPainel } from "../services/panel.js";
import { enviarTelegram } from "../services/telegram.js";
import { mostrarConfirmacao } from "../callbacks/disparo.js";

export async function handleMessage(env, message) {
  const userId = message.from?.id?.toString();
  const texto = message.caption || message.text || "";
  if (!userId) return;
  if (ADMINS_AUTORIZADOS.length > 0 && !ADMINS_AUTORIZADOS.includes(userId)) return;

  if (texto === "/start" || texto === "/painel") return comandoPainel(env, message);
  if (texto === "/send") return comandoSend(env, message);
  if (texto === "/cancelar") return comandoCancelar(env, message);
  if (texto === "/15") return comandoPromo15(env, message);

  const stateKey = `state_${userId}`;
  const rawState = await env.KV_BOT_BANNERS.get(stateKey);
  if (!rawState) return;
  let state;
  try { state = JSON.parse(rawState); } catch { await env.KV_BOT_BANNERS.delete(stateKey); return; }
  state.userId = userId;

  // media_group_id tem prioridade: cada foto/vídeo do álbum chega em um update separado.
  if (message.media_group_id && ["WAITING_MEDIA", "WAITING_ALBUM"].includes(state.step)) {
    return receberItemAlbum(env, message, state);
  }

  switch (state.step) {
    case "WAITING_MEDIA": return processarMidia(env, message, state);
    case "WAITING_BUTTONS_INPUT": return processarBotoes(env, message, state);
    case "WAITING_GROUP_ID": return processarGrupo(env, message, state);
    default: return;
  }
}

async function apagarMensagemUsuario(env, message) {
  if (!message?.chat?.id || !message?.message_id) return;
  try { await enviarTelegram(env.TELEGRAM_TOKEN, "deleteMessage", { chat_id: message.chat.id, message_id: message.message_id }); }
  catch (error) { console.warn("[LIMPEZA] Não foi possível apagar mensagem do usuário:", error.message || error); }
}

function itemAlbum(message) {
  if (message.photo?.length) return { type: "photo", media: message.photo[message.photo.length - 1].file_id, caption: message.caption || "", messageId: message.message_id };
  if (message.video) return { type: "video", media: message.video.file_id, caption: message.caption || "", messageId: message.message_id };
  if (message.document) return { type: "document", media: message.document.file_id, caption: message.caption || "", messageId: message.message_id };
  if (message.audio) return { type: "audio", media: message.audio.file_id, caption: message.caption || "", messageId: message.message_id };
  return null;
}

async function receberItemAlbum(env, message, state) {
  const userId = message.from.id.toString();
  const stateKey = `state_${userId}`;
  const groupId = String(message.media_group_id);
  const item = itemAlbum(message);
  if (!item) return;

  // IMPORTANTE: não acumulamos o array diretamente em state. Updates do mesmo álbum
  // chegam quase simultaneamente e sobrescreviam uns aos outros no KV.
  const prefix = `album_${userId}_${groupId}_`;
  await env.KV_BOT_BANNERS.put(`${prefix}${message.message_id}`, JSON.stringify(item), { expirationTtl: 300 });
  await apagarMensagemUsuario(env, message);

  state.mediaType = "album";
  state.mediaGroupId = groupId;
  state.step = "WAITING_ALBUM";
  state.albumLastAt = Date.now();
  await env.KV_BOT_BANNERS.put(stateKey, JSON.stringify(state), { expirationTtl: 3600 });

  // Telegram envia os itens em rajada. Esperamos o lote estabilizar e então lemos
  // TODAS as chaves independentes, eliminando a condição de corrida.
  await new Promise(resolve => setTimeout(resolve, 1800));
  const currentRaw = await env.KV_BOT_BANNERS.get(stateKey);
  if (!currentRaw) return;
  const current = JSON.parse(currentRaw);
  if (current.step !== "WAITING_ALBUM" || current.mediaGroupId !== groupId) return;
  if (Date.now() - (current.albumLastAt || 0) < 1400) return;

  const listed = await env.KV_BOT_BANNERS.list({ prefix });
  const album = [];
  for (const key of listed.keys || []) {
    const raw = await env.KV_BOT_BANNERS.get(key.name);
    if (!raw) continue;
    try { album.push(JSON.parse(raw)); } catch {}
  }
  album.sort((a, b) => a.messageId - b.messageId);
  if (!album.length) return;

  current.album = album;
  current.buttons = null;
  current.step = "WAITING_BUTTON_CHOICE";
  await env.KV_BOT_BANNERS.put(stateKey, JSON.stringify(current), { expirationTtl: 3600 });

  for (const key of listed.keys || []) await env.KV_BOT_BANNERS.delete(key.name);

  return atualizarPainel(env, message.chat.id, current.panelMessageId,
    `✅ <b>ÁLBUM RECEBIDO</b>\n\n🖼 Itens: <b>${album.length}</b>\n\nDeseja adicionar botões após o álbum?`,
    [[{ text: "🔘 Adicionar Botões", callback_data: "disparo:botoes" }], [{ text: "➡️ Continuar sem Botões", callback_data: "disparo:sem_botoes" }], [{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }]]);
}

async function processarMidia(env, message, state) {
  const userId = message.from.id.toString();
  const stateKey = `state_${userId}`;
  if (message.photo?.length) { state.mediaType = "photo"; state.fileId = message.photo.at(-1).file_id; state.caption = message.caption || ""; }
  else if (message.video) { state.mediaType = "video"; state.fileId = message.video.file_id; state.caption = message.caption || ""; }
  else if (message.animation) { state.mediaType = "animation"; state.fileId = message.animation.file_id; state.caption = message.caption || ""; }
  else if (message.document) { state.mediaType = "document"; state.fileId = message.document.file_id; state.caption = message.caption || ""; }
  else if (message.audio) { state.mediaType = "audio"; state.fileId = message.audio.file_id; state.caption = message.caption || ""; }
  else if (message.voice) { state.mediaType = "voice"; state.fileId = message.voice.file_id; state.caption = message.caption || ""; }
  else if (message.video_note) { state.mediaType = "video_note"; state.fileId = message.video_note.file_id; state.caption = ""; }
  else if (message.sticker) { state.mediaType = "sticker"; state.fileId = message.sticker.file_id; state.caption = ""; }
  else if (message.poll) { state.mediaType = "poll"; state.poll = { question: message.poll.question, options: message.poll.options.map(o => o.text), is_anonymous: message.poll.is_anonymous, type: message.poll.type, allows_multiple_answers: message.poll.allows_multiple_answers, correct_option_id: message.poll.correct_option_id, explanation: message.poll.explanation || undefined }; state.fileId = null; state.caption = ""; }
  else if (message.location) { state.mediaType = "location"; state.location = { latitude: message.location.latitude, longitude: message.location.longitude }; state.caption = ""; }
  else if (message.venue) { state.mediaType = "venue"; state.venue = { latitude: message.venue.location.latitude, longitude: message.venue.location.longitude, title: message.venue.title, address: message.venue.address }; state.caption = ""; }
  else if (message.contact) { state.mediaType = "contact"; state.contact = { phone_number: message.contact.phone_number, first_name: message.contact.first_name, last_name: message.contact.last_name || undefined, vcard: message.contact.vcard || undefined }; state.caption = ""; }
  else if (message.dice) { state.mediaType = "dice"; state.diceEmoji = message.dice.emoji; state.caption = ""; }
  else if (message.text) { state.mediaType = "text"; state.fileId = null; state.caption = message.text; }
  else return;

  await apagarMensagemUsuario(env, message);
  state.userId = userId; state.buttons = null; state.step = "WAITING_BUTTON_CHOICE";
  await env.KV_BOT_BANNERS.put(stateKey, JSON.stringify(state), { expirationTtl: 3600 });
  const semBotoes = ["poll", "sticker", "video_note", "location", "venue", "contact", "dice"];
  if (semBotoes.includes(state.mediaType)) { state.step = "WAITING_CONFIRMATION"; await env.KV_BOT_BANNERS.put(stateKey, JSON.stringify(state), { expirationTtl: 3600 }); return mostrarConfirmacao(env, message.chat.id, state); }
  return atualizarPainel(env, message.chat.id, state.panelMessageId, "✅ <b>CONTEÚDO RECEBIDO</b>\n\nDeseja adicionar botões à publicação?", [[{ text: "🔘 Adicionar Botões", callback_data: "disparo:botoes" }], [{ text: "➡️ Continuar sem Botões", callback_data: "disparo:sem_botoes" }], [{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }]]);
}

async function processarBotoes(env, message, state) {
  const userId = message.from.id.toString(), stateKey = `state_${userId}`;
  if (!message.text) return;
  try { state.buttons = parseButtons(message.text); } catch (error) { await apagarMensagemUsuario(env, message); return atualizarPainel(env, message.chat.id, state.panelMessageId, `⚠️ <b>Formato de botão inválido.</b>\n\n${escapeHtml(error.message)}\n\nUse:\n<code>Comprar - https://site.com</code>`, [[{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }]]); }
  await apagarMensagemUsuario(env, message); state.userId = userId; state.step = "WAITING_CONFIRMATION"; await env.KV_BOT_BANNERS.put(stateKey, JSON.stringify(state), { expirationTtl: 3600 }); return mostrarConfirmacao(env, message.chat.id, state, true);
}

async function processarGrupo(env, message, state) {
  const id = String(message.text || "").trim();
  if (!/^-?\d+$/.test(id)) return atualizarPainel(env, message.chat.id, state.panelMessageId, "⚠️ <b>ID inválido.</b>\n\nEnvie somente o ID numérico do grupo.\nExemplo: <code>-1001234567890</code>", [[{ text: "⬅️ Voltar", callback_data: "menu:grupos" }]]);
  await apagarMensagemUsuario(env, message); await adicionarGrupo(env, id); await env.KV_BOT_BANNERS.delete(`state_${message.from.id}`); return atualizarPainel(env, message.chat.id, state.panelMessageId, `✅ <b>Grupo adicionado.</b>\n\nID: <code>${id}</code>`, [[{ text: "👥 Ver Grupos", callback_data: "menu:grupos" }], [{ text: "🏠 Painel", callback_data: "menu:inicio" }]]);
}

function parseButtons(text) { return text.split("\n").map(line => line.split("|").map(i => i.trim()).filter(Boolean).map(item => { const s = item.indexOf(" - "); if (s < 1) throw new Error(`Linha inválida: ${item}`); const label = item.slice(0, s).trim(), url = item.slice(s + 3).trim(); if (!/^https?:\/\//i.test(url) && !/^tg:\/\//i.test(url)) throw new Error(`URL inválida no botão ${label}.`); return { text: label, url }; })); }
function escapeHtml(v) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
