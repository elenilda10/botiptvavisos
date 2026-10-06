import { ADMINS_AUTORIZADOS } from "../config/constants.js";
import {
  comandoSend,
  textoInicioDisparo,
  tecladoTipoDisparo
} from "../commands/send.js";
import { comandoPainel } from "../commands/painel.js";
import { comandoCancelar } from "../commands/cancelar.js";
import { comandoPromo15 } from "../commands/promo15.js";
import { adicionarGrupo } from "../services/groups.js";
import { atualizarPainel } from "../services/panel.js";
import { enviarTelegram } from "../services/telegram.js";
import {
  mostrarEscolhaBotoes,
  mostrarEscolhaFixacao
} from "../callbacks/disparo.js";

const TTL_SESSAO = 3600;

export async function handleMessage(env, message) {
  const userId = message.from?.id?.toString();
  const texto =
    message.text || message.caption || "";

  if (
    !userId ||
    (
      ADMINS_AUTORIZADOS.length > 0 &&
      !ADMINS_AUTORIZADOS.includes(userId)
    )
  ) {
    return;
  }

  const stateKey = `state_${userId}`;
  const state = await lerEstado(env, stateKey);
  const sendAtivo = state?.flow === "send";
  const ehComando =
    typeof message.text === "string" &&
    message.text.trim().startsWith("/");

  // Durante /send, toda a interface externa fica bloqueada.
  // /cancelar é a única exceção.
  if (sendAtivo && ehComando) {
    if (
      normalizarComando(message.text) ===
      "/cancelar"
    ) {
      return comandoCancelar(env, message);
    }

    await apagarMensagemUsuario(env, message);
    return;
  }

  if (!sendAtivo) {
    const comando = normalizarComando(texto);

    if (
      comando === "/start" ||
      comando === "/painel"
    ) {
      return comandoPainel(env, message);
    }

    if (comando === "/send") {
      return comandoSend(env, message);
    }

    if (comando === "/cancelar") {
      return comandoCancelar(env, message);
    }

    if (comando === "/15") {
      return comandoPromo15(env, message);
    }
  }

  if (!state) return;

  state.userId = userId;

  if (
    sendAtivo &&
    message.media_group_id &&
    ["WAITING_MEDIA", "WAITING_ALBUM"].includes(
      state.step
    )
  ) {
    return receberItemAlbum(
      env,
      message,
      state
    );
  }

  switch (state.step) {
    case "WAITING_TYPE":
      if (sendAtivo) {
        await apagarMensagemUsuario(env, message);
        return atualizarPainel(
          env,
          message.chat.id,
          state.panelMessageId,
          textoInicioDisparo(),
          tecladoTipoDisparo()
        );
      }
      return;

    case "WAITING_MEDIA":
      return processarMidia(
        env,
        message,
        state
      );

    case "WAITING_CAPTION":
      return processarLegenda(
        env,
        message,
        state
      );

    case "WAITING_BUTTONS_INPUT":
      return processarBotoes(
        env,
        message,
        state
      );

    case "WAITING_GROUP_ID":
      return processarGrupo(
        env,
        message,
        state
      );

    default:
      // Em etapas controladas por botões, mensagens soltas
      // não devem abrir outro fluxo nem poluir o chat.
      if (sendAtivo) {
        await apagarMensagemUsuario(env, message);
      }
  }
}

