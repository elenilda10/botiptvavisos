import { ADMINS_AUTORIZADOS } from "../config/constants.js";
import { comandoPainel } from "../commands/painel.js";
import { comandoSend } from "../commands/send.js";
import { comandoCancelar } from "../commands/cancelar.js";
import { comandoPromo15 } from "../commands/promo15.js";
import { adicionarGrupo } from "../services/groups.js";
import { atualizarPainel } from "../services/panel.js";
import { enviarTelegram } from "../services/telegram.js";
import { mostrarConfirmacao } from "../callbacks/disparo.js";

export async function handleMessage(env, message) {
  const userId = message.from?.id?.toString(), texto = message.caption || message.text || "";
  if (!userId || (ADMINS_AUTORIZADOS.length > 0 && !ADMINS_AUTORIZADOS.includes(userId))) return;
  if (texto === "/start" || texto === "/painel") return comandoPainel(env, message);
  if (texto === "/send") return comandoSend(env, message);
  if (texto === "/cancelar") return comandoCancelar(env, message);
  if (texto === "/15") return comandoPromo15(env, message);
  const stateKey = `state_${userId}`, raw = await env.KV_BOT_BANNERS.get(stateKey); if (!raw) return;
  let state; try { state = JSON.parse(raw); } catch { await env.KV_BOT_BANNERS.delete(stateKey); return; } state.userId = userId;
  if (message.media_group_id && ["WAITING_MEDIA", "WAITING_ALBUM"].includes(state.step)) return receberItemAlbum(env, message, state);
  switch (state.step) {
    case "WAITING_MEDIA": return processarMidia(env, message, state);
    case "WAITING_CAPTION": return processarLegenda(env, message, state);
    case "WAITING_BUTTONS_INPUT": return processarBotoes(env, message, state);
    case "WAITING_GROUP_ID": return processarGrupo(env, message, state);
  }
}

