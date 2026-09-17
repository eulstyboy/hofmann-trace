  var camera={x:0,y:0,zoom:1},viewGrid='',viewPointers=new Map(),gesture=null,spacePan=false;
  function applyView(){
    var s=canvasSize(),w=s.W/camera.zoom,h=s.H/camera.zoom;
    camera.x=Math.max(0,Math.min(s.W-w,camera.x));camera.y=Math.max(0,Math.min(s.H-h,camera.y));
    svg.setAttribute('viewBox',[camera.x,camera.y,w,h].join(' '));
    $('zoomReset').textContent=Math.round(camera.zoom*100)+' %';
    if(sizeEdit)placeSizePopup();
  }
  function resetView(){camera.x=0;camera.y=0;camera.zoom=1;applyView();}
  function zoomAt(factor,clientX,clientY){
    var p=svgPoint({clientX:clientX,clientY:clientY}),r=svg.getBoundingClientRect(),s=canvasSize();
    camera.zoom=Math.max(1,Math.min(12,camera.zoom*factor));
    camera.x=p.x-(clientX-r.left)/r.width*s.W/camera.zoom;
    camera.y=p.y-(clientY-r.top)/r.height*s.H/camera.zoom;applyView();
  }
  function centerZoom(factor){var r=svg.getBoundingClientRect();zoomAt(factor,r.left+r.width/2,r.top+r.height/2);}
  $('zoomIn').addEventListener('click',function(){centerZoom(1.4);});
  $('zoomOut').addEventListener('click',function(){centerZoom(1/1.4);});
  $('zoomReset').addEventListener('click',resetView);
  svg.addEventListener('wheel',function(e){e.preventDefault();if(!previewHold)zoomAt(Math.exp(-e.deltaY*.002),e.clientX,e.clientY);},{passive:false});
  document.addEventListener('keydown',function(e){if(!previewHold&&e.code==='Space'&&!/INPUT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)){spacePan=true;e.preventDefault();}});
  document.addEventListener('keyup',function(e){if(e.code==='Space')spacePan=false;});
  window.addEventListener('blur',function(){finishNodeGesture(true);finishPaint(true);spacePan=false;gesture=null;viewPointers.clear();drawing=null;});
  function gestureMetrics(){
    var p=Array.from(viewPointers.values());if(p.length===1)return{x:p[0].x,y:p[0].y,d:1};
    return{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,d:Math.max(1,Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y))};
  }
  svg.addEventListener('pointerdown',function(e){
    if(previewHold){e.preventDefault();e.stopImmediatePropagation();return;}
    viewPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(viewPointers.size>=2||spacePan||e.button===1){
      e.preventDefault();e.stopImmediatePropagation();finishNodeGesture(false);finishPaint(false);drawing=null;poly=null;closeSizePopup(true);
      gesture={last:gestureMetrics()};viewPointers.forEach(function(_,id){try{svg.setPointerCapture(id);}catch(err){}});scheduleRender();
    }
  },true);
  svg.addEventListener('pointermove',function(e){
    if(!viewPointers.has(e.pointerId))return;
    viewPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(!gesture)return;
    e.preventDefault();e.stopImmediatePropagation();var m=gestureMetrics(),last=gesture.last,r=svg.getBoundingClientRect(),s=canvasSize();
    if(viewPointers.size>=2)zoomAt(m.d/last.d,last.x,last.y);
    camera.x-=(m.x-last.x)/r.width*s.W/camera.zoom;camera.y-=(m.y-last.y)/r.height*s.H/camera.zoom;
    gesture.last=m;applyView();
  },true);
  function endViewPointer(e){
    viewPointers.delete(e.pointerId);
    if(gesture){e.stopImmediatePropagation();drawing=null;if(viewPointers.size)gesture.last=gestureMetrics();else gesture=null;}
  }
  svg.addEventListener('pointerup',endViewPointer,true);svg.addEventListener('pointercancel',endViewPointer,true);
