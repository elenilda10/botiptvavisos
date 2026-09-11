import { enviarTelegram } from "../services/telegram.js";
import { LISTA_GRUPOS } from "../config/constants.js";

export async function handleDisparoCallback(env, callback) {
  const data = callback.data;
  const chatId = callback.message.chat.id;
  const userId = callback.from.id.toString();

  const stateKey = `state_${userId}`;

  // ---------------------------------------------------------
  // CANCELAR
  // ---------------------------------------------------------

  if (data === "disparo:cancelar") {
    await env.KV_BOT_BANNERS.delete(stateKey);

    await enviarTelegram(
      env.TELEGRAM_TOKEN,
      "sendMessage",
      {
        chat_id: chatId,

        text:
          "❌ <b>Disparo cancelado.</b>\n\n" +
          "Nenhuma mensagem foi enviada.",

        parse_mode: "HTML",

        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🏠 Voltar ao Painel",
                callback_data: "menu:inicio"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  // ---------------------------------------------------------
  // ADICIONAR BOTÕES
  // ---------------------------------------------------------

  if (data === "disparo:botoes") {
    const rawState = await env.KV_BOT_BANNERS.get(stateKey);

    if (!rawState) {
      return estadoExpirado(env, chatId);
    }

    const state = JSON.parse(rawState);

    state.step = "WAITING_BUTTONS_INPUT";

    await env.KV_BOT_BANNERS.put(
      stateKey,
      JSON.stringify(state),
      {
        expirationTtl: 3600
      }
    );

    await enviarTelegram(
      env.TELEGRAM_TOKEN,
      "sendMessage",
      {
        chat_id: chatId,

        text:
          "🔘 <b>ADICIONAR BOTÕES</b>\n\n" +

          "Envie os botões neste formato:\n\n" +

          "<code>Comprar - https://site.com</code>\n\n" +

          "Para colocar dois botões lado a lado:\n\n" +

          "<code>Comprar - https://site.com | Suporte - https://t.me/suporte</code>\n\n" +

          "Para criar outra linha, basta quebrar a linha.",

        parse_mode: "HTML",

        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "❌ Cancelar",
                callback_data: "disparo:cancelar"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  // ---------------------------------------------------------
  // SEM BOTÕES
  // ---------------------------------------------------------

  if (data === "disparo:sem_botoes") {
    const rawState = await env.KV_BOT_BANNERS.get(stateKey);

    if (!rawState) {
      return estadoExpirado(env, chatId);
    }

    const state = JSON.parse(rawState);

    state.buttons = null;
    state.step = "WAITING_CONFIRMATION";

    await env.KV_BOT_BANNERS.put(
      stateKey,
      JSON.stringify(state),
      {
        expirationTtl: 3600
      }
    );

    return mostrarConfirmacao(
      env,
      chatId,
      state
    );
  }

  // ---------------------------------------------------------
  // CONFIRMAR ENVIO
  // ---------------------------------------------------------

  if (data === "disparo:confirmar") {
    const rawState = await env.KV_BOT_BANNERS.get(stateKey);

    if (!rawState) {
      return estadoExpirado(env, chatId);
    }

    const state = JSON.parse(rawState);

    // Evita clique duplicado
    if (state.sending === true) {
      return;
    }

    state.sending = true;

    await env.KV_BOT_BANNERS.put(
      stateKey,
      JSON.stringify(state),
      {
        expirationTtl: 3600
      }
    );

    await enviarTelegram(
      env.TELEGRAM_TOKEN,
      "sendMessage",
      {
        chat_id: chatId,
        text:
          "🚀 <b>Iniciando disparo...</b>\n\n" +
          `📡 Destinos: <b>${LISTA_GRUPOS.length}</b> grupos`,
        parse_mode: "HTML"
      }
    );

    let sucessos = 0;
    let erros = 0;

    const replyMarkup = state.buttons
      ? {
          inline_keyboard: state.buttons
        }
      : undefined;

    for (const grupoId of LISTA_GRUPOS) {
      try {
        await enviarConteudo(
          env,
          grupoId,
          state,
          replyMarkup
        );

        sucessos++;
      } catch (error) {
        erros++;

        console.error(
          `[DISPARO] Erro no grupo ${grupoId}:`,
          error
        );
      }

      await sleep(1500);
    }

    await env.KV_BOT_BANNERS.delete(stateKey);

    await salvarHistorico(env, {
      tipo: "manual",
      sucessos,
      erros,
      total: LISTA_GRUPOS.length,
      data: Date.now()
    });

    await enviarTelegram(
      env.TELEGRAM_TOKEN,
      "sendMessage",
      {
        chat_id: chatId,

        text:
          "✅ <b>DISPARO FINALIZADO</b>\n\n" +
          `📤 Enviados: <b>${sucessos}</b>\n` +
          `❌ Erros: <b>${erros}</b>\n` +
          `👥 Total: <b>${LISTA_GRUPOS.length}</b>`,

        parse_mode: "HTML",

        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📢 Novo Disparo",
                callback_data: "menu:disparo"
              }
            ],
            [
              {
                text: "🏠 Painel",
                callback_data: "menu:inicio"
              }
            ]
          ]
        }
      }
    );

    return;
  }
}

// -------------------------------------------------------------
// CONFIRMAÇÃO
// -------------------------------------------------------------

export async function mostrarConfirmacao(
  env,
  chatId,
  state
) {
  await enviarTelegram(
    env.TELEGRAM_TOKEN,
    "sendMessage",
    {
      chat_id: chatId,

      text:
        "⚠️ <b>CONFIRMAR DISPARO</b>\n\n" +
        `👥 Destinos: <b>${LISTA_GRUPOS.length} grupos</b>\n\n` +
        "Deseja realmente enviar esta publicação?",

      parse_mode: "HTML",

      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🚀 Confirmar e Enviar",
              callback_data: "disparo:confirmar"
            }
          ],
          [
            {
              text: "❌ Cancelar",
              callback_data: "disparo:cancelar"
            }
          ]
        ]
      }
    }
  );
}

