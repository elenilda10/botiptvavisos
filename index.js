import { handleMessage } from "./src/handlers/messageHandler.js";
import { handleCallback } from "./src/handlers/callbackHandler.js";
import { handleScheduled } from "./src/handlers/scheduledHandler.js";

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      handleScheduled(env, controller)
    );
  },

  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        const update = await request.json();

        if (update.message) {
          ctx.waitUntil(
            handleMessage(env, update.message)
          );
        }

        if (update.callback_query) {
          ctx.waitUntil(
            handleCallback(env, update.callback_query)
          );
        }

        return new Response("OK", {
          status: 200
        });

      } catch (error) {
        console.error(
          "[WEBHOOK] Erro:",
          error
        );

        return new Response(
          "Erro ao processar webhook",
          {
            status: 400
          }
        );
      }
    }

    return new Response(
      "🤖 Bot ativo",
      {
        status: 200
      }
    );
  }
};
