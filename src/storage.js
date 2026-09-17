  var sessionDb=null,saveTimer=null,saveSignature=null,recoveryPending=null,storageStarted=false,storageAllowed=false;
  var storageResolve,storageReady=new Promise(function(resolve){storageResolve=resolve;});
  var recoveryKey='hofmann-trace-recovery-v1';
  function storageMessage(s){$('saveState').textContent=s;}
  function sessionRecord(){return {id:'latest',updated:Date.now(),project:projectJson()};}
  function queueAutosave(){
    if(!storageAllowed||geometryBusy||drawing||paintStroke||nodeGesture||sizeEdit||controlEdit)return;
    if(saveTimer)clearTimeout(saveTimer);saveTimer=setTimeout(saveSession,500);
  }
  function saveSession(){
    if(saveTimer)clearTimeout(saveTimer);saveTimer=null;
    if(!storageAllowed||geometryBusy||drawing||paintStroke||nodeGesture||sizeEdit||controlEdit)return Promise.resolve(false);
    var record=sessionRecord();if(record.project===saveSignature)return Promise.resolve(true);
    return new Promise(function(resolve){
      if(!sessionDb){storageMessage('Autosave unavailable — use Save project');resolve(false);return;}
      try{
        var tx=sessionDb.transaction('sessions','readwrite');tx.objectStore('sessions').put(record);
        tx.oncomplete=function(){saveSignature=record.project;try{localStorage.removeItem(recoveryKey);}catch(e){}storageMessage('Saved on this device');resolve(true);};
        tx.onerror=tx.onabort=function(){storageMessage('Autosave failed — use Save project');resolve(false);};
      }catch(e){storageMessage('Autosave unavailable — use Save project');resolve(false);}
    });
  }
  function offerRecovery(record){
    try{if(record&&record.project){validateProject(JSON.parse(record.project));recoveryPending=record;$('recovery').hidden=false;storageMessage('Previous session available');}}
    catch(e){storageMessage('Previous session could not be read');}
    storageAllowed=!recoveryPending;storageResolve();
  }
  function startStorage(){
    if(storageStarted)return;storageStarted=true;
    var emergency=null;try{emergency=JSON.parse(localStorage.getItem(recoveryKey));}catch(e){}
    try{
      var request=indexedDB.open('hofmann-trace',1);
      request.onupgradeneeded=function(){request.result.createObjectStore('sessions',{keyPath:'id'});};
      request.onsuccess=function(){
        sessionDb=request.result;sessionDb.onversionchange=function(){sessionDb.close();sessionDb=null;};
        var get=sessionDb.transaction('sessions').objectStore('sessions').get('latest');
        get.onsuccess=function(){var record=get.result;if(emergency&&(!record||emergency.updated>record.updated))record=emergency;offerRecovery(record);};
        get.onerror=function(){offerRecovery(emergency);};
      };
      request.onerror=request.onblocked=function(){offerRecovery(emergency);storageMessage('Autosave unavailable — use Save project');};
    }catch(e){offerRecovery(emergency);storageMessage('Autosave unavailable — use Save project');}
  }
  $('restoreSession').addEventListener('click',async function(){
    if(!recoveryPending)return;var data=recoveryPending.project;
    if(loadProject(data)){recoveryPending=null;$('recovery').hidden=true;storageAllowed=true;await whenIdle();await saveSession();}
  });
  $('discardSession').addEventListener('click',function(){recoveryPending=null;$('recovery').hidden=true;storageAllowed=true;queueAutosave();});
  function emergencySave(){
    if(!storageAllowed||geometryBusy||nodeGesture)return;
    try{var record=sessionRecord();if(record.project!==saveSignature)localStorage.setItem(recoveryKey,JSON.stringify(record));}catch(e){}
    if(!sizeEdit&&!controlEdit)saveSession();
  }
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')emergencySave();});
  window.addEventListener('pagehide',emergencySave);
