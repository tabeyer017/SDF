import { communicationsRecipients,communicationRequests,communicationLink,sendCommunication,markChannelRead,channelContactId } from './communications-model.mjs';
import { gameDate } from './navigation.mjs';
import {playerShipName} from './ship-names.mjs';
import {shuttleStatus} from './boarding-model.mjs';
const el=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const button=(text,fn)=>{const node=el('button','bridge-action',text);node.type='button';node.onclick=fn;return node;};
function field(label,input){const wrap=el('label','bridge-setting');wrap.append(el('span','',label),input);input.setAttribute('aria-label',label);return wrap;}
function date(seconds){return gameDate(seconds).toISOString().slice(0,16).replace('T',' ')+' UTC';}

export function mountCommunicationAlerts({getState,onOpen}){
  const $=id=>document.getElementById(id),icon=$('messages-button'),countLabel=$('messages-count'),popup=$('communication-alert');
  let previousState=getState(),nextId=previousState.nextId,pending=[];
  function dismiss(){pending=[];popup.hidden=true;}
  function open(channelId){dismiss();onOpen(channelId);}
  $('dismiss-communication-alert').onclick=()=>{dismiss();icon.focus();};
  $('open-communication-alert').onclick=()=>open(pending.at(-1)?.channelId);
  popup.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();dismiss();icon.focus();}});
  icon.onclick=()=>{
    const state=getState(),unread=state.messages.filter(message=>message.direction==='received'&&!message.read);
    open((unread.find(message=>message.id===state.mission?.id)??unread[0])?.channelId);
  };
  function refresh(){
    const state=getState();
    // Loading a patrol updates its badge without replaying old notifications.
    if(state!==previousState){previousState=state;nextId=state.nextId;dismiss();}
    const unread=state.messages.filter(message=>message.direction==='received'&&!message.read),count=unread.length;
    const label=count?`Open Comms · ${count} unread ${count===1?'message':'messages'}`:'Open Comms · all messages read';
    icon.classList.toggle('has-unread',count>0);icon.setAttribute('aria-label',label);icon.title=label;
    countLabel.hidden=count===0;countLabel.textContent=String(count);
    pending=pending.filter(message=>unread.some(item=>item.id===message.id));
    pending.push(...unread.filter(message=>message.id>=nextId));nextId=state.nextId;
    popup.hidden=pending.length===0;
    if(pending.length){
      const latest=pending.at(-1),title=pending.length===1?'New message received':`${pending.length} new messages received`;
      const detail=`${latest.channelName} · ${latest.subject}`;
      if($('communication-alert-title').textContent!==title)$('communication-alert-title').textContent=title;
      if($('communication-alert-detail').textContent!==detail)$('communication-alert-detail').textContent=detail;
    }
  }
  refresh();return {refresh};
}

