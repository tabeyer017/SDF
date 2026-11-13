import { communicationsRecipients,communicationRequests,communicationLink,sendCommunication,markChannelRead,channelContactId } from './communications-model.mjs';
import { gameDate } from './navigation.mjs';
import {playerShipName} from './ship-names.mjs';
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

const channelFilters=[['all','All'],['unread','Unread'],['ships','Ships'],['stations','Stations']];
const hailLabels={
  orders:'Request Orders',support:'Request Repair Tender',surrender:'Demand Surrender',
  cease:'Propose Cease-Fire',offer:'Offer Assistance','attack-targets':'Request Fire Support'
};

function quickRequests(recipient,distress){
  if(recipient.id==='shuttles')return ['status','acknowledge'];
  if(recipient.kind==='hq')return ['orders','support','report'];
  if(recipient.kind==='station')return ['support','docking','repairs','resupply'];
  if(recipient.hostile)return ['surrender','cease','status',...(distress?['offer']:[])];
  if(recipient.friendly)return ['attack-targets','battle-assistance','stand-down',distress?'offer':'status'];
  return ['offer','hail','status'];
}

function channelDirectory(state,recipients,context,query){
  const history=new Map();
  for(const message of state.messages){
    const activity=history.get(message.channelId)??{unread:0,last:0};
    activity.last=message.id;
    if(message.direction==='received'&&!message.read)activity.unread++;
    history.set(message.channelId,activity);
  }
  const channels=recipients.map(recipient=>{
    const ship=recipient.available&&context.combat.contacts[recipient.contactId];
    const distress=!!(ship&&!ship.surrendered&&state.alerts.includes(recipient.id)
      &&(ship.fire||ship.breach||Math.round(ship.systems.hull.hp/ship.systems.hull.max*100)<40));
    const track=recipient.kind==='ship'?`TRK-${recipient.id.split(':').at(-1).split('-').at(-1)}`:'';
    return {...recipient,...(history.get(recipient.id)??{unread:0,last:0}),distress,track};
  });
  const pinned=channels.find(channel=>channel.id==='hq');
  const filtered=channels.filter(channel=>channel!==pinned&&(
    state.filter==='all'||state.filter==='archive'
    ||state.filter==='unread'&&channel.unread
    ||state.filter==='ships'&&channel.kind==='ship'
    ||state.filter==='stations'&&channel.kind==='station'
  )&&`${channel.name} ${channel.track} ${channel.description}`.toLowerCase().includes(query));
  const priority=channel=>channel.distress?0:channel.unread?1:channel.available?2:3;
  filtered.sort((a,b)=>priority(a)-priority(b)||b.last-a.last||a.name.localeCompare(b.name));
  return {pinned,filtered,selected:channels.find(channel=>channel.id===state.selectedId)};
}

