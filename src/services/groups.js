import { LISTA_GRUPOS } from "../config/constants.js";

const KEY = "grupos_config";

export async function listarGrupos(env) {
  const raw = await env.KV_BOT_BANNERS.get(KEY);

  if (!raw) {
    return [...LISTA_GRUPOS];
  }

  try {
    const grupos = JSON.parse(raw);
    return Array.isArray(grupos) ? grupos.map(String) : [...LISTA_GRUPOS];
  } catch {
    return [...LISTA_GRUPOS];
  }
}

export async function salvarGrupos(env, grupos) {
  const unicos = [...new Set(grupos.map(String))];
  await env.KV_BOT_BANNERS.put(KEY, JSON.stringify(unicos));
  return unicos;
}

export async function adicionarGrupo(env, grupoId) {
  const grupos = await listarGrupos(env);
  const id = String(grupoId).trim();

  if (!grupos.includes(id)) {
    grupos.push(id);
    await salvarGrupos(env, grupos);
  }

  return grupos;
}

export async function removerGrupo(env, indice) {
  const grupos = await listarGrupos(env);

  if (indice < 0 || indice >= grupos.length) {
    return grupos;
  }

  grupos.splice(indice, 1);
  await salvarGrupos(env, grupos);
  return grupos;
}
