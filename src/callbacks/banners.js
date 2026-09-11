import { editarTela } from "../services/telegram.js";

export async function handleBannersCallback(env, callback) {
  const data = callback.data;

  if (data === "banner:menu") {
    return mostrarMenuBanners(env, callback);
  }

  if (data === "banner:status") {
    const ultimo = (await env.KV_BOT_BANNERS.get("ultimo_banner")) || "nenhum";

    return editarTela(
      env.TELEGRAM_TOKEN,
      callback,
      "📊 <b>STATUS DOS BANNERS</b>\n\n" +
        `Último banner enviado: <b>${ultimo}</b>\n\n` +
        "🕗 Horário automático: <b>20:00</b>\n" +
        "🌎 Fuso: <b>Brasília</b>",
      [[{ text: "⬅️ Voltar", callback_data: "menu:banners" }]]
    );
  }

  if (data === "banner:reset") {
    await env.KV_BOT_BANNERS.delete("ultimo_banner");

    return editarTela(
      env.TELEGRAM_TOKEN,
      callback,
      "🔄 <b>Alternância dos banners resetada.</b>\n\n" +
        "O próximo disparo começará novamente pelo Banner 1.",
      [[{ text: "⬅️ Voltar", callback_data: "menu:banners" }]]
    );
  }
}

export async function mostrarMenuBanners(env, callback) {
  const ultimo = (await env.KV_BOT_BANNERS.get("ultimo_banner")) || "Nenhum";

  return editarTela(
    env.TELEGRAM_TOKEN,
    callback,
    "🖼 <b>BANNERS AUTOMÁTICOS</b>\n\n" +
      "━━━━━━━━━━━━━━━━━━\n" +
      "⏰ Horário: <b>20:00</b>\n" +
      `🔄 Último banner: <b>${ultimo}</b>\n` +
      "━━━━━━━━━━━━━━━━━━\n\n" +
      "Gerencie os banners automáticos abaixo:",
    [
      [{ text: "📊 Status", callback_data: "banner:status" }],
      [{ text: "🔄 Resetar Alternância", callback_data: "banner:reset" }],
      [{ text: "⬅️ Painel", callback_data: "menu:inicio" }]
    ]
  );
}