export function mountCommunications({root,getState,getContext,onChange,onRecall=()=>({ok:false,message:'Shuttle recall unavailable.'}),onOpenContact=()=>false,onOpenMission,onDeclineMission}){
  root.className='communications-console';root.setAttribute('aria-label','Communications console');
  const shuttleControl=el('section','comms-shuttle-control');shuttleControl.setAttribute('aria-label','Shuttle recall control');
  const shuttleLabel=el('h3','','SHUTTLE CONTROL'),shuttleRows=el('div','comms-shuttle-list'),recallStatus=el('p','comms-result');
  recallStatus.setAttribute('role','status');shuttleControl.append(shuttleLabel,shuttleRows,recallStatus);
  const recallRows=new Map();
  const directory=el('aside','comms-directory');directory.setAttribute('aria-label','Communication channels');
  const filter=el('select','');for(const [id,label] of [['all','All channels'],['unread','Unread messages'],['ships','Tactical ships'],['stations','HQ & stations'],['archive','Channel history']])filter.append(Object.assign(el('option','',label),{value:id}));
  const search=el('input','');search.type='search';search.placeholder='Name or track';
  const channelList=el('div','comms-channel-list');
  directory.append(field('Channel directory',filter),field('Find a channel',search),channelList);
  const conversation=el('section','comms-conversation');conversation.setAttribute('aria-label','Selected communication channel');
  const title=el('h2',''),description=el('p','comms-channel-description'),link=el('p','comms-link');link.setAttribute('role','status');title.tabIndex=-1;
  const channelHeader=el('header','comms-channel-heading');
  const contactFeedback=el('p','comms-result');contactFeedback.setAttribute('role','status');
  function inspect(channelId){
    contactFeedback.textContent=onOpenContact(channelId)?'':'Contact unavailable. If all target priorities are in use, release a lock in Tactical.';
  }
  const inspectSender=button('Open contact in Flight Control ↗',()=>inspect(getState().selectedId));
  inspectSender.classList.add('comms-contact-action');
  channelHeader.append(title,description,link,inspectSender,contactFeedback);
  const thread=el('ol','comms-messages');thread.setAttribute('aria-label','Conversation history');
  const composer=el('form','comms-composer');
  const request=el('select',''),detail=el('textarea','');detail.rows=2;detail.maxLength=500;detail.placeholder='Optional details, coordinates, or response…';
  const preview=el('p','comms-preview'),send=button('Transmit message',()=>{}),status=el('p','comms-result');status.setAttribute('role','status');
  send.type='submit';
  const actions=el('div','comms-compose-actions');actions.append(send);
  composer.append(field('Request / response',request),field('Message details',detail),preview,actions,status);
  conversation.append(channelHeader,thread,composer);
  const workspace=el('div','comms-workspace');workspace.append(directory,conversation);root.append(shuttleControl,workspace);
  let threadKey='',directoryKey='',optionsKey='',previousState=null;
  const reportLinks=new Map();
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
    const shuttles=context.combat.boarding?.shuttles??[];
    const deployed=shuttles.filter(shuttle=>shuttle.status!=='ready');
    shuttleControl.hidden=!shuttles.length;
    shuttleLabel.textContent=deployed.length?'Shuttle control':'All shuttles aboard';
    shuttleRows.hidden=!deployed.length;
    if(!deployed.length)recallStatus.textContent='';
    const recallBlock=communicationLink(context,{available:true});
    for(const shuttle of shuttles){
      if(!recallRows.has(shuttle.number)){
        const row=el('div','comms-shuttle-row'),label=el('span',''),recall=button(`Recall ${shuttle.number}`,()=>{const result=onRecall(shuttle.number);recallStatus.textContent=result.ok?'':result.message;refresh();onChange();});
        recall.setAttribute('aria-label',`Recall shuttle ${shuttle.number}`);row.append(label,recall);shuttleRows.append(row);recallRows.set(shuttle.number,{row,label,recall});
      }
      const {row,label,recall}=recallRows.get(shuttle.number);
      row.hidden=shuttle.status==='ready';
      label.textContent=`${shuttle.number} · ${shuttleStatus(shuttle)}`;
      recall.disabled=!!recallBlock||context.inTransit||!['outbound','boarding'].includes(shuttle.status);
      recall.title=recallBlock||(shuttle.status==='returning'?'Shuttle is already returning':'Recall this shuttle and all 10 marines to our ship');
    }
    if(previousState!==state){previousState=state;threadKey='';directoryKey='';optionsKey='';detail.value='';status.textContent='';search.value='';recallStatus.textContent='';contactFeedback.textContent='';}
    const recipients=communicationsRecipients(state,context);
    let selected=recipients.find(r=>r.id===state.selectedId);if(!selected){state.selectedId='hq';selected=recipients[0];}
    const readChanged=markChannelRead(state,state.selectedId);
    filter.value=state.filter;
    title.textContent=selected.name;description.textContent=selected.description;
    function updateContactButton(control,channelId){
      const id=channelContactId(channelId,state.encounter);
      control.disabled=context.inTransit||!id||!context.contacts.some(contact=>contact.id===id&&!contact.stale);
      control.title=control.disabled?'This contact has no live track in the current encounter.':'';
    }
    inspectSender.hidden=selected.kind!=='ship';updateContactButton(inspectSender,selected.id);
    const error=communicationLink(context,selected);link.textContent=error||`${selected.kind==='ship'?'Tactical direct link':'System relay'} · channel open`;link.classList.toggle('is-offline',!!error);
    const choices=communicationRequests(selected),key=choices.map(c=>c.id).join('|');
    if(key!==optionsKey){const value=request.value;request.replaceChildren(...choices.map(c=>Object.assign(el('option','',c.label),{value:c.id})));if(choices.some(c=>c.id===value))request.value=value;optionsKey=key;}
    request.disabled=!!error;detail.disabled=!!error;send.disabled=!!error;
    preview.textContent=`Includes your location (${context.sector.location}) and hull integrity (${Math.round(context.combat.own.systems.hull.hp/context.combat.own.systems.hull.max*100)}%).`;
    const ownName=playerShipName(context.combat).toUpperCase();
    const messages=state.messages.filter(m=>m.channelId===selected.id);
    const newThreadKey=`${ownName}:${selected.id}:${messages.map(m=>m.id).join(',')}:${state.mission?.id}:${state.mission?.arrived}`;
    if(newThreadKey!==threadKey){
      reportLinks.clear();
      thread.replaceChildren(...messages.map(message=>{
        const row=el('li',`comms-message is-${message.direction}`),meta=el('p','comms-message-meta',`${message.direction==='sent'?ownName+' → '+message.channelName:message.channelName+' → '+ownName} · ${date(message.time)} · ${message.location}`);
        row.append(meta,el('h3','',message.subject),el('p','comms-message-body',message.body));
        if(message.contactChannelId){
          const control=button('Open contact in Flight Control ↗',()=>inspect(message.contactChannelId));
          control.classList.add('comms-contact-action');reportLinks.set(control,message.contactChannelId);row.append(control);
        }
        if(message.id===state.mission?.id){
          const missionActions=el('div','comms-mission-actions');
          missionActions.append(button('Show on System Map ↗',onOpenMission));
          if(!state.mission.arrived)missionActions.append(button('Decline assignment',onDeclineMission));
          row.append(missionActions);
        }
        return row;
      }));
      if(!messages.length)thread.append(el('li','comms-empty','No messages on this channel. Open a channel or choose a request to begin.'));
      thread.scrollTop=thread.scrollHeight;threadKey=newThreadKey;
    }
    for(const [control,channelId] of reportLinks)updateContactButton(control,channelId);
    const counts=new Map();for(const m of state.messages)if(m.direction==='received'&&!m.read)counts.set(m.channelId,(counts.get(m.channelId)||0)+1);
    const visible=recipients.filter(r=>(state.filter==='all'||state.filter==='unread'&&counts.has(r.id)||state.filter==='ships'&&r.kind==='ship'&&r.available||state.filter==='stations'&&r.kind!=='ship'||state.filter==='archive'&&!r.available)&&`${r.name} ${r.description}`.toLowerCase().includes(search.value.toLowerCase()));
    const newDirectoryKey=JSON.stringify([state.selectedId,visible,Array.from(counts)]);
    if(newDirectoryKey!==directoryKey){
      const scroll=channelList.scrollTop;channelList.replaceChildren();
      for(const kind of ['hq','ship','station']){
        const group=visible.filter(r=>r.kind===kind);if(!group.length)continue;
        channelList.append(el('h3','',kind==='hq'?'COMMAND':kind==='ship'?'SHIP CHANNELS':'STATIONS & SETTLEMENTS'));
        for(const recipient of group){
          const control=button('',()=>{state.selectedId=recipient.id;status.textContent='';contactFeedback.textContent='';detail.value='';refresh();onChange();});control.className='comms-recipient';control.setAttribute('aria-pressed',String(selected.id===recipient.id));
          control.append(el('span','',recipient.name),el('small','',`${recipient.available?recipient.kind==='ship'?'TACTICAL':'RELAY':'HISTORY'}${counts.has(recipient.id)?` · ${counts.get(recipient.id)} UNREAD`:''}`));channelList.append(control);
        }
      }
      if(!visible.length)channelList.append(el('p','comms-empty','No matching channels.'));
      channelList.scrollTop=scroll;directoryKey=newDirectoryKey;
    }
    if(readChanged)onChange();
  }
  return {refresh,focus:()=>title.focus({preventScroll:true})};
}
