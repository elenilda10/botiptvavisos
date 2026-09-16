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
  try { state = JSON.parse(rawState); }
  catch { await env.KV_BOT_BANNERS.delete(stateKey); return; }

  state.userId = userId;

  switch (state.step) {
    case "WAITING_MEDIA": return processarMidia(env, message, state);
    case "WAITING_BUTTONS_INPUT": return processarBotoes(env, message, state);
    case "WAITING_GROUP_ID": return processarGrupo(env, message, state);
    default: return;
  }
}

async function apagarMensagemUsuario(env, message) {
  if (!message?.chat?.id || !message?.message_id) return;
  try {
    await enviarTelegram(env.TELEGRAM_TOKEN, "deleteMessage", { chat_id: message.chat.id, message_id: message.message_id });
  } catch (error) {
    console.warn("[LIMPEZA] Não foi possível apagar mensagem do usuário:", error.message || error);
  }
}

async function processarMidia(env, message, state) {
  const userId = message.from.id.toString();
  const stateKey = `state_${userId}`;

  // Guardamos apenas os dados necessários para recriar o mesmo conteúdo na prévia e nos grupos.
  if (message.photo?.length) {
    state.mediaType = "photo";
    state.fileId = message.photo[message.photo.length - 1].file_id;
    state.caption = message.caption || "";
  } else if (message.video) {
    state.mediaType = "video";
    state.fileId = message.video.file_id;
    state.caption = message.caption || "";
  } else if (message.animation) {
    state.mediaType = "animation";
    state.fileId = message.animation.file_id;
    state.caption = message.caption || "";
  } else if (message.document) {
    state.mediaType = "document";
    state.fileId = message.document.file_id;
    state.caption = message.caption || "";
  } else if (message.audio) {
    state.mediaType = "audio";
    state.fileId = message.audio.file_id;
    state.caption = message.caption || "";
  } else if (message.voice) {
    state.mediaType = "voice";
    state.fileId = message.voice.file_id;
    state.caption = message.caption || "";
  } else if (message.video_note) {
    state.mediaType = "video_note";
    state.fileId = message.video_note.file_id;
    state.caption = "";
  } else if (message.sticker) {
    state.mediaType = "sticker";
    state.fileId = message.sticker.file_id;
    state.caption = "";
  } else if (message.poll) {
    state.mediaType = "poll";
    state.poll = {
      question: message.poll.question,
      options: message.poll.options.map(option => option.text),
      is_anonymous: message.poll.is_anonymous,
      type: message.poll.type,
      allows_multiple_answers: message.poll.allows_multiple_answers,
      correct_option_id: message.poll.correct_option_id,
      explanation: message.poll.explanation || undefined
    };
    state.fileId = null;
    state.caption = "";
  } else if (message.location) {
    state.mediaType = "location";
    state.location = { latitude: message.location.latitude, longitude: message.location.longitude };
    state.fileId = null;
    state.caption = "";
  } else if (message.venue) {
    state.mediaType = "venue";
    state.venue = {
      latitude: message.venue.location.latitude,
      longitude: message.venue.location.longitude,
      title: message.venue.title,
      address: message.venue.address
    };
    state.fileId = null;
    state.caption = "";
  } else if (message.contact) {
    state.mediaType = "contact";
    state.contact = {
      phone_number: message.contact.phone_number,
      first_name: message.contact.first_name,
      last_name: message.contact.last_name || undefined,
      vcard: message.contact.vcard || undefined
    };
    state.fileId = null;
    state.caption = "";
  } else if (message.dice) {
    state.mediaType = "dice";
    state.diceEmoji = message.dice.emoji;
    state.fileId = null;
    state.caption = "";
  } else if (message.text) {
    state.mediaType = "text";
    state.fileId = null;
    state.caption = message.text;
  } else {
    return atualizarPainel(env, message.chat.id, state.panelMessageId,
      "⚠️ <b>Tipo de conteúdo ainda não suportado.</b>\n\nTente enviar texto, mídia, arquivo, áudio, enquete, localização, contato ou outro conteúdo compatível.",
      [[{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }]]);
  }

  await apagarMensagemUsuario(env, message);
  state.userId = userId;
  state.buttons = null;
  state.step = "WAITING_BUTTON_CHOICE";
  await env.KV_BOT_BANNERS.put(stateKey, JSON.stringify(state), { expirationTtl: 3600 });

  // Tipos que não aceitam inline keyboard na própria publicação seguem direto para a prévia.
  const semBotoes = ["poll", "sticker", "video_note", "location", "venue", "contact", "dice"];
  if (semBotoes.includes(state.mediaType)) {
    state.step = "WAITING_CONFIRMATION";
    await env.KV_BOT_BANNERS.put(stateKey, JSON.stringify(state), { expirationTtl: 3600 });
    return mostrarConfirmacao(env, message.chat.id, state);
  }

  return atualizarPainel(env, message.chat.id, state.panelMessageId,
    "✅ <b>CONTEÚDO RECEBIDO</b>\n\nDeseja adicionar botões à publicação?",
    [[{ text: "🔘 Adicionar Botões", callback_data: "disparo:botoes" }], [{ text: "➡️ Continuar sem Botões", callback_data: "disparo:sem_botoes" }], [{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }]]);
}

