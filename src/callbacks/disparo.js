import { enviarTelegram } from "../services/telegram.js";
import { atualizarPainel } from "../services/panel.js";
import { listarGrupos } from "../services/groups.js";

const TTL_SESSAO = 3600;

export async function handleDisparoCallback(env, callback) {
  const data = callback.data;
  const chatId = callback.message.chat.id;
  const userId = callback.from.id.toString();
  const key = `state_${userId}`;

  if (data === "disparo:cancelar") {
    const state = await lerEstado(env, key);

    if (state) {
      await apagarPrevia(env, chatId, state);
      await env.KV_BOT_BANNERS.delete(key);
    }

    return atualizarPainel(
      env,
      chatId,
      callback.message.message_id,
      "❌ <b>Disparo cancelado.</b>\n\nNenhuma mensagem foi enviada.",
      [[{ text: "🏠 Voltar ao Painel", callback_data: "menu:inicio" }]]
    );
  }

  const state = await lerEstado(env, key);
  if (!state) return estadoExpirado(env, callback);

  state.userId = userId;
  state.flow = "send";
  state.panelMessageId =
    state.panelMessageId || callback.message.message_id;

  if (data.startsWith("disparo:tipo:")) {
    const tipo = data.split(":")[2];

    const tipos = {
      texto: {
        expectedMediaType: "text",
        titulo: "📝 <b>ENVIE O TEXTO</b>",
        instrucao:
          "Envie agora a mensagem de texto que será publicada."
      },
      foto: {
        expectedMediaType: "photo",
        titulo: "🖼 <b>ENVIE A FOTO</b>",
        instrucao:
          "Envie agora a imagem. Você pode enviá-la já com legenda ou adicionar a legenda depois."
      },
      video: {
        expectedMediaType: "video",
        titulo: "🎥 <b>ENVIE O VÍDEO</b>",
        instrucao:
          "Envie agora o vídeo. Você pode enviá-lo já com legenda ou adicionar a legenda depois."
      },
      sticker: {
        expectedMediaType: "sticker",
        titulo: "🧩 <b>ENVIE O STICKER</b>",
        instrucao:
          "Envie agora o sticker que será publicado."
      },
      animation: {
        expectedMediaType: "animation",
        titulo: "🎞 <b>ENVIE O GIF / ANIMAÇÃO</b>",
        instrucao:
          "Envie agora o GIF/animação. Você pode enviá-lo já com legenda ou adicionar a legenda depois."
      }
    };

    const escolha = tipos[tipo];
    if (!escolha) {
      return atualizarPainel(
        env,
        chatId,
        state.panelMessageId,
        "⚠️ <b>Tipo de publicação inválido.</b>\n\nCancele e inicie um novo /send.",
        [[{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }]]
      );
    }

    Object.assign(state, {
      step: "WAITING_MEDIA",
      expectedMediaType: escolha.expectedMediaType,
      mediaType: null,
      fileId: null,
      caption: "",
      buttons: null,
      fixar: false
    });

    await salvarEstado(env, key, state);

    return atualizarPainel(
      env,
      chatId,
      state.panelMessageId,
      `${escolha.titulo}\n\n${escolha.instrucao}\n\n🧹 A mensagem enviada será apagada assim que for recebida.`,
      [[{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }]]
    );
  }

  if (data === "disparo:legenda") {
    state.step = "WAITING_CAPTION";
    await salvarEstado(env, key, state);

    return atualizarPainel(
      env,
      chatId,
      state.panelMessageId,
      "📝 <b>ADICIONAR LEGENDA</b>\n\nEnvie agora o texto que deseja usar como legenda da mídia.\n\n🧹 O texto enviado será apagado após ser recebido.",
      [[{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }]]
    );
  }

  if (data === "disparo:sem_legenda") {
    state.caption = "";
    await salvarEstado(env, key, state);
    return mostrarEscolhaBotoes(env, chatId, state);
  }

  if (data === "disparo:botoes") {
    state.step = "WAITING_BUTTONS_INPUT";
    await salvarEstado(env, key, state);

    return atualizarPainel(
      env,
      chatId,
      state.panelMessageId,
      "🔘 <b>ADICIONAR BOTÕES COM URL</b>\n\n" +
        "Envie um botão por linha:\n" +
        "<code>Comprar - https://site.com</code>\n\n" +
        "Para colocar dois botões na mesma linha, separe com <code>|</code>:\n" +
        "<code>Site - https://site.com | Suporte - https://t.me/exemplo</code>\n\n" +
        "🧹 Essa mensagem também será apagada após ser recebida.",
      [[{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }]]
    );
  }

  if (data === "disparo:sem_botoes") {
    state.buttons = null;
    await salvarEstado(env, key, state);
    return mostrarEscolhaFixacao(env, chatId, state);
  }

  if (data === "disparo:fixar" || data === "disparo:nao_fixar") {
    state.fixar = data === "disparo:fixar";
    state.step = "WAITING_CONFIRMATION";
    await salvarEstado(env, key, state);
    return mostrarConfirmacao(env, chatId, state);
  }

  if (data === "disparo:confirmar") {
    if (state.sending) return null;

    state.sending = true;
    await salvarEstado(env, key, state);

    await apagarPrevia(env, chatId, state);

    const grupos = await listarGrupos(env);

    await atualizarPainel(
      env,
      chatId,
      state.panelMessageId,
      "🚀 <b>INICIANDO DISPARO...</b>\n\n" +
        `📡 Destinos: <b>${grupos.length}</b> grupos\n` +
        `📌 Fixar: <b>${state.fixar ? "SIM" : "NÃO"}</b>\n\n` +
        "Aguarde a conclusão do envio.",
      null
    );

    let sucessos = 0;
    let erros = 0;
    let fixados = 0;
    let errosFixacao = 0;

    const markup = state.buttons
      ? { inline_keyboard: state.buttons }
      : undefined;

    for (const id of grupos) {
      try {
        const enviado = await enviarConteudo(
          env,
          id,
          state,
          markup
        );

        sucessos++;

        if (state.fixar) {
          const messageId = primeiroMessageId(enviado);

          if (messageId) {
            try {
              await enviarTelegram(
                env.TELEGRAM_TOKEN,
                "pinChatMessage",
                {
                  chat_id: id,
                  message_id: messageId,
                  disable_notification: true
                }
              );
              fixados++;
            } catch (pinError) {
              errosFixacao++;
              console.error("[FIXAR]", id, pinError);
            }
          }
        }
      } catch (error) {
        erros++;
        console.error("[DISPARO]", id, error);
      }

      await sleep(1500);
    }

    await env.KV_BOT_BANNERS.delete(key);

    await salvarHistorico(env, {
      tipo: "manual",
      sucessos,
      erros,
      total: grupos.length,
      fixar: Boolean(state.fixar),
      fixados,
      errosFixacao,
      data: Date.now()
    });

    return atualizarPainel(
      env,
      chatId,
      state.panelMessageId,
      "✅ <b>DISPARO FINALIZADO</b>\n\n" +
        `📤 Enviados: <b>${sucessos}</b>\n` +
        `❌ Erros: <b>${erros}</b>\n` +
        `👥 Total: <b>${grupos.length}</b>` +
        (
          state.fixar
            ? `\n📌 Fixados: <b>${fixados}</b>\n⚠️ Falhas ao fixar: <b>${errosFixacao}</b>`
            : ""
        ),
      [
        [{ text: "📢 Novo Disparo", callback_data: "menu:disparo" }],
        [{ text: "🏠 Painel", callback_data: "menu:inicio" }]
      ]
    );
  }
}