// -------------------------------------------------------------
// ENVIO DE CONTEÚDO
// -------------------------------------------------------------

async function enviarConteudo(
  env,
  chatId,
  state,
  replyMarkup
) {
  const payload = {
    chat_id: chatId,
    parse_mode: "HTML"
  };

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  if (state.mediaType === "photo") {
    payload.photo = state.fileId;

    if (state.caption) {
      payload.caption = state.caption;
    }

    return enviarTelegram(
      env.TELEGRAM_TOKEN,
      "sendPhoto",
      payload
    );
  }

  if (state.mediaType === "video") {
    payload.video = state.fileId;

    if (state.caption) {
      payload.caption = state.caption;
    }

    return enviarTelegram(
      env.TELEGRAM_TOKEN,
      "sendVideo",
      payload
    );
  }

  if (state.mediaType === "animation") {
    payload.animation = state.fileId;

    if (state.caption) {
      payload.caption = state.caption;
    }

    return enviarTelegram(
      env.TELEGRAM_TOKEN,
      "sendAnimation",
      payload
    );
  }

  payload.text = state.caption;

  return enviarTelegram(
    env.TELEGRAM_TOKEN,
    "sendMessage",
    payload
  );
}

// -------------------------------------------------------------
// HISTÓRICO SIMPLES
// -------------------------------------------------------------

async function salvarHistorico(env, registro) {
  let historico = [];

  const raw = await env.KV_BOT_BANNERS.get(
    "historico_envios"
  );

  if (raw) {
    try {
      historico = JSON.parse(raw);
    } catch {
      historico = [];
    }
  }

  historico.unshift(registro);

  historico = historico.slice(0, 30);

  await env.KV_BOT_BANNERS.put(
    "historico_envios",
    JSON.stringify(historico)
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function estadoExpirado(env, chatId) {
  return enviarTelegram(
    env.TELEGRAM_TOKEN,
    "sendMessage",
    {
      chat_id: chatId,

      text:
        "⚠️ <b>Essa operação expirou.</b>\n\n" +
        "Inicie um novo disparo.",

      parse_mode: "HTML",

      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📢 Novo Disparo",
              callback_data: "menu:disparo"
            }
          ]
        ]
      }
    }
  );
}