async function processarMidia(
  env,
  message,
  state
) {
  const userId = message.from.id.toString();
  const key = `state_${userId}`;
  const recebido = extrairConteudo(message);

  if (!recebido) {
    await apagarMensagemUsuario(env, message);

    return atualizarPainel(
      env,
      message.chat.id,
      state.panelMessageId,
      textoTipoEsperado(state.expectedMediaType),
      [[
        {
          text: "❌ Cancelar",
          callback_data: "disparo:cancelar"
        }
      ]]
    );
  }

  if (
    state.expectedMediaType &&
    recebido.mediaType !==
      state.expectedMediaType
  ) {
    await apagarMensagemUsuario(env, message);

    return atualizarPainel(
      env,
      message.chat.id,
      state.panelMessageId,
      "⚠️ <b>TIPO DE CONTEÚDO DIFERENTE DO ESCOLHIDO</b>\n\n" +
        textoTipoEsperado(
          state.expectedMediaType
        ) +
        "\n\nA mensagem enviada foi apagada. Envie o tipo correto ou cancele o disparo.",
      [[
        {
          text: "❌ Cancelar",
          callback_data: "disparo:cancelar"
        }
      ]]
    );
  }

  Object.assign(state, recebido, {
    userId,
    buttons: null
  });

  const apagou =
    await apagarMensagemUsuario(env, message);

  if (!apagou) {
    state.step = "WAITING_DELETE_RETRY";

    await salvarEstado(env, key, state);

    return atualizarPainel(
      env,
      message.chat.id,
      state.panelMessageId,
      "⚠️ <b>Não consegui apagar a mensagem original.</b>\n\n" +
        "O disparo não avançou para evitar conteúdo duplicado. Verifique a permissão do bot para apagar mensagens e tente novamente.",
      [[
        {
          text: "❌ Cancelar",
          callback_data: "disparo:cancelar"
        }
      ]]
    );
  }

  await salvarEstado(env, key, state);

  if (
    midiaAceitaLegenda(state.mediaType) &&
    !temLegenda(state)
  ) {
    state.step = "WAITING_CAPTION_CHOICE";
    await salvarEstado(env, key, state);

    return atualizarPainel(
      env,
      message.chat.id,
      state.panelMessageId,
      "📝 <b>MÍDIA RECEBIDA SEM LEGENDA</b>\n\nDeseja adicionar uma legenda antes de continuar?",
      [
        [
          {
            text: "📝 Adicionar Legenda",
            callback_data: "disparo:legenda"
          }
        ],
        [
          {
            text: "➡️ Continuar sem Legenda",
            callback_data: "disparo:sem_legenda"
          }
        ],
        [
          {
            text: "❌ Cancelar",
            callback_data: "disparo:cancelar"
          }
        ]
      ]
    );
  }

  return mostrarEscolhaBotoes(
    env,
    message.chat.id,
    state
  );
}

async function processarLegenda(
  env,
  message,
  state
) {
  if (!message.text) {
    await apagarMensagemUsuario(env, message);

    return atualizarPainel(
      env,
      message.chat.id,
      state.panelMessageId,
      "⚠️ <b>Envie a legenda como texto.</b>\n\nA mensagem recebida não era um texto válido.",
      [[
        {
          text: "❌ Cancelar",
          callback_data: "disparo:cancelar"
        }
      ]]
    );
  }

  const userId = message.from.id.toString();

  await apagarMensagemUsuario(env, message);

  if (state.mediaType === "album") {
    state.album = (state.album || []).map(
      (item, index) => ({
        ...item,
        caption:
          index === 0
            ? message.text
            : "",
        caption_entities:
          index === 0
            ? (message.entities || undefined)
            : undefined
      })
    );
  } else {
    state.caption = message.text;
    state.captionEntities =
      message.entities || undefined;
  }

  state.userId = userId;

  await salvarEstado(
    env,
    `state_${userId}`,
    state
  );

  return mostrarEscolhaBotoes(
    env,
    message.chat.id,
    state
  );
}

async function processarBotoes(
  env,
  message,
  state
) {
  const userId = message.from.id.toString();

  if (!message.text) {
    await apagarMensagemUsuario(env, message);

    return atualizarPainel(
      env,
      message.chat.id,
      state.panelMessageId,
      "⚠️ <b>Envie os botões como texto.</b>\n\nExemplo:\n<code>Comprar - https://site.com</code>",
      [[
        {
          text: "❌ Cancelar",
          callback_data: "disparo:cancelar"
        }
      ]]
    );
  }

  try {
    state.buttons =
      parseButtons(message.text);
  } catch (error) {
    await apagarMensagemUsuario(env, message);

    return atualizarPainel(
      env,
      message.chat.id,
      state.panelMessageId,
      "⚠️ <b>Formato de botão inválido.</b>\n\n" +
        escapeHtml(error.message) +
        "\n\nTente novamente.",
      [[
        {
          text: "❌ Cancelar",
          callback_data: "disparo:cancelar"
        }
      ]]
    );
  }

  await apagarMensagemUsuario(env, message);

  state.userId = userId;

  await salvarEstado(
    env,
    `state_${userId}`,
    state
  );

  return mostrarEscolhaFixacao(
    env,
    message.chat.id,
    state
  );
}