export async function mostrarEscolhaBotoes(env, chatId, state) {
  state.step = "WAITING_BUTTON_CHOICE";
  await salvarEstado(env, `state_${state.userId}`, state);

  return atualizarPainel(
    env,
    chatId,
    state.panelMessageId,
    "✅ <b>CONTEÚDO RECEBIDO</b>\n\nDeseja adicionar botões com URL à publicação?",
    [
      [{ text: "🔘 Adicionar Botões", callback_data: "disparo:botoes" }],
      [{ text: "➡️ Continuar sem Botões", callback_data: "disparo:sem_botoes" }],
      [{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }]
    ]
  );
}

export async function mostrarEscolhaFixacao(env, chatId, state) {
  state.step = "WAITING_PIN_CHOICE";
  await salvarEstado(env, `state_${state.userId}`, state);

  return atualizarPainel(
    env,
    chatId,
    state.panelMessageId,
    "📌 <b>FIXAR PUBLICAÇÃO</b>\n\nDeseja fixar esta postagem nos grupos após o envio?",
    [
      [{ text: "📌 Sim, fixar", callback_data: "disparo:fixar" }],
      [{ text: "➡️ Não fixar", callback_data: "disparo:nao_fixar" }],
      [{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }]
    ]
  );
}

export async function mostrarConfirmacao(env, chatId, state) {
  state.userId = String(state.userId || "");

  if (!state.userId) {
    throw new Error("Admin não identificado.");
  }

  await apagarPrevia(env, chatId, state);

  const markup = state.buttons
    ? { inline_keyboard: state.buttons }
    : undefined;

  const previa = await enviarConteudo(
    env,
    chatId,
    state,
    markup
  );

  state.previewMessageIds = Array.isArray(previa)
    ? previa.map((m) => m?.message_id).filter(Boolean)
    : [previa?.message_id].filter(Boolean);

  state.previewMessageId =
    state.previewMessageIds[0] || null;

  const grupos = await listarGrupos(env);

  state.step = "WAITING_CONFIRMATION";
  await salvarEstado(
    env,
    `state_${state.userId}`,
    state
  );

  return atualizarPainel(
    env,
    chatId,
    state.panelMessageId,
    "👁️ <b>PRÉVIA DO DISPARO</b>\n\n" +
      `👥 Destinos: <b>${grupos.length} grupos</b>\n` +
      `📌 Fixar nos grupos: <b>${state.fixar ? "SIM" : "NÃO"}</b>\n\n` +
      "Confira a publicação enviada como prévia. Ao confirmar ou cancelar, a prévia será apagada.",
    [
      [{ text: "✅ Confirmar Disparo", callback_data: "disparo:confirmar" }],
      [{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }]
    ]
  );
}

