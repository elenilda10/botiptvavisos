export default {
  // Executa automaticamente nos horários agendados pelo Cron do Cloudflare (Banners automáticos)
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(executarEnvioBanners(env));
  },

  // Processa o Webhook do Telegram e requisições HTTP manuais
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. REQUISIÇÃO POST (Webhook vindo do Telegram)
    if (request.method === "POST") {
      try {
        const update = await request.json();

        // Processa mensagens enviadas para o Bot
        if (update.message) {
          ctx.waitUntil(processarMensagem(env, update.message));
        }

        // Processa cliques em botões inline (Callback)
        if (update.callback_query) {
          ctx.waitUntil(processarCallback(env, update.callback_query));
        }

        return new Response("OK", { status: 200 });
      } catch (e) {
        return new Response("Erro ao processar requisição do Webhook", { status: 400 });
      }
    }

    // 2. REQUISIÇÃO GET (Disparo manual via navegação/URL)
    const tipo = url.searchParams.get("tipo");
    const force = url.searchParams.get("force") === "true";
    const horaAtualBR = obterHoraBrasilia();

    if (tipo === "banner") {
      if (horaAtualBR !== 20 && !force) {
        return new Response(
          `⚠️ Envio cancelado: O disparo padrão ocorre às 20h (Horário de Brasília).\nHorário atual: ${horaAtualBR}h.\n(Para forçar o envio agora, use: ?tipo=banner&force=true)`,
          { status: 200 }
        );
      }
      ctx.waitUntil(executarEnvioBanners(env, true)); // Força ignore da trava no cron
      return new Response("🚀 Disparo dos Banners promocionais iniciado!", { status: 200 });
    }

    return new Response("🤖 Bot ativo com suporte a Webhook, fluxo /send e Banners automáticos!", { status: 200 });
  }
};

// -------------------------------------------------------------
// CONFIGURAÇÕES GERAIS E GRUPOS
// -------------------------------------------------------------

// IDs numéricos do Telegram com permissão de uso do comando /send
const ADMINS_AUTORIZADOS = [
  "7717528550", // Substitua pelo seu Telegram ID
  "987654321"  // Substitua pelo Telegram ID do Sr. Flamengo (se houver)
];

// Lista de grupos onde os disparos serão efetuados
const LISTA_GRUPOS = [
  "-1002639652972", // Assistir Flamengo 2
  "-1001597337339", // Jogos do Flamengo 1
  "-1001825003132", // Super Midia HP 3
  "-1001860646849", // Super Mídia HP 4
  "-1001615563422", // Super Mídia HP 5
  "-1001946792700", // Super Mídia HP 6
  "-1001986844811", // Super Mídia HP 7
  "-1001960532297", // Super Mídia HP 8
  "-1001870101218"  // Canais de TV, Filmes e Séries
];

const LINK_PADRAO = "https://t.me/iptvsupermidia";

// -------------------------------------------------------------
// FLUXO INTERATIVO DO COMANDO /send E COMANDO /15
// -------------------------------------------------------------