async function processarBotoes(env, message, state) {
  const userId = message.from.id.toString();
  const stateKey = `state_${userId}`;
  if (!message.text) return;
  try { state.buttons = parseButtons(message.text); }
  catch (error) {
    await apagarMensagemUsuario(env, message);
    return atualizarPainel(env, message.chat.id, state.panelMessageId,
      `⚠️ <b>Formato de botão inválido.</b>\n\n${escapeHtml(error.message)}\n\nUse:\n<code>Comprar - https://site.com</code>`,
      [[{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }]]);
  }
  await apagarMensagemUsuario(env, message);
  state.userId = userId;
  state.step = "WAITING_CONFIRMATION";
  await env.KV_BOT_BANNERS.put(stateKey, JSON.stringify(state), { expirationTtl: 3600 });
  return mostrarConfirmacao(env, message.chat.id, state, true);
}

async function processarGrupo(env, message, state) {
  const id = String(message.text || "").trim();
  if (!/^-?\d+$/.test(id)) return atualizarPainel(env, message.chat.id, state.panelMessageId,
    "⚠️ <b>ID inválido.</b>\n\nEnvie somente o ID numérico do grupo.\nExemplo: <code>-1001234567890</code>",
    [[{ text: "⬅️ Voltar", callback_data: "menu:grupos" }]]);
  await apagarMensagemUsuario(env, message);
  await adicionarGrupo(env, id);
  await env.KV_BOT_BANNERS.delete(`state_${message.from.id}`);
  return atualizarPainel(env, message.chat.id, state.panelMessageId,
    `✅ <b>Grupo adicionado.</b>\n\nID: <code>${id}</code>`,
    [[{ text: "👥 Ver Grupos", callback_data: "menu:grupos" }], [{ text: "🏠 Painel", callback_data: "menu:inicio" }]]);
}

function parseButtons(text) {
  return text.split("\n").map(line => {
    const parts = line.split("|").map(item => item.trim()).filter(Boolean);
    if (!parts.length) throw new Error("Nenhum botão informado.");
    return parts.map(item => {
      const separator = item.indexOf(" - ");
      if (separator < 1) throw new Error(`Linha inválida: ${item}`);
      const label = item.slice(0, separator).trim();
      const url = item.slice(separator + 3).trim();
      if (!/^https?:\/\//i.test(url) && !/^tg:\/\//i.test(url)) throw new Error(`URL inválida no botão ${label}.`);
      return { text: label, url };
    });
  });
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