async function enviarConteudo(env, chatId, state, replyMarkup) {
  const base = { chat_id: chatId };

  if (state.mediaType === "album") {
    const media = (state.album || []).map((item) => {
      const value = {
        type: item.type,
        media: item.media
      };

      if (item.caption) {
        value.caption = item.caption;
        if (item.caption_entities) {
          value.caption_entities =
            item.caption_entities;
        }
      }

      return value;
    });

    if (!media.length) {
      throw new Error("Álbum vazio.");
    }

    const sent = await enviarTelegram(
      env.TELEGRAM_TOKEN,
      "sendMediaGroup",
      { ...base, media }
    );

    if (replyMarkup) {
      const botoes = await enviarTelegram(
        env.TELEGRAM_TOKEN,
        "sendMessage",
        {
          ...base,
          text: "🔗 <b>Links</b>",
          parse_mode: "HTML",
          reply_markup: replyMarkup
        }
      );

      if (String(chatId) === String(state.userId)) {
        state.previewButtonsMessageId =
          botoes?.message_id || null;
      }
    }

    return sent;
  }

  switch (state.mediaType) {
    case "photo":
      return enviarTelegram(
        env.TELEGRAM_TOKEN,
        "sendPhoto",
        {
          ...base,
          photo: state.fileId,
          caption: state.caption || undefined,
          caption_entities:
            state.captionEntities || undefined,
          reply_markup: replyMarkup
        }
      );

    case "video":
      return enviarTelegram(
        env.TELEGRAM_TOKEN,
        "sendVideo",
        {
          ...base,
          video: state.fileId,
          caption: state.caption || undefined,
          caption_entities:
            state.captionEntities || undefined,
          reply_markup: replyMarkup
        }
      );

    case "animation":
      return enviarTelegram(
        env.TELEGRAM_TOKEN,
        "sendAnimation",
        {
          ...base,
          animation: state.fileId,
          caption: state.caption || undefined,
          caption_entities:
            state.captionEntities || undefined,
          reply_markup: replyMarkup
        }
      );

    case "document":
      return enviarTelegram(
        env.TELEGRAM_TOKEN,
        "sendDocument",
        {
          ...base,
          document: state.fileId,
          caption: state.caption || undefined,
          caption_entities:
            state.captionEntities || undefined,
          reply_markup: replyMarkup
        }
      );

    case "audio":
      return enviarTelegram(
        env.TELEGRAM_TOKEN,
        "sendAudio",
        {
          ...base,
          audio: state.fileId,
          caption: state.caption || undefined,
          caption_entities:
            state.captionEntities || undefined,
          reply_markup: replyMarkup
        }
      );

    case "voice":
      return enviarTelegram(
        env.TELEGRAM_TOKEN,
        "sendVoice",
        {
          ...base,
          voice: state.fileId,
          caption: state.caption || undefined,
          caption_entities:
            state.captionEntities || undefined,
          reply_markup: replyMarkup
        }
      );

    case "video_note":
      return enviarTelegram(
        env.TELEGRAM_TOKEN,
        "sendVideoNote",
        {
          ...base,
          video_note: state.fileId,
          reply_markup: replyMarkup
        }
      );

    case "sticker":
      return enviarTelegram(
        env.TELEGRAM_TOKEN,
        "sendSticker",
        {
          ...base,
          sticker: state.fileId,
          reply_markup: replyMarkup
        }
      );

    case "poll": {
      const poll = state.poll || {};
      const payload = {
        ...base,
        question: poll.question,
        options: (poll.options || []).map((text) => ({ text })),
        is_anonymous: poll.is_anonymous,
        type: poll.type || "regular",
        allows_multiple_answers:
          poll.allows_multiple_answers || false,
        reply_markup: replyMarkup
      };

      if (
        payload.type === "quiz" &&
        Number.isInteger(poll.correct_option_id)
      ) {
        payload.correct_option_id =
          poll.correct_option_id;
      }

      if (poll.explanation) {
        payload.explanation = poll.explanation;
      }

      return enviarTelegram(
        env.TELEGRAM_TOKEN,
        "sendPoll",
        payload
      );
    }

    case "location":
      return enviarTelegram(
        env.TELEGRAM_TOKEN,
        "sendLocation",
        {
          ...base,
          ...state.location,
          reply_markup: replyMarkup
        }
      );

    case "venue":
      return enviarTelegram(
        env.TELEGRAM_TOKEN,
        "sendVenue",
        {
          ...base,
          ...state.venue,
          reply_markup: replyMarkup
        }
      );

    case "contact":
      return enviarTelegram(
        env.TELEGRAM_TOKEN,
        "sendContact",
        {
          ...base,
          ...state.contact,
          reply_markup: replyMarkup
        }
      );

    case "dice":
      return enviarTelegram(
        env.TELEGRAM_TOKEN,
        "sendDice",
        {
          ...base,
          emoji: state.diceEmoji,
          reply_markup: replyMarkup
        }
      );

    default:
      return enviarTelegram(
        env.TELEGRAM_TOKEN,
        "sendMessage",
        {
          ...base,
          text: state.caption || "",
          entities:
            state.textEntities || undefined,
          reply_markup: replyMarkup
        }
      );
  }
}

