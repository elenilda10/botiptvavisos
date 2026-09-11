export async function enviarTelegram(
  token,
  metodo,
  payload
) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/${metodo}`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify(payload)
    }
  );

  const resultado = await response.json();

  if (!response.ok || !resultado.ok) {
    console.error(
      "Erro Telegram:",
      metodo,
      resultado
    );

    throw new Error(
      resultado.description ||
      `Erro Telegram HTTP ${response.status}`
    );
  }

  return resultado.result;
}