async function processarGrupo(
  env,
  message,
  state
) {
  const id = String(
    message.text || ""
  ).trim();

  if (!/^-?\d+$/.test(id)) return;

  await apagarMensagemUsuario(env, message);
  await adicionarGrupo(env, id);

  await env.KV_BOT_BANNERS.delete(
    `state_${message.from.id}`
  );

  return atualizarPainel(
    env,
    message.chat.id,
    state.panelMessageId,
    `✅ <b>Grupo adicionado.</b>\n\nID: <code>${id}</code>`,
    [[
      {
        text: "👥 Ver Grupos",
        callback_data: "menu:grupos"
      }
    ]]
  );
}

async function receberItemAlbum(
  env,
  message,
  state
) {
  const userId = message.from.id.toString();
  const key = `state_${userId}`;
  const groupId =
    String(message.media_group_id);
  const item = itemAlbum(message);

  if (!item) {
    await apagarMensagemUsuario(env, message);
    return;
  }

  if (
    state.expectedMediaType &&
    !["photo", "video"].includes(
      state.expectedMediaType
    )
  ) {
    await apagarMensagemUsuario(env, message);
    return atualizarPainel(
      env,
      message.chat.id,
      state.panelMessageId,
      textoTipoEsperado(
        state.expectedMediaType
      ),
      [[
        {
          text: "❌ Cancelar",
          callback_data: "disparo:cancelar"
        }
      ]]
    );
  }

  const prefix =
    `album_${userId}_${groupId}_`;

  await env.KV_BOT_BANNERS.put(
    `${prefix}${message.message_id}`,
    JSON.stringify(item),
    { expirationTtl: 300 }
  );

  await apagarMensagemUsuario(env, message);

  state.mediaType = "album";
  state.mediaGroupId = groupId;
  state.step = "WAITING_ALBUM";
  state.albumLastAt = Date.now();

  await salvarEstado(env, key, state);

  await new Promise((resolve) =>
    setTimeout(resolve, 1800)
  );

  const raw =
    await env.KV_BOT_BANNERS.get(key);

  if (!raw) return;

  const current = JSON.parse(raw);

  if (
    current.step !== "WAITING_ALBUM" ||
    current.mediaGroupId !== groupId ||
    Date.now() -
      (current.albumLastAt || 0) <
      1400
  ) {
    return;
  }

  const listed =
    await env.KV_BOT_BANNERS.list({
      prefix
    });

  const album = [];

  for (const itemKey of listed.keys || []) {
    const value =
      await env.KV_BOT_BANNERS.get(
        itemKey.name
      );

    if (value) {
      try {
        album.push(JSON.parse(value));
      } catch {
        // ignora item inválido
      }
    }
  }

  album.sort(
    (a, b) =>
      a.messageId - b.messageId
  );

  if (!album.length) return;

  current.album = album;
  current.buttons = null;

  for (const itemKey of listed.keys || []) {
    await env.KV_BOT_BANNERS.delete(
      itemKey.name
    );
  }

  await salvarEstado(env, key, current);

  if (!temLegenda(current)) {
    current.step = "WAITING_CAPTION_CHOICE";
    await salvarEstado(env, key, current);

    return atualizarPainel(
      env,
      message.chat.id,
      current.panelMessageId,
      "📝 <b>ÁLBUM RECEBIDO SEM LEGENDA</b>\n\nDeseja adicionar uma legenda antes de continuar?",
      [
        [
          {
            text: "📝 Adicionar Legenda",
            callback_data: "disparo:legenda"
          }
        ],
        [
          {
            text: "➡️ Continuar sem Legenda",
            callback_data: "disparo:sem_legenda"
          }
        ],
        [
          {
            text: "❌ Cancelar",
            callback_data: "disparo:cancelar"
          }
        ]
      ]
    );
  }

  return mostrarEscolhaBotoes(
    env,
    message.chat.id,
    current
  );
}