export async function apagarPrevia(env, chatId, state) {
  const ids = state?.previewMessageIds?.length
    ? state.previewMessageIds
    : state?.previewMessageId
      ? [state.previewMessageId]
      : [];

  for (const id of ids) {
    await apagarMensagem(env, chatId, id);
  }

  if (state?.previewButtonsMessageId) {
    await apagarMensagem(
      env,
      chatId,
      state.previewButtonsMessageId
    );
  }

  state.previewMessageIds = [];
  state.previewMessageId = null;
  state.previewButtonsMessageId = null;
}

async function apagarMensagem(env, chatId, messageId) {
  if (!messageId) return;

  try {
    await enviarTelegram(
      env.TELEGRAM_TOKEN,
      "deleteMessage",
      {
        chat_id: chatId,
        message_id: messageId
      }
    );
  } catch {
    // Limpeza é melhor esforço: não deve interromper o fluxo.
  }
}

async function lerEstado(env, key) {
  const raw = await env.KV_BOT_BANNERS.get(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    await env.KV_BOT_BANNERS.delete(key);
    return null;
  }
}

async function salvarEstado(env, key, state) {
  return env.KV_BOT_BANNERS.put(
    key,
    JSON.stringify(state),
    { expirationTtl: TTL_SESSAO }
  );
}

async function salvarHistorico(env, registro) {
  let historico = [];
  const raw =
    await env.KV_BOT_BANNERS.get("historico_envios");

  if (raw) {
    try {
      historico = JSON.parse(raw);
    } catch {
      historico = [];
    }
  }

  historico.unshift(registro);

  await env.KV_BOT_BANNERS.put(
    "historico_envios",
    JSON.stringify(historico.slice(0, 30))
  );
}

function primeiroMessageId(enviado) {
  if (Array.isArray(enviado)) {
    return (
      enviado
        .map((item) => item?.message_id)
        .find(Boolean) || null
    );
  }

  return enviado?.message_id || null;
}

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

async function estadoExpirado(env, callback) {
  return atualizarPainel(
    env,
    callback.message.chat.id,
    callback.message.message_id,
    "⚠️ <b>Essa operação expirou.</b>\n\nInicie um novo disparo.",
    [[{ text: "📢 Novo Disparo", callback_data: "menu:disparo" }]]
  );
}
