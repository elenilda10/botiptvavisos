import { comandoPainel } from "../commands/painel.js";
import { iniciarDisparo } from "../commands/send.js";
import { editarTela } from "../services/telegram.js";
import { mostrarMenuGrupos } from "./grupos.js";
import { mostrarMenuBanners } from "./banners.js";
import { mostrarHistorico } from "./historico.js";
import { mostrarConfiguracoes } from "./config.js";

export async function handleMenuCallback(env, callback) {
  const data = callback.data;
  const userId = callback.from.id.toString();

  if (data === "menu:inicio") return comandoPainel(env, callback.message);

  if (data === "menu:disparo") {
    return iniciarDisparo(env, {
      chatId: callback.message.chat.id,
      userId,
      panelMessageId: callback.message.message_id
    });
  }

  if (data === "menu:grupos") return mostrarMenuGrupos(env, callback);
  if (data === "menu:banners") return mostrarMenuBanners(env, callback);
  if (data === "menu:historico") return mostrarHistorico(env, callback);
  if (data === "menu:config") return mostrarConfiguracoes(env, callback);
}
