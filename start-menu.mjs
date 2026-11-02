export function mountStartMenu({hasPatrol,summary,onPause,onEnter,onNewMission}) {
  const $=id=>document.getElementById(id),screen=$('start-screen');
  const gameRegions=[document.querySelector('body > .topbar'),document.querySelector('body > main')];
  let open=true;
  function update(){
    $('continue-mission').hidden=!hasPatrol();
    $('continue-summary').textContent=summary();
    $('new-mission-warning').hidden=!hasPatrol();
    $('backup-before-mission').hidden=!hasPatrol();
  }
  function show(){
    onPause();open=true;update();screen.hidden=false;document.body.dataset.menu='open';
    for(const region of gameRegions){region.inert=true;region.setAttribute('aria-hidden','true');}
    (hasPatrol()?$('continue-mission'):$('new-mission')).focus({preventScroll:true});
  }
  function enter(){
    onEnter();open=false;screen.hidden=true;document.body.dataset.menu='closed';
    for(const region of gameRegions){region.inert=false;region.removeAttribute('aria-hidden');}
    $('menu-button').focus({preventScroll:true});
  }
  function newMission(){update();$('mission-backup-status').textContent='';$('new-mission-dialog').showModal();}
  $('menu-button').onclick=show;
  document.querySelector('.brand').onclick=event=>{event.preventDefault();show();};
  $('continue-mission').onclick=enter;
  $('new-mission').onclick=newMission;
  $('launch-mission').onclick=()=>{onNewMission();$('new-mission-dialog').close();enter();};
  $('backup-before-mission').onclick=()=>{$('download-save').click();$('mission-backup-status').textContent=$('save-status').textContent;};
  $('new-campaign').onclick=()=>$('campaign-dialog').showModal();
  $('campaign-to-mission').onclick=()=>{$('campaign-dialog').close();newMission();};
  $('menu-load-save').onclick=()=>$('saves-button').click();
  $('menu-history').onclick=()=>$('history-dialog').showModal();
  $('menu-how-to-play').onclick=()=>$('how-to-play-dialog').showModal();
  document.querySelectorAll('[data-close-menu-dialog]').forEach(button=>button.onclick=()=>button.closest('dialog').close());
  update();(hasPatrol()?$('continue-mission'):$('new-mission')).focus({preventScroll:true});
  return {open:show,enter,isOpen:()=>open};
}
