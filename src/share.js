  /* ---------- share ---------- */
  // Prepare ahead of the user's tap: native sharing needs transient activation.
  // If rendering is still in progress, a visible dialog supplies a fresh Share tap.
  var shareText = 'A shape drawn with Hofmann Trace, a tool inspired by Armin Hofmann’s circle-grid variations.';
  var shareCache = null, shareTimer = null, shareKey = '', sharePending = '', shareBusy = false;
  function shareMessage(message){ $('shareStatus').textContent = message; setStatus(message); }
  function openShareDialog(){ if(!$('shareDlg').open) $('shareDlg').showModal(); }
  function canShareImage(file){
    try{ return !!(window.isSecureContext && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); }
    catch(err){ return false; }
  }
  function queueSharePreview(){
    var next = projectJson();
    if(next === shareKey) return;
    shareKey = next;
    if(shareTimer) clearTimeout(shareTimer);
    if(shareCache) URL.revokeObjectURL(shareCache.url);
    shareCache = null;
    $('sharePreview').hidden = true; $('sharePreview').removeAttribute('src');
    $('shareReady').disabled = true; $('shareDownload').disabled = true;
    if(hasArtwork()) shareTimer = setTimeout(function(){ shareTimer = null; prepareShareImage(shareKey); }, 350);
  }
  function prepareShareImage(key){
    if(sharePending === key) return;
    sharePending = key;
    rasterize(2160, 'image/jpeg', function(blob){
      if(sharePending === key) sharePending = '';
      if(key !== shareKey) return;
      if(!blob){ if($('shareDlg').open) shareMessage('Could not prepare the image. Close this window and try again.'); return; }
      var file = new File([blob], 'hofmann-trace.jpg', { type: 'image/jpeg' });
      shareCache = { key: key, file: file, url: URL.createObjectURL(blob) };
      $('sharePreview').src = shareCache.url; $('sharePreview').hidden = false;
      $('shareDownload').disabled = false;
      $('shareReady').disabled = !canShareImage(file) || shareBusy;
      $('shareStatus').textContent = canShareImage(file) ? 'Your image is ready.' : 'Sharing is unavailable in this view. Download the JPEG to share it from your gallery.';
    });
  }
  function sharePrepared(){
    if(shareBusy) return;
    finishPaint(true);finishControlEdit();closeSizePopup(true);
    if(geometryBusy){
      openShareDialog();shareMessage('Finishing your drawing…');$('shareReady').disabled=true;$('shareDownload').disabled=true;
      whenIdle().then(function(){queueSharePreview();if(hasArtwork())prepareShareImage(shareKey);else shareMessage('Nothing to share — draw a shape first.');});return;
    }
    queueSharePreview();
    if(!shareCache || shareCache.key !== shareKey){
      openShareDialog(); shareMessage('Preparing the JPEG…'); prepareShareImage(shareKey); return;
    }
    if(!canShareImage(shareCache.file)){
      openShareDialog(); shareMessage('Sharing is unavailable in this view. Download the JPEG to share it from your gallery.'); return;
    }
    shareBusy = true; $('shareBtn').disabled = true; $('shareReady').disabled = true;
    function failed(err){
      if(err && err.name === 'AbortError'){ shareMessage('Sharing cancelled.'); return; }
      openShareDialog(); shareMessage('This browser could not share the image. Use Download JPEG, then share it from your gallery.');
    }
    function done(){ shareBusy = false; $('shareBtn').disabled = false; $('shareReady').disabled = !shareCache || !canShareImage(shareCache.file); }
    try{
      navigator.share({ title: 'Hofmann Trace', text: shareText, files: [shareCache.file] }).then(function(){
        if($('shareDlg').open) $('shareDlg').close(); setStatus('Image shared.');
      }, failed).finally(done);
    }catch(err){ failed(err); done(); }
  }
  $('shareBtn').addEventListener('click', function(){
    $('exportMenu').classList.remove('open');
    if(!hasArtwork()&&!geometryBusy){ setStatus('nothing to share — draw a shape first.'); return; }
    sharePrepared();
  });
  $('shareReady').addEventListener('click', sharePrepared);
  $('shareDownload').addEventListener('click', function(){ if(shareCache) saveFile('hofmann-trace.jpg', shareCache.file); });
  $('shareClose').addEventListener('click', function(){ $('shareDlg').close(); });
  $('shareDlg').addEventListener('click', function(e){ if(e.target === this) this.close(); });
  window.addEventListener('pagehide', function(){
    if(shareTimer) clearTimeout(shareTimer);
  });