async function processarMensagem(env, message) {
  const userId = message.from.id.toString();
  const chatId = message.chat.id;

  // Trava de segurança para administradores
  if (ADMINS_AUTORIZADOS.length > 0 && !ADMINS_AUTORIZADOS.includes(userId)) return;

  const texto = message.caption || message.text || "";

  // Comando /cancelar -> Reseta o estado a qualquer momento
  if (texto === "/cancelar") {
    await env.KV_BOT_BANNERS.delete(`state_${userId}`);
    await enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: "❌ <b>Operação cancelada!</b> O bot foi resetado.",
      parse_mode: "HTML"
    });
    return;
  }

  // Comando /15 -> Disparo rápido de promoção para TODOS os grupos da LISTA_GRUPOS
  if (texto === "/15") {
    // Apenas administradores autorizados chegam até aqui (verificação acima)
    const foto = "https://i.ibb.co/XfD93hhG/file-7.jpg";
    const legenda =
      "⚡ ENTRETENIMENTO POR APENAS R$1 POR DIA!\n\n" +
      "📺 São 15 dias de acesso por apenas R$15.\n\n" +
      "💰 R$1 por dia. Simples, econômico e flexível.\n\n" +
      "👉 Chama no privado!";

    // Envia para todos os grupos com intervalo anti-spam
    let sucessos = 0;
    for (const grupoId of LISTA_GRUPOS) {
      try {
        await enviarTelegram(env.TELEGRAM_TOKEN, "sendPhoto", {
          chat_id: grupoId,
          photo: foto,
          caption: legenda,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "👉 Chama no privado!", url: "https://t.me/Admmachine" }]]
          }
        });
        sucessos++;
      } catch (e) {
        console.log(`[ERRO] Falha ao enviar /15 para ${grupoId}:`, e);
      }
      // Intervalo anti-spam entre envios
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Confirmação para o administrador que executou o comando
    await enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Comando /15 executado.</b>\nEnviado para ${sucessos} grupos.`,
      parse_mode: "HTML"
    });
    return;
  }

  // Obtém o estado atual da conversa no KV
  const rawState = await env.KV_BOT_BANNERS.get(`state_${userId}`);
  const state = rawState ? JSON.parse(rawState) : null;

  // 1. INÍCIO DO FLUXO: /send
  if (texto === "/send" || texto === "/start") {
    await env.KV_BOT_BANNERS.put(`state_${userId}`, JSON.stringify({ step: "WAITING_MEDIA" }));

    await enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: "📸 <b>Passo 1/3: Envie o conteúdo do disparo</b>\n\n" +
            "Você pode enviar:\n" +
            "• Uma <b>Foto</b> (com ou sem legenda)\n" +
            "• Um <b>Vídeo</b> (com ou sem legenda)\n" +
            "• Um <b>GIF / Animação</b> (com ou sem legenda)\n" +
            "• Apenas <b>Texto</b>\n\n" +
            "<i>Para cancelar a qualquer momento, digite /cancelar</i>",
      parse_mode: "HTML"
    });
    return;
  }

  // 2. RECEBENDO MÍDIA OU TEXTO
  if (state && state.step === "WAITING_MEDIA") {
    let mediaType = "text";
    let fileId = null;

    if (message.photo) {
      mediaType = "photo";
      fileId = message.photo[message.photo.length - 1].file_id; // Foto na maior resolução
    } else if (message.video) {
      mediaType = "video";
      fileId = message.video.file_id;
    } else if (message.animation) {
      mediaType = "animation";
      fileId = message.animation.file_id;
    }

    const payloadState = {
      step: "WAITING_BUTTONS_CHOICE",
      mediaType: mediaType,
      fileId: fileId,
      caption: texto
    };

    await env.KV_BOT_BANNERS.put(`state_${userId}`, JSON.stringify(payloadState));

    await enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: "✅ <b>Mídia/Texto recebidos com sucesso!</b>\n\n" +
            "Deseja adicionar <b>botões interativos</b> a essa publicação?",
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "➕ Adicionar Botões", callback_data: "btn_yes" }],
          [{ text: "➡️ Enviar sem Botões", callback_data: "btn_no" }]
        ]
      }
    });
    return;
  }

  // 3. RECEBENDO A ESTRUTURA DOS BOTÕES EM TEXTO
  if (state && state.step === "WAITING_BUTTONS_INPUT") {
    const inlineKeyboard = montarTecladoBotoes(texto);

    if (inlineKeyboard.length === 0) {
      await enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
        chat_id: chatId,
        text: "⚠️ <b>Formato inválido!</b> Envie no formato:\n<code>Texto do Botão - https://link.com</code>",
        parse_mode: "HTML"
      });
      return;
    }

    state.step = "WAITING_CONFIRMATION";
    state.buttons = inlineKeyboard;
    await env.KV_BOT_BANNERS.put(`state_${userId}`, JSON.stringify(state));

    // Exibe Prévia da Mensagem com os Botões
    await enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: "👀 <b>Prévia de como os botões vão ficar:</b>",
      parse_mode: "HTML"
    });

    await enviarConteudo(env.TELEGRAM_TOKEN, chatId, state, { inline_keyboard: inlineKeyboard });

    await enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: "⚙️ <b>Confirma o disparo para todos os grupos?</b>",
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Confirmar e Disparar", callback_data: "confirm_send" }],
          [{ text: "❌ Cancelar", callback_data: "cancel_send" }]
        ]
      }
    });
  }
}

// -------------------------------------------------------------
// PROCESSAMENTO DAS RESPOSTAS DOS BOTÕES INLINE (CALLBACK)
// -------------------------------------------------------------

async function processarCallback(env, callback) {
  const userId = callback.from.id.toString();
  const chatId = callback.message.chat.id;
  const data = callback.data;

  await enviarTelegram(env.TELEGRAM_TOKEN, "answerCallbackQuery", { callback_query_id: callback.id });

  const rawState = await env.KV_BOT_BANNERS.get(`state_${userId}`);
  if (!rawState) return;

  const state = JSON.parse(rawState);

  // Opção: NÃO adicionar botões
  if (data === "btn_no") {
    state.step = "WAITING_CONFIRMATION";
    state.buttons = null;
    await env.KV_BOT_BANNERS.put(`state_${userId}`, JSON.stringify(state));

    await enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: "👀 <b>Prévia da mensagem sem botões:</b>",
      parse_mode: "HTML"
    });

    await enviarConteudo(env.TELEGRAM_TOKEN, chatId, state, null);

    await enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: "⚙️ <b>Confirma o disparo para todos os grupos?</b>",
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Confirmar e Disparar", callback_data: "confirm_send" }],
          [{ text: "❌ Cancelar", callback_data: "cancel_send" }]
        ]
      }
    });
    return;
  }

  // Opção: SIM, adicionar botões
  if (data === "btn_yes") {
    state.step = "WAITING_BUTTONS_INPUT";
    await env.KV_BOT_BANNERS.put(`state_${userId}`, JSON.stringify(state));

    await enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: "🔘 <b>Passo 2/3: Envie a estrutura dos botões</b>\n\n" +
            "<b>1️⃣ Botões Empilhados (Um abaixo do outro):</b>\n" +
            "Envie cada botão em uma linha separada:\n" +
            "<code>Comprar Acesso - https://link1.com\nGrupo VIP - https://link2.com</code>\n\n" +
            "<b>2️⃣ Botões Lado a Lado (Na mesma linha):</b>\n" +
            "Separe os botões da mesma linha usando <code>|</code>:\n" +
            "<code>Entrar no Grupo - https://link1.com | Suporte - https://link2.com</code>\n\n" +
            "<b>3️⃣ Grade Mista (Exemplo):</b>\n" +
            "<code>Assistir - https://link1.com | Comprar - https://link2.com\nAjuda - https://link3.com</code>",
      parse_mode: "HTML"
    });
    return;
  }

  // Opção: Cancelar disparo
  if (data === "cancel_send") {
    await env.KV_BOT_BANNERS.delete(`state_${userId}`);
    await enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: "❌ <b>Envio cancelado com sucesso.</b>",
      parse_mode: "HTML"
    });
    return;
  }

  // Opção: Confirmar e Disparar para todos os grupos
  if (data === "confirm_send") {
    await env.KV_BOT_BANNERS.delete(`state_${userId}`);

    await enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: "🚀 <b>Iniciando disparo em todos os grupos... Por favor, aguarde.</b>",
      parse_mode: "HTML"
    });

    let sucessos = 0;
    const replyMarkup = state.buttons ? { inline_keyboard: state.buttons } : null;

    for (const grupoId of LISTA_GRUPOS) {
      await enviarConteudo(env.TELEGRAM_TOKEN, grupoId, state, replyMarkup);
      sucessos++;
      await new Promise(resolve => setTimeout(resolve, 2000)); // Intervalo anti-spam
    }

    await enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Disparo concluído com sucesso!</b>\nEnviado para ${sucessos} grupos.`,
      parse_mode: "HTML"
    });
  }
}

