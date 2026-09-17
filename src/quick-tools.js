  var previewHold=false,previewInput=null,sizeCopy=null;
  var appElement=document.querySelector('.app'),previewButton=$('previewBtn');
  function beginInstantPreview(input){
    if(previewHold||nodeGesture||drawing||paintStroke||geometryBusy)return false;
    previewInput=input;previewHold=true;appElement.classList.add('preview-only');previewButton.setAttribute('aria-pressed','true');return true;
  }
  function endInstantPreview(){
    previewHold=false;previewInput=null;appElement.classList.remove('preview-only');previewButton.setAttribute('aria-pressed','false');
  }
  previewButton.addEventListener('pointerdown',function(e){
    if(e.button!==0)return;e.preventDefault();
    if(beginInstantPreview(e.pointerId))previewButton.setPointerCapture(e.pointerId);
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(function(type){previewButton.addEventListener(type,function(e){if(previewInput===e.pointerId)endInstantPreview();});});
  previewButton.addEventListener('contextmenu',function(e){e.preventDefault();});
  document.addEventListener('keydown',function(e){
    if(e.key==='Tab'&&previewHold){endInstantPreview();return;}
    var field=document.activeElement,typing=field&&(field.isContentEditable||/INPUT|TEXTAREA|SELECT/.test(field.tagName));
    var shortcut=e.code==='KeyH'&&!typing&&!e.ctrlKey&&!e.metaKey&&!e.altKey;
    var onButton=field===previewButton&&(e.code==='Space'||e.code==='Enter');
    if((shortcut||onButton)&&!e.repeat){e.preventDefault();beginInstantPreview('key');}
    if(e.key==='Escape'&&previewHold){e.preventDefault();e.stopImmediatePropagation();endInstantPreview();}
  },true);
  document.addEventListener('keyup',function(e){if(previewInput==='key'&&(e.code==='KeyH'||e.code==='Space'||e.code==='Enter')){e.preventDefault();endInstantPreview();}});
  window.addEventListener('blur',endInstantPreview);
  document.addEventListener('visibilitychange',function(){if(document.hidden)endInstantPreview();});

  $('nodePickSize').addEventListener('click',function(){
    finishNodeGesture(false);finishControlEdit();closeSizePopup(true);if(geometryBusy)return;
    cancelAddPlacement();lastNodeTap=null;mergePlan=null;nodeSelection=[];state.selected=null;tangentFocus=null;
    sizeCopy=sizeCopy?null:{pct:null,source:null};
    setStatus(sizeCopy?'Size pipette: tap a source circle, then tap targets. Tap the pipette again or Escape to exit.':toolMsgs.select);render();
  });
  function beginSizeCopyGesture(e,p){
    nodeGesture={kind:'size-copy',pointerId:e.pointerId,k:nodeAt(p,1.12),start:p,last:p,slop:6*canvasSize().W/camera.zoom/svg.getBoundingClientRect().width};
    svg.setPointerCapture(e.pointerId);e.preventDefault();
  }
  function copySizeCap(keys,asked){
    var others=activeKeys().filter(function(k){return keys.indexOf(k)<0;}).map(nodeOf),size=canvasSize(),layout=editedLayout();
    var cap=Math.min.apply(null,[asked].concat(keys.map(sizeLimit)));
    function fits(pct){
      var moved=keys.map(function(k){return nodeGeomFor(k,nodeCenter(k),Math.max(.01,pct*S/200));});
      return moved.every(function(n,i){return(!layout||(n.c.x>=n.r&&n.c.y>=n.r&&n.c.x+n.r<=size.W&&n.c.y+n.r<=size.H))&&
        others.every(function(other){return gapNodes(n,other)>=TOUCH-1e-6;})&&moved.every(function(other,j){return j<=i||gapNodes(n,other)>=TOUCH-1e-6;});});
    }
    if(fits(cap))return cap;
    var lo=0,hi=cap;for(var i=0;i<25;i++){var mid=(lo+hi)/2;if(fits(mid))lo=mid;else hi=mid;}return Math.floor(lo*1000)/1000;
  }
  function useSizeCopy(k){
    if(!sizeCopy||!k||!nodeActive(k)||geometryBusy)return;
    if(sizeCopy.pct===null){sizeCopy.pct=pctOf(k);sizeCopy.source=k;setStatus('Size picked: '+Math.round(sizeCopy.pct*10)/10+' %. Tap circles to apply; tap the pipette again to exit.');return;}
    var keys=mirrorKeys(k),asked=sizeCopy.pct;
    if(keys.every(function(q){return Math.abs(pctOf(q)-asked)<1e-7;}))return;
    var pct=copySizeCap(keys,asked),before=snapshot(),base=JSON.parse(JSON.stringify(state));
    keys.forEach(function(q){base.nodes[q]=Object.assign({},base.nodes[q],{pct:pct,sizeRatio:pct/(state.defaultPct||100)});});
    if(!changedNodeKeys(JSON.parse(before).nodes,base.nodes).length)return;
    var message=pct<asked-.001?'Size limited to '+Math.round(pct*10)/10+' % by neighbouring circles.':'Size copied. Tap another circle to apply again.';
    performNodeEdit(base,{},before,keys,message);
  }
  function sizeCopyOverlay(){
    if(!sizeCopy||!sizeCopy.source||!nodeActive(sizeCopy.source))return '';
    return '<path data-size-source="'+sizeCopy.source+'" d="'+segsToSvg(circleSegs(sizeCopy.source))+'" fill="none" stroke="#268cff" stroke-width="2" stroke-dasharray="3 2"/>';
  }