async function apagarMensagemUsuario(env, message) {
  if (!message?.chat?.id || !message?.message_id) return false;
  try {
    await enviarTelegram(env.TELEGRAM_TOKEN, "deleteMessage", { chat_id: message.chat.id, message_id: message.message_id });
    return true;
  } catch (error) {
    console.error("[LIMPEZA] Falha ao apagar mensagem recebida", { chatId: message.chat.id, messageId: message.message_id, tipo: message.poll ? "poll" : "outro", erro: error.message || error });
    return false;
  }
}
function itemAlbum(m) { if (m.photo?.length) return { type:"photo",media:m.photo.at(-1).file_id,caption:m.caption||"",messageId:m.message_id }; if(m.video)return{type:"video",media:m.video.file_id,caption:m.caption||"",messageId:m.message_id}; if(m.document)return{type:"document",media:m.document.file_id,caption:m.caption||"",messageId:m.message_id}; if(m.audio)return{type:"audio",media:m.audio.file_id,caption:m.caption||"",messageId:m.message_id}; return null; }
function midiaAceitaLegenda(type) { return ["photo","video","animation","document","audio","voice","album"].includes(type); }
function temLegenda(state) { return state.mediaType === "album" ? (state.album||[]).some(x => String(x.caption||"").trim()) : Boolean(String(state.caption||"").trim()); }
async function oferecerLegendaOuBotoes(env,chatId,state){const key=`state_${state.userId}`;if(midiaAceitaLegenda(state.mediaType)&&!temLegenda(state)){state.step="WAITING_CAPTION_CHOICE";await env.KV_BOT_BANNERS.put(key,JSON.stringify(state),{expirationTtl:3600});return atualizarPainel(env,chatId,state.panelMessageId,"📝 <b>MÍDIA RECEBIDA SEM LEGENDA</b>\n\nDeseja adicionar uma legenda antes de continuar?",[[{text:"📝 Adicionar Legenda",callback_data:"disparo:legenda"}],[{text:"➡️ Continuar sem Legenda",callback_data:"disparo:sem_legenda"}],[{text:"❌ Cancelar",callback_data:"disparo:cancelar"}]])}return oferecerBotoes(env,chatId,state)}
async function oferecerBotoes(env,chatId,state){state.step="WAITING_BUTTON_CHOICE";await env.KV_BOT_BANNERS.put(`state_${state.userId}`,JSON.stringify(state),{expirationTtl:3600});return atualizarPainel(env,chatId,state.panelMessageId,"✅ <b>CONTEÚDO RECEBIDO</b>\n\nDeseja adicionar botões à publicação?",[[{text:"🔘 Adicionar Botões",callback_data:"disparo:botoes"}],[{text:"➡️ Continuar sem Botões",callback_data:"disparo:sem_botoes"}],[{text:"❌ Cancelar",callback_data:"disparo:cancelar"}]])}
async function receberItemAlbum(env,message,state){const userId=message.from.id.toString(),key=`state_${userId}`,groupId=String(message.media_group_id),item=itemAlbum(message);if(!item)return;const prefix=`album_${userId}_${groupId}_`;await env.KV_BOT_BANNERS.put(`${prefix}${message.message_id}`,JSON.stringify(item),{expirationTtl:300});await apagarMensagemUsuario(env,message);state.mediaType="album";state.mediaGroupId=groupId;state.step="WAITING_ALBUM";state.albumLastAt=Date.now();await env.KV_BOT_BANNERS.put(key,JSON.stringify(state),{expirationTtl:3600});await new Promise(r=>setTimeout(r,1800));const r=await env.KV_BOT_BANNERS.get(key);if(!r)return;const current=JSON.parse(r);if(current.step!=="WAITING_ALBUM"||current.mediaGroupId!==groupId||Date.now()-(current.albumLastAt||0)<1400)return;const listed=await env.KV_BOT_BANNERS.list({prefix}),album=[];for(const k of listed.keys||[]){const v=await env.KV_BOT_BANNERS.get(k.name);if(v)try{album.push(JSON.parse(v))}catch{}}album.sort((a,b)=>a.messageId-b.messageId);if(!album.length)return;current.album=album;current.buttons=null;for(const k of listed.keys||[])await env.KV_BOT_BANNERS.delete(k.name);return oferecerLegendaOuBotoes(env,message.chat.id,current)}

async function processarMidia(env,m,state){const userId=m.from.id.toString(),key=`state_${userId}`;
  if(m.photo?.length){state.mediaType="photo";state.fileId=m.photo.at(-1).file_id;state.caption=m.caption||""}
  else if(m.video){state.mediaType="video";state.fileId=m.video.file_id;state.caption=m.caption||""}
  else if(m.animation){state.mediaType="animation";state.fileId=m.animation.file_id;state.caption=m.caption||""}
  else if(m.document){state.mediaType="document";state.fileId=m.document.file_id;state.caption=m.caption||""}
  else if(m.audio){state.mediaType="audio";state.fileId=m.audio.file_id;state.caption=m.caption||""}
  else if(m.voice){state.mediaType="voice";state.fileId=m.voice.file_id;state.caption=m.caption||""}
  else if(m.video_note){state.mediaType="video_note";state.fileId=m.video_note.file_id;state.caption=""}
  else if(m.sticker){state.mediaType="sticker";state.fileId=m.sticker.file_id;state.caption=""}
  else if(m.poll){state.mediaType="poll";state.poll={question:m.poll.question,options:m.poll.options.map(o=>o.text),is_anonymous:m.poll.is_anonymous,type:m.poll.type,allows_multiple_answers:m.poll.allows_multiple_answers,correct_option_id:m.poll.correct_option_id,explanation:m.poll.explanation||undefined};state.caption=""}
  else if(m.location){state.mediaType="location";state.location={latitude:m.location.latitude,longitude:m.location.longitude};state.caption=""}
  else if(m.venue){state.mediaType="venue";state.venue={latitude:m.venue.location.latitude,longitude:m.venue.location.longitude,title:m.venue.title,address:m.venue.address};state.caption=""}
  else if(m.contact){state.mediaType="contact";state.contact={phone_number:m.contact.phone_number,first_name:m.contact.first_name,last_name:m.contact.last_name||undefined,vcard:m.contact.vcard||undefined};state.caption=""}
  else if(m.dice){state.mediaType="dice";state.diceEmoji=m.dice.emoji;state.caption=""}
  else if(m.text){state.mediaType="text";state.fileId=null;state.caption=m.text}else return;

  // Primeiro apaga o conteúdo ORIGINAL. Só depois o fluxo pode criar a prévia.
  const apagou = await apagarMensagemUsuario(env,m);
  if (!apagou) {
    state.step="WAITING_DELETE_RETRY";
    await env.KV_BOT_BANNERS.put(key,JSON.stringify(state),{expirationTtl:3600});
    return atualizarPainel(env,m.chat.id,state.panelMessageId,
      "⚠️ <b>Não consegui apagar a mensagem original.</b>\n\nO disparo não avançou para evitar deixar o conteúdo duplicado. Verifique se o bot possui permissão para apagar mensagens neste chat e tente novamente.",
      [[{text:"❌ Cancelar",callback_data:"disparo:cancelar"}]]);
  }

  state.userId=userId;state.buttons=null;await env.KV_BOT_BANNERS.put(key,JSON.stringify(state),{expirationTtl:3600});
  const direto=["poll","sticker","video_note","location","venue","contact","dice"];
  if(direto.includes(state.mediaType)){state.step="WAITING_CONFIRMATION";await env.KV_BOT_BANNERS.put(key,JSON.stringify(state),{expirationTtl:3600});return mostrarConfirmacao(env,m.chat.id,state)}
  return oferecerLegendaOuBotoes(env,m.chat.id,state);
}