// -------------------------------------------------------------
// ENVIOS AUTOMÁTICOS DE BANNERS (FUNÇÃO ANTIGA MANTIDA)
// -------------------------------------------------------------

async function executarEnvioBanners(env, forcar = false) {
  const horaAtual = obterHoraBrasilia();
  
  // Validação de horário para execuções via Cron
  if (horaAtual !== 20 && !forcar) {
    console.log(`[CANCELADO] Tentativa de disparo fora do horário. Hora em Brasília: ${horaAtual}h`);
    return;
  }

  // Busca qual foi o último banner enviado no KV
  const ultimoBanner = (await env.KV_BOT_BANNERS.get("ultimo_banner")) || "2";
  const enviarBanner1 = (ultimoBanner === "2");

  if (enviarBanner1) {
    const textoBanner1 =
      "🚨 <b>ATENÇÃO PESSOAL</b> 🚨\n\n" +
      "O grupo de transmissão será encerrado em breve ❌\n" +
      "Mas calma… agora temos algo <b>MUITO MELHOR</b> 🔥\n\n" +
      "📺 Nosso novo grupo IPTV já está disponível com:\n\n" +
      "✅ <b>TODOS os canais</b>\n" +
      "✅ <b>Filmes atualizados</b>\n" +
      "✅ <b>Séries completas</b>\n" +
      "✅ <b>Jogos ao vivo</b>\n" +
      "✅ <b>Muito mais conteúdo em um só lugar</b>\n\n" +
      "💸 E o melhor: sai <b>MUITO mais barato</b> do que ficar comprando jogo por jogo!\n\n" +
      "Você paga uma única vez e tem acesso completo 🔥\n\n" +
      "👉 <b>NÃO FIQUE DE FORA!</b>\n" +
      "📲 Quem tiver interesse, entre em nosso grupo pelo botão abaixo. 👇";

    for (const chatId of LISTA_GRUPOS) {
      await enviarTelegram(env.TELEGRAM_TOKEN, "sendMessage", {
        chat_id: chatId,
        text: textoBanner1,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "📲 Entrar no grupo IPTV", url: LINK_PADRAO }]]
        }
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    await env.KV_BOT_BANNERS.put("ultimo_banner", "1");

  } else {
    const foto = "https://i.ibb.co/JRkzyM04/IMG-20260801-WA0020.jpg";
    const textoBanner2 =
      "🔥 <b>PROMOÇÃO IMPERDÍVEL</b> 🔥\n\n" +
      "📺 Tenha acesso a canais, filmes e séries por um preço que cabe no seu bolso!\n\n" +
      "💰 <b>Plano mensal:</b> R$25\n\n" +
      "🚀 <b>PROGRAMA DE INDICAÇÃO:</b>\n" +
      "Indicou um amigo e ele assinou?\n" +
      "🎁 Você ganha <b>1 MÊS GRÁTIS!</b>\n\n" +
      "Quanto mais indicar, mais meses grátis você ganha!\n\n" +
      "📲 Entre em contato agora e aproveite!";

    for (const chatId of LISTA_GRUPOS) {
      await enviarTelegram(env.TELEGRAM_TOKEN, "sendPhoto", {
        chat_id: chatId,
        photo: foto,
        caption: textoBanner2,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "📲 Quero aproveitar", url: LINK_PADRAO }]]
        }
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    await env.KV_BOT_BANNERS.put("ultimo_banner", "2");
  }
}

