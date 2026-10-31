import { MAX_SAVE_BYTES, parseSave } from './save-game.mjs';

export function mountSaves({capture,restore}){
  const $=id=>document.getElementById(id),dialog=$('save-dialog'),status=$('save-status'),file=$('save-file'),load=$('load-save');
  let pending=null,readId=0;
  $('saves-button').onclick=()=>{status.textContent='Browser autosave keeps your current progress. Download a JSON file for a portable backup.';dialog.showModal();};
  $('close-saves').onclick=()=>dialog.close();
  $('download-save').onclick=()=>{
    try{
      const game=capture(),json=JSON.stringify(game,null,2)+'\n';
      const url=URL.createObjectURL(new Blob([json],{type:'application/json'})),link=document.createElement('a');
      link.href=url;link.download=`sdf-save-${game.savedAt.replace(/[:.]/g,'-')}.json`;
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      status.textContent='JSON save download requested. Keep the file to restore this patrol in another browser or on another computer.';
    }catch(error){status.textContent=`Could not create save: ${error.message}`;}
  };
  file.onchange=async()=>{
    const currentRead=++readId;pending=null;load.disabled=true;$('save-preview').textContent='';
    const selected=file.files[0];if(!selected)return;
    try{
      if(selected.size>MAX_SAVE_BYTES)throw new Error('Save files must be 1 MB or smaller.');
      const game=parseSave(await selected.text());if(currentRead!==readId)return;
      pending=game;
      $('save-preview').textContent=`${game.navigation.location} · ${game.navigation.route.length} strategic waypoints · ${game.bridge.sector.route.length} local waypoints · saved ${new Date(game.savedAt).toLocaleString()}`;
      status.textContent='Save checked. Loading replaces the current patrol and resumes it paused.';load.disabled=false;
    }catch(error){if(currentRead===readId)status.textContent=`Cannot load this file: ${error.message}`;}
  };
  load.onclick=()=>{
    if(!pending)return;
    try{
      restore(pending);pending=null;file.value='';load.disabled=true;$('save-preview').textContent='';dialog.close();
    }catch(error){status.textContent=`Could not load save: ${error.message}`;}
  };
}
