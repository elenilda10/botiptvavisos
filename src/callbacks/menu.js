import { comandoPainel } from "../commands/painel.js";
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
    await env.KV_BOT_BANNERS.put(
      `state_${userId}`,
      JSON.stringify({ step: "WAITING_MEDIA", panelMessageId: callback.message.message_id }),
      { expirationTtl: 3600 }
    );

    return editarTela(
      env.TELEGRAM_TOKEN,
      callback,
      "📢 <b>NOVO DISPARO</b>\n\n━━━━━━━━━━━━━━━━━━\n📸 <b>Envie o conteúdo</b>\n━━━━━━━━━━━━━━━━━━\n\nVocê pode enviar:\n\n📝 Texto\n🖼 Foto\n🎥 Vídeo\n🎞 GIF / Animação\n\nO painel será atualizado nesta mesma mensagem para manter o chat organizado.",
      [
        [{ text: "❌ Cancelar", callback_data: "disparo:cancelar" }],
        [{ text: "⬅️ Painel", callback_data: "menu:inicio" }]
      ]
    );
  }

  if (data === "menu:grupos") return mostrarMenuGrupos(env, callback);
  if (data === "menu:banners") return mostrarMenuBanners(env, callback);
  if (data === "menu:historico") return mostrarHistorico(env, callback);
  if (data === "menu:config") return mostrarConfiguracoes(env, callback);
}
