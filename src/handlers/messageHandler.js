import { ADMINS_AUTORIZADOS } from "../config/constants.js";

import { comandoPainel } from "../commands/painel.js";
import { comandoSend } from "../commands/send.js";
import { comandoCancelar } from "../commands/cancelar.js";
import { comandoPromo15 } from "../commands/promo15.js";

export async function handleMessage(env, message) {
  const userId = message.from?.id?.toString();
  const texto = message.caption || message.text || "";

  if (!userId) {
    return;
  }

  // Segurança
  if (
    ADMINS_AUTORIZADOS.length > 0 &&
    !ADMINS_AUTORIZADOS.includes(userId)
  ) {
    return;
  }

  // -------------------------
  // COMANDOS
  // -------------------------

  if (texto === "/start" || texto === "/painel") {
    return comandoPainel(env, message);
  }

  if (texto === "/send") {
    return comandoSend(env, message);
  }

  if (texto === "/cancelar") {
    return comandoCancelar(env, message);
  }

  if (texto === "/15") {
    return comandoPromo15(env, message);
  }

  // -------------------------
  // ESTADO DA CONVERSA
  // -------------------------

  const rawState = await env.KV_BOT_BANNERS.get(
    `state_${userId}`
  );

  if (!rawState) {
    return;
  }

  const state = JSON.parse(rawState);

  switch (state.step) {
    case "WAITING_MEDIA":
      return processarMidia(env, message, state);

    case "WAITING_BUTTONS_INPUT":
      return processarBotoes(env, message, state);

    default:
      return;
  }
}
