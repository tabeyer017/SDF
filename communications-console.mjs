import { communicationsRecipients,communicationRequests,communicationLink,sendCommunication,markChannelRead,unreadCommunications } from './communications-model.mjs';
const el=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const button=(text,fn)=>{const node=el('button','bridge-action',text);node.type='button';node.onclick=fn;return node;};
function field(label,input){const wrap=el('label','bridge-setting');wrap.append(el('span','',label),input);input.setAttribute('aria-label',label);return wrap;}
function date(seconds){return new Date(Date.UTC(2250,0,1)+seconds*1000).toISOString().slice(0,16).replace('T',' ')+' UTC';}

export function mountCommunications({root,getState,getContext,onChange,onNavigate}){
  root.className='communications-console';root.setAttribute('aria-label','Communications console');
  const header=el('header','comms-heading');header.append(el('span','tactical-eyebrow','COMMUNICATIONS / SIGNALS'));
  const unread=el('span','comms-unread');header.append(unread);
  const directory=el('aside','comms-directory');directory.setAttribute('aria-label','Communication channels');
  const filter=el('select','');for(const [id,label] of [['all','All channels'],['unread','Unread messages'],['ships','Tactical ships'],['stations','HQ & stations'],['archive','Channel history']])filter.append(Object.assign(el('option','',label),{value:id}));
  const search=el('input','');search.type='search';search.placeholder='Name or track';
  const channelList=el('div','comms-channel-list');
  directory.append(field('Channel directory',filter),field('Find a channel',search),channelList);
  const conversation=el('section','comms-conversation');conversation.setAttribute('aria-label','Selected communication channel');
  const title=el('h2',''),description=el('p','comms-channel-description'),link=el('p','comms-link');link.setAttribute('role','status');
  const channelHeader=el('header','comms-channel-heading');channelHeader.append(title,description,link);
  const thread=el('ol','comms-messages');thread.setAttribute('aria-label','Conversation history');
  const composer=el('form','comms-composer');
  const request=el('select',''),detail=el('textarea','');detail.rows=2;detail.maxLength=500;detail.placeholder='Optional details, coordinates, or response…';
  const preview=el('p','comms-preview'),send=button('Transmit message',()=>{}),status=el('p','comms-result');status.setAttribute('role','status');
  send.type='submit';
  const actions=el('div','comms-compose-actions');actions.append(send,button('Engineering ↗',()=>onNavigate('engineering')),button('Tactical ↗',()=>onNavigate('tactical')));
  composer.append(field('Request / response',request),field('Message details',detail),preview,actions,status);
  conversation.append(channelHeader,thread,composer);
  const workspace=el('div','comms-workspace');workspace.append(directory,conversation);root.append(header,workspace);
  let threadKey='',directoryKey='',optionsKey='',previousState=null;
  filter.onchange=()=>{getState().filter=filter.value;refresh();onChange();};search.oninput=()=>refresh();
  request.onchange=()=>refresh();
  composer.onsubmit=event=>{
    event.preventDefault();const state=getState(),result=sendCommunication(state,getContext(),state.selectedId,request.value,detail.value);
    status.textContent=result.message;
    if(result.ok){detail.value='';markChannelRead(state,state.selectedId);}
    refresh();onChange();
  };
  function refresh(){
    const state=getState(),context=getContext();
    if(previousState!==state){previousState=state;threadKey='';directoryKey='';optionsKey='';detail.value='';status.textContent='';search.value='';}
    const recipients=communicationsRecipients(state,context);
    let selected=recipients.find(r=>r.id===state.selectedId);if(!selected){state.selectedId='hq';selected=recipients[0];}
    const readChanged=markChannelRead(state,state.selectedId);
    const count=unreadCommunications(state);unread.textContent=count?`${count} unread`:'All messages read';filter.value=state.filter;
    title.textContent=selected.name;description.textContent=selected.description;
    const error=communicationLink(context,selected);link.textContent=error||`${selected.kind==='ship'?'Tactical direct link':'System relay'} · channel open`;link.classList.toggle('is-offline',!!error);
    const choices=communicationRequests(selected),key=choices.map(c=>c.id).join('|');
    if(key!==optionsKey){const value=request.value;request.replaceChildren(...choices.map(c=>Object.assign(el('option','',c.label),{value:c.id})));if(choices.some(c=>c.id===value))request.value=value;optionsKey=key;}
    request.disabled=!!error;detail.disabled=!!error;send.disabled=!!error;
    preview.textContent=`Includes your location (${context.sector.location}) and hull integrity (${Math.round(context.combat.own.systems.hull.hp/context.combat.own.systems.hull.max*100)}%).`;
    const messages=state.messages.filter(m=>m.channelId===selected.id),newThreadKey=`${selected.id}:${messages.map(m=>m.id).join(',')}`;
    if(newThreadKey!==threadKey){
      thread.replaceChildren(...messages.map(message=>{
        const row=el('li',`comms-message is-${message.direction}`),meta=el('p','comms-message-meta',`${message.direction==='sent'?'WAYFARER → '+message.channelName:message.channelName+' → WAYFARER'} · ${date(message.time)} · ${message.location}`);
        row.append(meta,el('h3','',message.subject),el('p','comms-message-body',message.body));return row;
      }));
      if(!messages.length)thread.append(el('li','comms-empty','No messages on this channel. Open a channel or choose a request to begin.'));
      thread.scrollTop=thread.scrollHeight;threadKey=newThreadKey;
    }
    const counts=new Map();for(const m of state.messages)if(m.direction==='received'&&!m.read)counts.set(m.channelId,(counts.get(m.channelId)||0)+1);
    const visible=recipients.filter(r=>(state.filter==='all'||state.filter==='unread'&&counts.has(r.id)||state.filter==='ships'&&r.kind==='ship'&&r.available||state.filter==='stations'&&r.kind!=='ship'||state.filter==='archive'&&!r.available)&&`${r.name} ${r.description}`.toLowerCase().includes(search.value.toLowerCase()));
    const newDirectoryKey=JSON.stringify([state.selectedId,visible,Array.from(counts)]);
    if(newDirectoryKey!==directoryKey){
      const scroll=channelList.scrollTop;channelList.replaceChildren();
      for(const kind of ['hq','ship','station']){
        const group=visible.filter(r=>r.kind===kind);if(!group.length)continue;
        channelList.append(el('h3','',kind==='hq'?'COMMAND':kind==='ship'?'SHIP CHANNELS':'STATIONS & SETTLEMENTS'));
        for(const recipient of group){
          const control=button('',()=>{state.selectedId=recipient.id;status.textContent='';detail.value='';refresh();onChange();});control.className='comms-recipient';control.setAttribute('aria-pressed',String(selected.id===recipient.id));
          control.append(el('span','',recipient.name),el('small','',`${recipient.available?recipient.kind==='ship'?'TACTICAL':'RELAY':'HISTORY'}${counts.has(recipient.id)?` · ${counts.get(recipient.id)} UNREAD`:''}`));channelList.append(control);
        }
      }
      if(!visible.length)channelList.append(el('p','comms-empty','No matching channels.'));
      channelList.scrollTop=scroll;directoryKey=newDirectoryKey;
    }
    if(readChanged)onChange();
  }
  return {refresh};
}