async function processarLegenda(env,message,state){if(!message.text)return;const userId=message.from.id.toString();await apagarMensagemUsuario(env,message);const legenda=message.text;if(state.mediaType==="album")state.album=(state.album||[]).map((x,i)=>({...x,caption:i===0?legenda:""}));else state.caption=legenda;state.userId=userId;await env.KV_BOT_BANNERS.put(`state_${userId}`,JSON.stringify(state),{expirationTtl:3600});return oferecerBotoes(env,message.chat.id,state)}
async function processarBotoes(env,message,state){const userId=message.from.id.toString();if(!message.text)return;try{state.buttons=parseButtons(message.text)}catch(e){await apagarMensagemUsuario(env,message);return atualizarPainel(env,message.chat.id,state.panelMessageId,`⚠️ <b>Formato de botão inválido.</b>\n\n${escapeHtml(e.message)}`,[[{text:"❌ Cancelar",callback_data:"disparo:cancelar"}]])}await apagarMensagemUsuario(env,message);state.step="WAITING_CONFIRMATION";await env.KV_BOT_BANNERS.put(`state_${userId}`,JSON.stringify(state),{expirationTtl:3600});return mostrarConfirmacao(env,message.chat.id,state)}
async function processarGrupo(env,m,state){const id=String(m.text||"").trim();if(!/^-?\d+$/.test(id))return;await apagarMensagemUsuario(env,m);await adicionarGrupo(env,id);await env.KV_BOT_BANNERS.delete(`state_${m.from.id}`);return atualizarPainel(env,m.chat.id,state.panelMessageId,`✅ <b>Grupo adicionado.</b>\n\nID: <code>${id}</code>`,[[{text:"👥 Ver Grupos",callback_data:"menu:grupos"}]])}
function parseButtons(text){return text.split("\n").map(line=>line.split("|").map(i=>i.trim()).filter(Boolean).map(item=>{const s=item.indexOf(" - ");if(s<1)throw new Error(`Linha inválida: ${item}`);const label=item.slice(0,s).trim(),url=item.slice(s+3).trim();if(!/^https?:\/\//i.test(url)&&!/^tg:\/\//i.test(url))throw new Error(`URL inválida no botão ${label}.`);return{text:label,url}}))}
function escapeHtml(v){return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
