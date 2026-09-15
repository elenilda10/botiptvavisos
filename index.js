import { handleMessage } from "./src/handlers/messageHandler.js";
import { handleCallback } from "./src/handlers/callbackHandler.js";
import { handleScheduled } from "./src/handlers/scheduledHandler.js";
import {
  handleBusinessConnection,
  handleBusinessMessage,
  handleBusinessCallback,
  handleEditedBusinessMessage,
  handleDeletedBusinessMessages
} from "./src/handlers/businessHandler.js";

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
          ctx.waitUntil((async () => {
            const handled = await handleBusinessCallback(env, update.callback_query);
            if (!handled) {
              await handleCallback(env, update.callback_query);
            }
          })());
        }

        if (update.business_connection) {
          ctx.waitUntil(
            handleBusinessConnection(env, update.business_connection)
          );
        }

        if (update.business_message) {
          ctx.waitUntil(
            handleBusinessMessage(env, update.business_message)
          );
        }

        if (update.edited_business_message) {
          ctx.waitUntil(
            handleEditedBusinessMessage(env, update.edited_business_message)
          );
        }

        if (update.deleted_business_messages) {
          ctx.waitUntil(
            handleDeletedBusinessMessages(env, update.deleted_business_messages)
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
