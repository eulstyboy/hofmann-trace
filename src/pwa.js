  var installPrompt=null;
  function initPwa(){
    // Only the hosting build has these assets. The standalone file is autonomous.
    if(!document.querySelector('link[rel="manifest"]'))return;
    window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();installPrompt=e;$('installApp').hidden=false;});
    $('installApp').addEventListener('click',async function(){if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('installApp').hidden=true;});
    window.addEventListener('appinstalled',function(){$('installApp').hidden=true;});
    if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
    navigator.serviceWorker.register('./sw.js').then(function(reg){
      function offerUpdate(){if(reg.waiting){$('updateApp').hidden=false;$('updateApp').onclick=async function(){finishControlEdit();closeSizePopup(true);await whenIdle();if(!storageAllowed||!await saveSession()){setStatus('Save your project before updating.');return;}reg.waiting.postMessage('activate');};}}
      offerUpdate();reg.addEventListener('updatefound',function(){var worker=reg.installing;if(worker)worker.addEventListener('statechange',function(){if(worker.state==='installed'&&navigator.serviceWorker.controller)offerUpdate();});});
      var controlled=!!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange',function(){if(controlled)location.reload();controlled=true;});
    }).catch(function(){setStatus('Offline installation unavailable. You can still use the app.');});
  }
