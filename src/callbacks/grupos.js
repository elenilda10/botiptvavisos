import { editarTela } from "../services/telegram.js";
import { listarGrupos, removerGrupo } from "../services/groups.js";

export async function handleGruposCallback(env, callback) {
  const data = callback.data;

  if (data === "grupo:listar") return mostrarMenuGrupos(env, callback);
  if (data === "grupo:adicionar") return iniciarCadastroGrupo(env, callback);
  if (data === "grupo:remover") return mostrarRemocaoGrupo(env, callback);

  if (data.startsWith("grupo:delete:")) {
    const indice = Number(data.split(":")[2]);
    if (!Number.isInteger(indice)) return;
    await removerGrupo(env, indice);
    return mostrarMenuGrupos(env, callback);
  }
}

export async function mostrarMenuGrupos(env, callback) {
  const grupos = await listarGrupos(env);
  let texto = "👥 <b>GERENCIAR GRUPOS</b>\n\n" + `📊 Total cadastrado: <b>${grupos.length}</b>\n\n`;

  grupos.forEach((grupo, index) => {
    texto += `${index + 1}. <code>${grupo}</code>\n`;
  });

  if (!grupos.length) texto += "Nenhum grupo cadastrado.\n";

  return editarTela(env.TELEGRAM_TOKEN, callback, texto, [
    [{ text: "➕ Adicionar Grupo", callback_data: "grupo:adicionar" }],
    [{ text: "🗑 Remover Grupo", callback_data: "grupo:remover" }],
    [{ text: "🔄 Atualizar", callback_data: "grupo:listar" }],
    [{ text: "⬅️ Painel", callback_data: "menu:inicio" }]
  ]);
}

async function iniciarCadastroGrupo(env, callback) {
  const userId = callback.from.id.toString();

  await env.KV_BOT_BANNERS.put(
    `state_${userId}`,
    JSON.stringify({ step: "WAITING_GROUP_ID", panelMessageId: callback.message.message_id }),
    { expirationTtl: 3600 }
  );

  return editarTela(
    env.TELEGRAM_TOKEN,
    callback,
    "➕ <b>ADICIONAR GRUPO</b>\n\nEnvie agora o <b>ID do grupo</b> do Telegram.\n\nExemplo:\n<code>-1001234567890</code>",
    [[{ text: "❌ Cancelar", callback_data: "menu:grupos" }]]
  );
}

async function mostrarRemocaoGrupo(env, callback) {
  const grupos = await listarGrupos(env);
  const botoes = grupos.map((grupo, index) => [
    { text: `🗑 Grupo ${index + 1}`, callback_data: `grupo:delete:${index}` }
  ]);

  botoes.push([{ text: "⬅️ Voltar", callback_data: "menu:grupos" }]);

  return editarTela(
    env.TELEGRAM_TOKEN,
    callback,
    grupos.length
      ? "🗑 <b>REMOVER GRUPO</b>\n\nEscolha qual grupo deseja remover:"
      : "🗑 <b>REMOVER GRUPO</b>\n\nNenhum grupo cadastrado.",
    botoes
  );
}
