import { ADMINS_AUTORIZADOS } from "../config/constants.js";
import { comandoPainel } from "../commands/painel.js";
import { comandoSend } from "../commands/send.js";
import { comandoCancelar } from "../commands/cancelar.js";
import { comandoPromo15 } from "../commands/promo15.js";
import { adicionarGrupo } from "../services/groups.js";
import { atualizarPainel } from "../services/panel.js";
import { mostrarConfirmacao } from "../callbacks/disparo.js";

export async function handleMessage(env, message) {
  const userId = message.from?.id?.toString();
  const texto = message.caption || message.text || "";

  if (!userId) return;

  if (ADMINS_AUTORIZADOS.length > 0 && !ADMINS_AUTORIZADOS.includes(userId)) {
    return;
  }

  if (texto === "/start" || texto === "/painel") return comandoPainel(env, message);
  if (texto === "/send") return comandoSend(env, message);
  if (texto === "/cancelar") return comandoCancelar(env, message);
  if (texto === "/15") return comandoPromo15(env, message);

  const stateKey = `state_${userId}`;
  const rawState = await env.KV_BOT_BANNERS.get(stateKey);
  if (!rawState) return;

  let state;
  try {
    state = JSON.parse(rawState);
  } catch {
    await env.KV_BOT_BANNERS.delete(stateKey);
    return;
  }

  switch (state.step) {
    case "WAITING_MEDIA":
      return processarMidia(env, message, state);
    case "WAITING_BUTTONS_INPUT":
      return processarBotoes(env, message, state);
    case "WAITING_GROUP_ID":
      return processarGrupo(env, message, state);
    default:
      return;
  }
}

async function processarMidia(env, message, state) {
  const userId = message.from.id.toString();
  const stateKey = `state_${userId}`;

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
  } else if (message.text) {
    state.mediaType = "text";
    state.fileId = null;
    state.caption = message.text;
  } else {
    return;
  }

  state.step = "WAITING_BUTTON_CHOICE";
  await env.KV_BOT_BANNERS.put(stateKey, JSON.stringify(state), { expirationTtl: 3600 });

  await atualizarPainel(
    env,
    message.chat.id,
    state.panelMessageId,
    "✅ <b>CONTEÚDO RECEBIDO</b>\n\nEscolha se deseja adicionar botões à publicação:",
    [
      [{ text: "🔘 Adicionar Botões", callback_data: "disparo:botoes" }],
      [{ text: "➡️ Continuar sem Botões", callback_data: "disparo:sem_botoes" }],
      [{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }]
    ]
  );
}

async function processarBotoes(env, message, state) {
  const userId = message.from.id.toString();
  const stateKey = `state_${userId}`;

  if (!message.text) return;

  try {
    state.buttons = parseButtons(message.text);
  } catch (error) {
    await atualizarPainel(
      env,
      message.chat.id,
      state.panelMessageId,
      `⚠️ <b>Formato de botão inválido.</b>\n\n${escapeHtml(error.message)}\n\nUse:\n<code>Comprar - https://site.com</code>`,
      [[{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }]]
    );
    return;
  }

  state.step = "WAITING_CONFIRMATION";
  await env.KV_BOT_BANNERS.put(stateKey, JSON.stringify(state), { expirationTtl: 3600 });
  return mostrarConfirmacao(env, message.chat.id, state);
}

async function processarGrupo(env, message, state) {
  const id = String(message.text || "").trim();

  if (!/^-?\d+$/.test(id)) {
    return atualizarPainel(
      env,
      message.chat.id,
      state.panelMessageId,
      "⚠️ <b>ID inválido.</b>\n\nEnvie somente o ID numérico do grupo.\nExemplo: <code>-1001234567890</code>",
      [[{ text: "⬅️ Voltar", callback_data: "menu:grupos" }]]
    );
  }

  await adicionarGrupo(env, id);
  await env.KV_BOT_BANNERS.delete(`state_${message.from.id}`);

  return atualizarPainel(
    env,
    message.chat.id,
    state.panelMessageId,
    `✅ <b>Grupo adicionado.</b>\n\nID: <code>${id}</code>`,
    [[{ text: "👥 Ver Grupos", callback_data: "menu:grupos" }], [{ text: "🏠 Painel", callback_data: "menu:inicio" }]]
  );
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
      if (!/^https?:\/\//i.test(url) && !/^tg:\/\//i.test(url)) {
        throw new Error(`URL inválida no botão ${label}.`);
      }
      return { text: label, url };
    });
  });
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
