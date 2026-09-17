  /* ---------- history ---------- */
  function snapshot(){ var o = JSON.parse(projectJson(false)); o.selected = state.selected; return JSON.stringify(o); }
  function syncControls(){
    bevelApplied = state.bevel; if($('sizeValue')) $('sizeValue').textContent = state.defaultPct + ' %';
    $('colsIn').value = state.cols; $('rowsIn').value = state.rows; $('offsetIn').checked = state.offset;
    $('sizeIn').value = state.defaultPct; $('bevelIn').value = Math.round(state.bevel * 100);
    $('guideIn').value = Math.round(state.guideOpacity * 100); $('filletIn').value = Math.round(state.fillet * 100);
    $('shapeColor').value = state.shapeColor; $('shapeHex').value = state.shapeColor;
    $('bgColor').value = state.bgColor; $('bgHex').value = state.bgColor; syncSymUi();
  }
  function restore(s){
    var o = JSON.parse(s);
    ['cols', 'rows', 'offset', 'defaultPct', 'fillet', 'guideOpacity', 'bevel', 'shapeColor', 'bgColor', 'sym', 'nodes', 'contours', 'nextId', 'selected', 'reference'].forEach(function(k){ state[k] = o[k]; });
    nodeSelection=[];invalidateTrace();maskCache = {}; maskCacheN = 0; syncControls();
  }
  function cancelWork(){
    sizeCopy=null;endInstantPreview();
    cancelAddPlacement();lastNodeTap=null;
    if(nodeTransaction){var before=nodeTransaction.before;nodeTransaction=null;restore(before);}mergePlan=null;
    finishNodeGesture(false);nodeSelection=[];finishPaint(true);invalidateTrace();
    cancelGeometry(); if(controlTimer) clearTimeout(controlTimer); controlTimer=null; controlEdit=null; tangentFocus=null;
    poly = null; relax = null; relaxQueue = []; drawing = null; activeObstacles = null;
    if(liveTimer){ clearTimeout(liveTimer); liveTimer = null; }
    if(bevelTimer){ clearTimeout(bevelTimer); bevelTimer = null; }
    bevelBefore = null;
  }
  function pushHistory(before){undoStack.push(before);if(undoStack.length>200)undoStack.shift();redoStack=[];}
  function commit(){finishControlEdit();pushHistory(snapshot());}
  async function undo(){ finishNodeGesture(true);finishPaint(true);finishControlEdit();closeSizePopup(true);if(geometryBusy)await whenIdle();if(!undoStack.length)return;cancelWork();redoStack.push(snapshot());restore(undoStack.pop());render(); }
  async function redo(){ finishNodeGesture(true);finishPaint(true);finishControlEdit();closeSizePopup(true);if(geometryBusy)await whenIdle();if(!redoStack.length)return;cancelWork();undoStack.push(snapshot());restore(redoStack.pop());render(); }