function extrairConteudo(message) {
  if (message.photo?.length) {
    return {
      mediaType: "photo",
      fileId:
        message.photo.at(-1).file_id,
      caption: message.caption || "",
      captionEntities:
        message.caption_entities || undefined
    };
  }

  if (message.video) {
    return {
      mediaType: "video",
      fileId: message.video.file_id,
      caption: message.caption || "",
      captionEntities:
        message.caption_entities || undefined
    };
  }

  if (message.animation) {
    return {
      mediaType: "animation",
      fileId: message.animation.file_id,
      caption: message.caption || "",
      captionEntities:
        message.caption_entities || undefined
    };
  }

  if (message.sticker) {
    return {
      mediaType: "sticker",
      fileId: message.sticker.file_id,
      caption: ""
    };
  }

  if (message.text) {
    return {
      mediaType: "text",
      fileId: null,
      caption: message.text,
      textEntities:
        message.entities || undefined
    };
  }

  return null;
}

function itemAlbum(message) {
  if (message.photo?.length) {
    return {
      type: "photo",
      media:
        message.photo.at(-1).file_id,
      caption: message.caption || "",
      caption_entities:
        message.caption_entities || undefined,
      messageId: message.message_id
    };
  }

  if (message.video) {
    return {
      type: "video",
      media: message.video.file_id,
      caption: message.caption || "",
      caption_entities:
        message.caption_entities || undefined,
      messageId: message.message_id
    };
  }

  return null;
}

function midiaAceitaLegenda(type) {
  return [
    "photo",
    "video",
    "animation",
    "album"
  ].includes(type);
}

function temLegenda(state) {
  if (state.mediaType === "album") {
    return (state.album || []).some(
      (item) =>
        Boolean(
          String(
            item.caption || ""
          ).trim()
        )
    );
  }

  return Boolean(
    String(state.caption || "").trim()
  );
}

function textoTipoEsperado(tipo) {
  const mapa = {
    text:
      "📝 Envie uma <b>mensagem de texto</b>.",
    photo:
      "🖼 Envie uma <b>foto</b>.",
    video:
      "🎥 Envie um <b>vídeo</b>.",
    sticker:
      "🧩 Envie um <b>sticker</b>.",
    animation:
      "🎞 Envie um <b>GIF / animação</b>."
  };

  return (
    mapa[tipo] ||
    "Envie o conteúdo solicitado pelo painel."
  );
}

function parseButtons(text) {
  const linhas = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!linhas.length) {
    throw new Error(
      "Nenhum botão foi informado."
    );
  }

  return linhas.map((line) => {
    const itens = line
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);

    return itens.map((item) => {
      const separador =
        item.indexOf(" - ");

      if (separador < 1) {
        throw new Error(
          `Linha inválida: ${item}`
        );
      }

      const label =
        item
          .slice(0, separador)
          .trim();

      const url =
        item
          .slice(separador + 3)
          .trim();

      if (!label) {
        throw new Error(
          "O texto do botão não pode ficar vazio."
        );
      }

      if (
        !/^https?:\/\//i.test(url) &&
        !/^tg:\/\//i.test(url)
      ) {
        throw new Error(
          `URL inválida no botão ${label}.`
        );
      }

      return {
        text: label,
        url
      };
    });
  });
}

async function apagarMensagemUsuario(
  env,
  message
) {
  if (
    !message?.chat?.id ||
    !message?.message_id
  ) {
    return false;
  }

  try {
    await enviarTelegram(
      env.TELEGRAM_TOKEN,
      "deleteMessage",
      {
        chat_id: message.chat.id,
        message_id: message.message_id
      }
    );

    return true;
  } catch (error) {
    console.error(
      "[LIMPEZA] Falha ao apagar mensagem recebida",
      {
        chatId: message.chat.id,
        messageId: message.message_id,
        erro:
          error.message || error
      }
    );

    return false;
  }
}

async function lerEstado(env, key) {
  const raw =
    await env.KV_BOT_BANNERS.get(key);

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    await env.KV_BOT_BANNERS.delete(key);
    return null;
  }
}

async function salvarEstado(
  env,
  key,
  state
) {
  return env.KV_BOT_BANNERS.put(
    key,
    JSON.stringify(state),
    { expirationTtl: TTL_SESSAO }
  );
}

function normalizarComando(texto) {
  if (typeof texto !== "string") {
    return "";
  }

  const primeiro =
    texto.trim().split(/\s+/)[0] || "";

  return primeiro
    .toLowerCase()
    .split("@")[0];
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