export function mountCommunications({root,getState,getContext,onChange,onOpenContact=()=>false,onOpenMission,onDeclineMission}){
  root.className='communications-console';root.setAttribute('aria-label','Communications console');
  const directory=el('aside','comms-directory');directory.setAttribute('aria-label','Channels');
  const filters=el('div','comms-filters');filters.setAttribute('role','group');filters.setAttribute('aria-label','Channel filters');
  const filterButtons=channelFilters.map(([id,label])=>{
    const control=button(label,()=>{getState().filter=id;refresh();onChange();});
    filters.append(control);return {id,control};
  });
  const search=el('input','');search.type='search';search.placeholder='Name or track';
  const channelList=el('div','comms-channel-list'),pinnedChannel=el('div','comms-pinned-channel');
  directory.append(el('h2','comms-pane-title','Channels'),filters,field('Find a channel',search),pinnedChannel,channelList);
  const conversation=el('section','comms-conversation');conversation.setAttribute('aria-label','Dispatch & Hail Feed');
  const title=el('h3',''),description=el('p','comms-channel-description'),link=el('p','comms-link');link.setAttribute('role','status');title.tabIndex=-1;
  const channelHeader=el('header','comms-channel-heading');
  const contactFeedback=el('p','comms-result');contactFeedback.setAttribute('role','status');
  function inspect(channelId){
    contactFeedback.textContent=onOpenContact(channelId)?'':'Contact unavailable. If all target priorities are in use, release a lock in Tactical.';
  }
  const inspectSender=button('Open contact in Flight Control ↗',()=>inspect(getState().selectedId));
  inspectSender.classList.add('comms-contact-action');
  channelHeader.append(el('h2','comms-pane-title','Dispatch & Hail Feed'),title,description,link,inspectSender,contactFeedback);
  const thread=el('ol','comms-messages');thread.setAttribute('aria-label','Conversation history');
  const composer=el('form','comms-composer');
  const quickHail=el('section','comms-quick-hail');quickHail.setAttribute('aria-label','Quick Hail');
  const chips=el('div','comms-hail-chips'),more=el('details','comms-more-requests'),otherChips=el('div','comms-hail-chips');
  more.append(el('summary','','More requests'),otherChips);
  quickHail.append(el('h4','','Quick Hail'),chips,more);
  const detail=el('textarea','');detail.rows=2;detail.maxLength=500;detail.placeholder='Write a custom message';
  const send=button('Transmit',()=>{}),status=el('p','comms-result');status.setAttribute('role','status');send.type='submit';
  const custom=el('div','comms-custom-message');custom.append(field('Custom transmission',detail),send);
  composer.append(quickHail,custom,status);
  conversation.append(channelHeader,thread,composer);
  const workspace=el('div','comms-workspace');workspace.append(directory,conversation);root.append(workspace);

  let threadKey='',directoryKey='',requestsKey='',previousState=null,previousChannel=null;
  const reportLinks=new Map();
  search.oninput=()=>refresh();
  function transmit(request,text=''){
    const state=getState(),result=sendCommunication(state,getContext(),state.selectedId,request,text);
    status.textContent=result.message;
    if(result.ok&&request==='message')detail.value='';
    refresh();onChange();
  }
  composer.onsubmit=event=>{event.preventDefault();transmit('message',detail.value);};
  function renderRequests(selected,error){
    const choices=communicationRequests(selected),preferred=quickRequests(selected,selected.distress);
    const key=JSON.stringify([selected.id,preferred,choices,error]);
    if(key!==requestsKey){
      requestsKey=key;
      const makeChip=({id,label})=>{
        const control=button(hailLabels[id]??label,()=>transmit(id));
        control.disabled=!!error;
        control.title=error??'';
        return control;
      };
      chips.replaceChildren(...preferred.map(id=>choices.find(choice=>choice.id===id)).filter(Boolean).map(makeChip));
      const extra=choices.filter(choice=>choice.id!=='message'&&!preferred.includes(choice.id));
      otherChips.replaceChildren(...extra.map(makeChip));
      more.hidden=!extra.length;
    }
    custom.hidden=!choices.some(choice=>choice.id==='message');
    detail.disabled=send.disabled=!!error;
  }
  function channelButton(recipient,selected){
    const control=button('',()=>{getState().selectedId=recipient.id;refresh();onChange();});
    control.className='comms-recipient';control.dataset.channelId=recipient.id;
    control.setAttribute('aria-pressed',String(selected.id===recipient.id));
    const dot=el('span','comms-unread-dot');dot.hidden=!recipient.unread;dot.setAttribute('aria-hidden','true');
    const meta=[recipient.track,recipient.id==='hq'?'Command relay':recipient.available?(recipient.kind==='ship'?'Live ship':recipient.id==='shuttles'?'Shipboard':'System relay'):'History',
      recipient.distress?'Distress':'',recipient.unread?`${recipient.unread} unread`:''].filter(Boolean).join(' · ');
    const name=recipient.id==='hq'?'Sol Command':recipient.name.replace(`${recipient.track} · `,'');
    control.append(dot,el('strong','',name),el('small','',meta));
    return control;
  }
  function refresh(){
    const state=getState(),context=getContext();
    if(previousState!==state){
      previousState=state;previousChannel=null;threadKey='';directoryKey='';requestsKey='';search.value='';
    }
    const recipients=communicationsRecipients(state,context);
    if(!recipients.some(recipient=>recipient.id===state.selectedId))state.selectedId='hq';
    const readChanged=markChannelRead(state,state.selectedId);
    if(previousChannel!==state.selectedId){
      previousChannel=state.selectedId;detail.value='';status.textContent='';contactFeedback.textContent='';more.open=false;
    }
    const {pinned,filtered,selected}=channelDirectory(state,recipients,context,search.value.trim().toLowerCase());
    const filter=state.filter==='archive'?'all':state.filter;
    for(const {id,control} of filterButtons)control.setAttribute('aria-pressed',String(filter===id));
    title.textContent=selected.id==='hq'?'Sol Command':selected.name;description.textContent=selected.description;
    function updateContactButton(control,channelId){
      const id=channelContactId(channelId,state.encounter);
      control.disabled=context.inTransit||!id||!context.contacts.some(contact=>contact.id===id&&!contact.stale);
      control.title=control.disabled?'This contact has no live track in the current encounter.':'';
    }
    inspectSender.hidden=selected.kind!=='ship';updateContactButton(inspectSender,selected.id);
    const error=communicationLink(context,selected);
    link.textContent=error??(selected.kind==='ship'?'Tactical direct link open':selected.id==='shuttles'?'Shipboard link open':'System relay open');
    link.classList.toggle('is-offline',!!error);
    renderRequests(selected,error);
    const ownName=playerShipName(context.combat),messages=state.messages.filter(message=>message.channelId===selected.id);
    const mission=state.mission;
    const newThreadKey=JSON.stringify([ownName,selected.id,messages.map(message=>message.id),mission?.id,mission?.arrived]);
    if(newThreadKey!==threadKey){
      reportLinks.clear();
      thread.replaceChildren(...messages.map(message=>{
        const row=el('li',`comms-message is-${message.direction}`),header=el('header','comms-message-meta');
        const timestamp=el('time','',date(message.time));timestamp.dateTime=gameDate(message.time).toISOString();
        header.append(el('strong','',message.direction==='sent'?ownName:message.channelName),timestamp,el('span','',message.location));
        row.append(header,el('h4','',message.subject),el('p','comms-message-body',message.body));
        if(message.contactChannelId){
          const control=button('Open contact in Flight Control ↗',()=>inspect(message.contactChannelId));
          control.classList.add('comms-contact-action');reportLinks.set(control,message.contactChannelId);row.append(control);
        }
        if(message.id===mission?.id&&Number.isFinite(mission.destination?.x)&&Number.isFinite(mission.destination?.y)){
          const missionActions=el('div','comms-mission-actions');
          missionActions.append(button('Show on System Map',onOpenMission));
          if(!mission.arrived)missionActions.append(button('Decline assignment',onDeclineMission));
          row.append(missionActions);
        }
        return row;
      }));
      if(!messages.length)thread.append(el('li','comms-empty','No messages yet. Choose a quick hail to open the conversation.'));
      thread.scrollTop=thread.scrollHeight;threadKey=newThreadKey;
    }
    for(const [control,channelId] of reportLinks)updateContactButton(control,channelId);
    const newDirectoryKey=JSON.stringify([selected.id,[pinned,...filtered].map(({id,name,available,unread,distress})=>[id,name,available,unread,distress])]);
    if(newDirectoryKey!==directoryKey){
      const scroll=channelList.scrollTop,focused=document.activeElement?.dataset.channelId;
      const pinnedButton=channelButton(pinned,selected),buttons=filtered.map(recipient=>channelButton(recipient,selected));
      pinnedChannel.replaceChildren(pinnedButton);
      channelList.replaceChildren(...buttons);
      if(!buttons.length)channelList.append(el('p','comms-empty','No matching channels.'));
      channelList.scrollTop=scroll;
      if(focused)([pinnedButton,...buttons].find(control=>control.dataset.channelId===focused)??title).focus({preventScroll:true});
      directoryKey=newDirectoryKey;
    }
    if(readChanged)onChange();
  }
  return {refresh,focus:()=>title.focus({preventScroll:true})};
}
