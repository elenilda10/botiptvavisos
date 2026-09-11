import { LISTA_GRUPOS } from "../config/constants.js";
import { enviarTelegram } from "../services/telegram.js";

export async function handleGruposCallback(env, callback) {
  const data = callback.data;

  if (data === "grupo:listar") {
    return mostrarMenuGrupos(env, callback);
  }

  if (data === "grupo:adicionar") {
    return iniciarCadastroGrupo(env, callback);
  }

  if (data === "grupo:remover") {
    return mostrarRemocaoGrupo(env, callback);
  }
}

// -------------------------------------------------------------
// MENU
// -------------------------------------------------------------

export async function mostrarMenuGrupos(env, callback) {
  const chatId = callback.message.chat.id;

  let texto =
    "👥 <b>GERENCIAR GRUPOS</b>\n\n" +
    `📊 Total cadastrado: <b>${LISTA_GRUPOS.length}</b>\n\n`;

  LISTA_GRUPOS.forEach((grupo, index) => {
    texto += `${index + 1}. <code>${grupo}</code>\n`;
  });

  await enviarTelegram(
    env.TELEGRAM_TOKEN,
    "sendMessage",
    {
      chat_id: chatId,

      text: texto,

      parse_mode: "HTML",

      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "➕ Adicionar Grupo",
              callback_data: "grupo:adicionar"
            }
          ],
          [
            {
              text: "🗑 Remover Grupo",
              callback_data: "grupo:remover"
            }
          ],
          [
            {
              text: "🔄 Atualizar",
              callback_data: "grupo:listar"
            }
          ],
          [
            {
              text: "⬅️ Painel",
              callback_data: "menu:inicio"
            }
          ]
        ]
      }
    }
  );
}

// -------------------------------------------------------------
// ADICIONAR
// -------------------------------------------------------------

async function iniciarCadastroGrupo(env, callback) {
  const chatId = callback.message.chat.id;
  const userId = callback.from.id.toString();

  await env.KV_BOT_BANNERS.put(
    `state_${userId}`,
    JSON.stringify({
      step: "WAITING_GROUP_ID"
    }),
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
        "➕ <b>ADICIONAR GRUPO</b>\n\n" +
        "Envie agora o <b>ID do grupo</b> do Telegram.\n\n" +
        "Exemplo:\n" +
        "<code>-1001234567890</code>\n\n" +
        "Na próxima etapa vamos salvar esse grupo no armazenamento do bot.",

      parse_mode: "HTML",

      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "❌ Cancelar",
              callback_data: "menu:grupos"
            }
          ]
        ]
      }
    }
  );
}

// -------------------------------------------------------------
// REMOVER
// -------------------------------------------------------------

async function mostrarRemocaoGrupo(env, callback) {
  const chatId = callback.message.chat.id;

  const botoes = LISTA_GRUPOS.map(
    (grupo, index) => [
      {
        text: `🗑 Grupo ${index + 1}`,
        callback_data: `grupo:delete:${index}`
      }
    ]
  );

  botoes.push([
    {
      text: "⬅️ Voltar",
      callback_data: "menu:grupos"
    }
  ]);

  await enviarTelegram(
    env.TELEGRAM_TOKEN,
    "sendMessage",
    {
      chat_id: chatId,

      text:
        "🗑 <b>REMOVER GRUPO</b>\n\n" +
        "Escolha qual grupo deseja remover:",

      parse_mode: "HTML",

      reply_markup: {
        inline_keyboard: botoes
      }
    }
  );
}