// -------------------------------------------------------------
// FUNÇÕES AUXILIARES E ESTRUTURAIS
// -------------------------------------------------------------

// Monta o layout de botões respeitando quebras de linha (\n) e colunas (|)
function montarTecladoBotoes(textoInput) {
  const linhas = textoInput.trim().split("\n");
  const inlineKeyboard = [];

  for (const linha of linhas) {
    const botoesDaLinha = [];
    const itens = linha.split("|");

    for (const item of itens) {
      const partes = item.split(" - ");
      if (partes.length >= 2) {
        const btnTexto = partes[0].trim();
        let btnUrl = partes.slice(1).join(" - ").trim();

        if (!btnUrl.startsWith("http://") && !btnUrl.startsWith("https://")) {
          btnUrl = "https://" + btnUrl;
        }

        botoesDaLinha.push({ text: btnTexto, url: btnUrl });
      }
    }

    if (botoesDaLinha.length > 0) {
      inlineKeyboard.push(botoesDaLinha);
    }
  }

  return inlineKeyboard;
}

// Direciona a requisição para a API do Telegram conforme o tipo de mídia
async function enviarConteudo(token, chatId, data, replyMarkup) {
  const payload = {
    chat_id: chatId,
    parse_mode: "HTML"
  };

  if (replyMarkup) payload.reply_markup = replyMarkup;

  if (data.mediaType === "photo") {
    payload.photo = data.fileId;
    payload.caption = data.caption;
    return await enviarTelegram(token, "sendPhoto", payload);
  } else if (data.mediaType === "video") {
    payload.video = data.fileId;
    payload.caption = data.caption;
    return await enviarTelegram(token, "sendVideo", payload);
  } else if (data.mediaType === "animation") {
    payload.animation = data.fileId;
    payload.caption = data.caption;
    return await enviarTelegram(token, "sendAnimation", payload);
  } else {
    payload.text = data.caption;
    return await enviarTelegram(token, "sendMessage", payload);
  }
}

// Auxiliar genérico para chamadas à API do Telegram
async function enviarTelegram(token, metodo, payload) {
  return await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

// Retorna a hora atual em Brasília (0 a 23)
function obterHoraBrasilia() {
  const horaStr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hour12: false
  }).format(new Date());

  return parseInt(horaStr, 10);
}
