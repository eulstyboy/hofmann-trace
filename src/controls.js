  /* ---------- tools & pointer ---------- */
  var tangentFocus=null;
  $('tangentAction').addEventListener('click',function(){if(tangentFocus&&!geometryBusy)clickTangent({getAttribute:function(k){return tangentFocus[k];}});});
  var toolMsgs = { select: 'select: click a shape, then a tangent for metaball. Drag a circle to move it; drag between circles to select several. Shift-click / touch and hold adds to selection; double-click / double-tap for size.', lassoAdd: 'lasso + : circle the dots you want, the loop tightens when you release.', lassoSub: 'lasso − : circle the dots to remove — several circles are linked like with lasso +.', polyAdd: 'polygon + : one click per vertex, click the first point to close.', polySub: 'polygon − : one click per vertex around the circles to remove.', size: 'size : tap a circle.', fill: 'draw : drag to paint cells. Start on a filled cell to erase.' };
  function setTool(t){
    sizeCopy=null;
    finishNodeGesture(true);cancelAddPlacement();lastNodeTap=null;mergePlan=null;if(t!=='select')nodeSelection=[];
    finishPaint(true);
    if(poly && t !== state.tool) poly = null;
    closeSizePopup(true);
    state.tool = t;
    document.querySelectorAll('[data-tool]').forEach(function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-tool') === t ? 'true' : 'false'); });
    svg.style.cursor = (t === 'size' || t === 'fill') ? 'pointer' : 'crosshair';
    setStatus(toolMsgs[t] || '');
    render();
  }
  document.querySelectorAll('[data-tool]').forEach(function(b){ b.addEventListener('click', function(){ setTool(b.getAttribute('data-tool')); }); });

  svg.addEventListener('pointerdown', function(e){
    if(e.button !== undefined && e.button !== 0) return;
    if(e.isPrimary === false) return;
    touchEditing = e.pointerType === 'touch' || window.matchMedia('(hover: none), (pointer: coarse)').matches;
    svg.classList.toggle('touch-edit', touchEditing);
    if(relax || geometryBusy) return;
    var pt = svgPoint(e);
    if(state.tool==='select'){beginNodeGesture(e,pt);return;}
    if(state.tool==='fill'){closeSizePopup(true);beginPaint(e,pt);return;}
    if(state.tool === 'size'){
      var k = nodeAt(pt, 1.25);
      if(!k){ var th0 = e.target && e.target.closest ? e.target.closest('.tan-hit') : null; if(th0){ if(sizeEdit) closeSizePopup(true); clickTangent(th0); return; } if(sizeEdit) closeSizePopup(true); return; }
      openSizePopup(k);
      return;
    }
    if(sizeEdit && !nodeAt(pt, 1)) closeSizePopup(true);
    if(state.tool === 'polyAdd' || state.tool === 'polySub'){
      // before the first vertex, a tap on a circle (or a tangent) behaves like with the lasso
      if(!poly){
        var thp = e.target && e.target.closest ? e.target.closest('.tan-hit') : null;
        if(thp){ if(sizeEdit) closeSizePopup(true); clickTangent(thp); return; }
        var kp = nodeAt(pt, 1);
        if(kp){ if(sizeEdit) closeSizePopup(true); state.selected = null; openSizePopup(kp); return; }
      }
      drawing = { points: [pt], target: e.target, polyClick: true };
      return;
    }
    drawing = { points: [pt], target: e.target, sub: state.tool === 'lassoSub' };
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
    scheduleRender();
  });
  svg.addEventListener('pointermove', function(e){
    if(addPlacement&&!nodeGesture){updateAddPreview(svgPoint(e));return;}
    if(nodeGesture){if(e.pointerId===nodeGesture.pointerId)moveNodeGesture(svgPoint(e));return;}
    if(paintStroke){if(e.pointerId===paintStroke.pointerId)paintTo(svgPoint(e));return;}
    var pt = svgPoint(e);
    lastMouse = pt;
    if(drawing && !drawing.polyClick){ drawing.points.push(pt); scheduleRender(); }
    else if(poly) scheduleRender();
  });
  function endStroke(e){
    if(nodeGesture){if(e.pointerId===nodeGesture.pointerId){moveNodeGesture(svgPoint(e));finishNodeGesture(true,true);}return;}
    if(paintStroke){if(e.pointerId===paintStroke.pointerId){paintTo(svgPoint(e));finishPaint(true);}return;}
    if(!drawing) return;
    var pts = drawing.points, target = drawing.target, sub = drawing.sub, isPoly = drawing.polyClick;
    drawing = null;
    if(isPoly){ polyAddVertex(svgPoint(e)); return; }
    var len = 0; for(var i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
    if(len < S * 0.5 || pts.length < 6){
      var th = target && target.closest ? target.closest('.tan-hit') : null;
      if(th){ clickTangent(th); return; }
      var kn = nodeAt(pts[0], 1);
      if(kn){ state.selected = null; openSizePopup(kn); return; }
      var sh = target && target.closest ? target.closest('[data-contour]') : null;
      selectShape(sh ? parseInt(sh.getAttribute('data-contour'), 10) : null);
      render(); return;
    }
    state.selected = null;
    startRelax(smoothClosed(pts, 4, 2), sub);
    render();
  }
  svg.addEventListener('pointerup', endStroke);
  svg.addEventListener('pointercancel', function(){ finishNodeGesture(false);finishPaint(false);drawing = null; render(); });
  svg.addEventListener('dblclick', function(){ if(poly && poly.pts.length >= 3) closePoly(); });

  /* polygonal lasso */
  function polyAddVertex(pt){
    if(!poly){ poly = { pts: [pt] }; state.selected = null; render(); return; }
    var first = poly.pts[0];
    if(poly.pts.length >= 3 && Math.hypot(first.x - pt.x, first.y - pt.y) < S * 0.25){ closePoly(); return; }
    var last = poly.pts[poly.pts.length - 1];
    if(Math.hypot(last.x - pt.x, last.y - pt.y) < 1) return;
    poly.pts.push(pt);
    render();
  }
  function closePoly(){
    if(!poly || poly.pts.length < 3) return;
    var pts = poly.pts.slice(), sub = state.tool === 'polySub';
    poly = null;
    startRelax(elResample(pts, 4), sub);
    render();
  }
  function cancelPoly(){ poly = null; render(); }
  $('polyClose').addEventListener('click', closePoly);
  $('polyCancel').addEventListener('click', cancelPoly);

  /* tangents: straight <-> metaball neck */
  function clickTangent(el){
    var id = parseInt(el.getAttribute('data-contour'), 10), c = state.contours.filter(function(x){ return x.id === id; })[0];
    if(!c || geometryBusy) return;
    var cutIndex = Number(el.getAttribute('data-cut'));
    if(cutIndex >= 0){ c = (c.cuts || [])[cutIndex]; if(!c) return; }
    var a = el.getAttribute('data-a'), b2 = el.getAttribute('data-b');
    var hasNeck=(c.necks||[]).indexOf(pairKey(a,b2))>=0;
    var segments=contourSegments(c);
    var available=segments&&(segments.hits||[]).some(function(h){return pairKey(h.a,h.b)===pairKey(a,b2);});
    if(!hasNeck&&!available){setStatus('No neck: bring these circles closer, or increase their corner rounding.');return;}
    commit();
    var on = toggleNeck(c, a, b2);
    tangentFocus={"data-contour":String(id),"data-cut":String(cutIndex),"data-a":a,"data-b":b2};
    if(symOn()){
      var ma = mirrorKeys(a), mb = mirrorKeys(b2);
      for(var mi = 1; mi < ma.length; mi++){
        var a2 = ma[mi], b3 = mb[mi]; if(!b3 || pairKey(a2, b3) === pairKey(a, b2)) continue;
        state.contours.reduce(function(parts, cc){ return parts.concat([cc], cc.cuts || []); }, []).forEach(function(cc){
          var ch = chainOf(cc);
          for(var ci = 0; ci < ch.length; ci++){ var nx = ch[(ci + 1) % ch.length]; if((ch[ci].k === a2 && nx.k === b3) || (ch[ci].k === b3 && nx.k === a2)){ var has = (cc.necks || []).indexOf(pairKey(a2, b3)) >= 0; if(has !== on) toggleNeck(cc, a2, b3); break; } }
        });
      }
    }
    state.selected = id;
    nodeSelection=[];mergePlan=null;lastNodeTap=null;
    setStatus(on ? 'tangent melted into a neck — set its size with junction smoothing; click again to straighten.' : 'tangent straightened.');
    render();
  }
  /* selection */
  function selectShape(id){
    state.selected=state.contours.some(function(c){return c.id===id;})?id:null;
    nodeSelection=[];mergePlan=null;lastNodeTap=null;tangentFocus=null;
    if(state.selected!==null)setStatus(touchEditing?'Tap a highlighted tangent for metaball; tap again to straighten.':'Shape selected. Click a tangent for metaball; click again to straighten.');
  }
  function deleteSelected(){
    if(state.selected === null || geometryBusy) return;
    commit();
    state.contours = state.contours.filter(function(c){ return c.id !== state.selected; });
    state.selected = null;tangentFocus=null; render();
  }
  $('selDelete').addEventListener('click', deleteSelected);

  /* ---------- size popup ---------- */
  var pop = $('sizePop'), szInput = $('szInput'), szRange = $('szRange'), shiftDown = false;
  function openSizePopup(k){
    if(!nodeActive(k))return;
    if(sizeEdit && sizeEdit.k === k) return;
    closeSizePopup(true);
    sizeEdit = { k: k, before: snapshot(), base: JSON.stringify(state.contours) };
    var v = Math.round(pctOf(k)), cap = sizeLimit(k);
    mirrorKeys(k).forEach(function(mk){ cap = Math.min(cap, maxPctFor(mk)); });
    szRange.max = cap; szInput.max = cap;
    szInput.value = v; szRange.value = v;
    pop.classList.add('open');
    render();
    // Focus the slider without summoning a virtual keyboard. Numeric editing is opt-in.
    szRange.focus({ preventScroll: true });
  }
  function placeSizePopup(){
    var pk = parseKey(sizeEdit.k), c = center(pk.i, pk.j), size = canvasSize();
    var rect = svg.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    var screen = new DOMPoint(c.x,c.y+radius(sizeEdit.k)).matrixTransform(svg.getScreenCTM());
    var x=screen.x-wr.left,y=screen.y-wr.top+10;
    var pw = pop.offsetWidth || 220, ph = pop.offsetHeight || 80;
    x = Math.max(6, Math.min(wr.width - pw - 6, x - pw / 2));
    if(y + ph > wr.height - 6) y = Math.max(6, new DOMPoint(c.x,c.y-radius(sizeEdit.k)).matrixTransform(svg.getScreenCTM()).y-wr.top-ph-10);
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  }
  function applySize(v, final){
    if(!sizeEdit) return;
    var keys = mirrorKeys(sizeEdit.k), cap = sizeLimit(sizeEdit.k), asked = Math.round(v);
    keys.forEach(function(mk){ cap = Math.min(cap, maxPctFor(mk)); });
    v = Math.max(0, Math.min(cap, asked));
    if(asked > cap) setStatus('size capped at ' + cap + ' % — touching a neighbouring circle.');
    szInput.value = v; szRange.value = v;
    keys.forEach(function(mk){ var nn = state.nodes[mk] || { pct: state.defaultPct, filled: false }; if(nn.pct !== v){ nn.pct = v;nn.sizeRatio=v/(state.defaultPct||100); state.nodes[mk] = nn; sizeEdit.dirty = true;geometryRevision++; } });
    if(final && sizeEdit.dirty){ settleFromBase(keys); }
    else if(sizeEdit.dirty && !liveTimer){ liveTimer = setTimeout(function(){ liveTimer = null; if(sizeEdit && sizeEdit.dirty){ settleFromBase(mirrorKeys(sizeEdit.k)); render(); } }, 70); }
    render();
  }
  var liveTimer = null;
  // every preview starts again from the shapes as they were when the popup opened, so sliding up and back down
  // returns exactly to the starting structure (a pocket pinched shut on the way up reopens on the way down)
  function settleFromBase(keys){
    if(!sizeEdit) return;
    var base=JSON.parse(JSON.stringify(state));base.contours=JSON.parse(sizeEdit.base);state.selected=null;
    sizeEdit.dirty=false;runGeometry('settle',{keys:keys,previousNodes:JSON.parse(sizeEdit.before).nodes},base);
  }
  function closeSizePopup(keep){
    if(!sizeEdit) return;
    var before = sizeEdit.before;
    if(keep){ if(sizeEdit.dirty) settleFromBase(mirrorKeys(sizeEdit.k)); if(snapshot() !== before){ undoStack.push(before); if(undoStack.length > 200) undoStack.shift(); redoStack = []; } }
    else {cancelGeometry();restore(before);}
    if(liveTimer)clearTimeout(liveTimer);liveTimer=null;
    sizeEdit = null; pop.classList.remove('open'); render();
    if(pop.contains(document.activeElement)) document.activeElement.blur();
  }
  szInput.addEventListener('input', function(){ if(this.value !== '') applySize(+this.value, false); });
  // during a drag the outline follows the circle live; the exact re-tension runs when the pointer is released
  szRange.addEventListener('pointerup', function(){ applySize(+this.value, true); });
  szInput.addEventListener('change', function(){ applySize(+this.value, true); });
  szRange.addEventListener('input', function(){ applySize(+this.value, false); });
  szRange.addEventListener('change', function(){ applySize(+this.value, true); });
  $('szMinus').addEventListener('click', function(){ applySize(+szInput.value - (shiftDown ? 10 : 1), true); });
  $('szPlus').addEventListener('click', function(){ applySize(+szInput.value + (shiftDown ? 10 : 1), true); });
  $('szOk').addEventListener('click', function(){ closeSizePopup(true); });
  $('szCancel').addEventListener('click', function(){ closeSizePopup(false); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Shift'){ shiftDown = true; szRange.step = 10; } });
  document.addEventListener('keyup', function(e){ if(e.key === 'Shift'){ shiftDown = false; szRange.step = 1; } });

  /* ---------- side panel controls ---------- */
  function clampInput(el){ var v = +el.value; if(isNaN(v)) v = +el.min; v = Math.max(+el.min, Math.min(+el.max, Math.round(v))); el.value = v; return v; }
  document.querySelectorAll('[data-step]').forEach(function(b){
    b.addEventListener('click', function(){
      var parts = b.getAttribute('data-step').split(':'), el = $(parts[0]);
      el.value = (+el.value || 0) + (+parts[1]); clampInput(el);
      el.dispatchEvent(new Event('change'));
    });
  });
  /* ---------- rotate the whole canvas by 90° ---------- */
  function rotateCanvas(cw){
    if(state.offset){ setStatus('rotation is not available with staggered rows.'); return; }
    closeSizePopup(true); cancelWork(); commit();
    var R = state.rows, C = state.cols;
    var mapKey = function(k){ if(isFreeKey(k))return k;var pk = parseKey(k); return cw ? key(pk.j, R - 1 - pk.i) : key(C - 1 - pk.j, pk.i); };
    var mapList = function(a){ return (a || []).map(mapKey); };
    var size=canvasSize(),nodes = {}; Object.keys(state.nodes).forEach(function(k){ var n=Object.assign({},state.nodes[k]);
      if(n.x!==undefined){var x=n.x,y=n.y;n.x=cw?size.H-y:y;n.y=cw?x:size.W-x;}
      if(n.homeX!==undefined){var hx=n.homeX,hy=n.homeY;n.homeX=cw?size.H-hy:hy;n.homeY=cw?hx:size.W-hx;}
      nodes[mapKey(k)] = n; });
    state.nodes = nodes;
    state.contours.forEach(function(c){
      c.tangents.forEach(function(t){ t.a = mapKey(t.a); t.b = mapKey(t.b); });
      if(c.single) c.single = mapKey(c.single);
      c.members = mapList(c.members); c.notches = mapList(c.notches); c.soft = mapList(c.soft); c.holes = mapList(c.holes); c.solo = mapList(c.solo);
      c.necks = (c.necks || []).map(function(pk){ var ab = pk.split('|'); return pairKey(mapKey(ab[0]), mapKey(ab[1])); });
      (c.cuts || []).forEach(function(cc){
        cc.tangents.forEach(function(t){ t.a = mapKey(t.a); t.b = mapKey(t.b); });
        if(cc.single) cc.single = mapKey(cc.single);
        cc.holes=mapList(cc.holes);cc.solo=mapList(cc.solo);cc.members = mapList(cc.members); cc.notches = mapList(cc.notches); cc.soft = mapList(cc.soft);
        cc.necks = (cc.necks || []).map(function(pk){ var ab = pk.split('|'); return pairKey(mapKey(ab[0]), mapKey(ab[1])); });
      });
    });
    state.rows = C; state.cols = R; $('colsIn').value = state.cols; $('rowsIn').value = state.rows;
    if(state.sym === 'v') state.sym = 'h'; else if(state.sym === 'h') state.sym = 'v';
    syncSymUi();
    maskCache = {}; state.selected = null; render();
    setStatus('canvas rotated ' + (cw ? 'clockwise.' : 'counter-clockwise.'));
  }
  $('rotL').addEventListener('click', function(){ rotateCanvas(false); });
  $('rotR').addEventListener('click', function(){ rotateCanvas(true); });

  /* ---------- project save / open ---------- */
  function projectJson(includeReferenceData){
    return JSON.stringify({ app: 'hofmann-trace', version: hasFreeNodes()?3:(editedLayout()?2:1), reference:referenceForProject(includeReferenceData), cols: state.cols, rows: state.rows, offset: state.offset, defaultPct: state.defaultPct, fillet: state.fillet, bevel: state.bevel, guideOpacity: state.guideOpacity, shapeColor: state.shapeColor, bgColor: state.bgColor, sym: state.sym, nodes: state.nodes, contours: state.contours, nextId: state.nextId }, null, 1);
  }
  function validateProject(o){
    if(!o || o.app !== 'hofmann-trace' || (o.version !== 1 && o.version !== 2 && o.version !== 3) || !Array.isArray(o.contours)) throw new Error('format');
    if(!Number.isInteger(o.cols) || o.cols < 2 || o.cols > 30 || !Number.isInteger(o.rows) || o.rows < 2 || o.rows > 30) throw new Error('grid');
    var count = 0, ids = {};
    function nodeKey(k){
      if(o.version===3&&isFreeKey(k)){if(!o.nodes||!Object.prototype.hasOwnProperty.call(o.nodes,k)||typeof o.nodes[k]?.x!=='number'||typeof o.nodes[k]?.y!=='number')throw new Error('free circle');return k;}
      if(typeof k !== 'string' || !/^(0|[1-9]\d*)_(0|[1-9]\d*)$/.test(k)) throw new Error('circle');
      var p = parseKey(k); if(p.i >= o.rows || p.j >= o.cols) throw new Error('circle'); return k;
    }
    function keys(a){ if(a === undefined) return []; if(!Array.isArray(a) || a.length > 1800) throw new Error('circles'); return uniq(a.map(nodeKey)); }
    function number(v, fallback, min, max){ if(v === undefined) return fallback; if(typeof v !== 'number' || !Number.isFinite(v)) throw new Error('number'); return Math.max(min, Math.min(max, v)); }
    function contour(c, isCut){
      if(!c || typeof c !== 'object' || !Array.isArray(c.tangents) || c.tangents.length > 7200 || ++count > 1800) throw new Error('shape');
      if(!Number.isSafeInteger(c.id) || c.id < 1) throw new Error('id');
      if(!isCut){ if(ids[c.id]) throw new Error('duplicate id'); ids[c.id] = true; }
      var clean = { id: c.id, closed: true, tangents: c.tangents.map(function(t){
        if(!t || ['O', 'A'].indexOf(t.fA) < 0 || ['O', 'A'].indexOf(t.fB) < 0) throw new Error('tangent');
        var n = { a: nodeKey(t.a), b: nodeKey(t.b), fA: t.fA, fB: t.fB };
        if(t.pinch !== undefined){ if(['entry', 'exit'].indexOf(t.pinch) < 0) throw new Error('pinch'); n.pinch = t.pinch; } return n;
      }) };
      if(c.single !== undefined) clean.single = nodeKey(c.single);
      if(!clean.single && !clean.tangents.length) throw new Error('empty shape');
      if(!clean.single) clean.tangents.forEach(function(t, i){ var next = clean.tangents[(i + 1) % clean.tangents.length]; if(t.b !== next.a || t.fB !== next.fA) throw new Error('open shape'); });
      ['members', 'notches', 'soft', 'holes', 'solo'].forEach(function(k){ if(c[k] !== undefined) clean[k] = keys(c[k]); });
      if(c.necks !== undefined && (!Array.isArray(c.necks) || c.necks.length > 7200)) throw new Error('necks');
      clean.necks = (c.necks || []).map(function(pair){ if(typeof pair !== 'string') throw new Error('neck'); var a = pair.split('|'); if(a.length !== 2) throw new Error('neck'); return pairKey(nodeKey(a[0]), nodeKey(a[1])); });
      if(isCut){ clean.cut = true; }
      else { if(c.cuts !== undefined && (!Array.isArray(c.cuts) || c.cuts.length > 900)) throw new Error('cuts'); clean.cuts = (c.cuts || []).map(function(cc){ return contour(cc, true); }); }
      return clean;
    }
    if(o.contours.length > 900) throw new Error('shapes');
    var clean = { cols: o.cols, rows: o.rows, offset: !!o.offset,
      defaultPct: number(o.defaultPct, 71, 0, 100), fillet: number(o.fillet, .3, 0, .6), bevel: number(o.bevel, 1, 0, 1), guideOpacity: number(o.guideOpacity, .6, 0, 1),
      shapeColor: normHex(o.shapeColor) || '#111111', bgColor: normHex(o.bgColor) || '#ffffff',
      sym: ['none', 'v', 'h', 'both'].indexOf(o.sym) >= 0 ? o.sym : 'none', nodes: {}, contours: o.contours.map(function(c){ return contour(c, false); }) };
    if(o.nodes !== undefined && (!o.nodes || typeof o.nodes !== 'object' || Array.isArray(o.nodes) || Object.keys(o.nodes).length > 1800)) throw new Error('nodes');
    Object.keys(o.nodes || {}).forEach(function(k){ var n = o.nodes[k]; if(!n || typeof n !== 'object') throw new Error('node'); var node={filled:n.filled===true};if(n.disabled!==undefined){if(typeof n.disabled!=='boolean')throw new Error('disabled');node.disabled=n.disabled;}
      if(n.fused!==undefined){if(typeof n.fused!=='boolean')throw new Error('fused');node.fused=n.fused;}
      var w=MARGIN*2+(o.cols-1)*S+(o.offset?S/2:0),h=MARGIN*2+(o.rows-1)*S*(o.offset?Math.sqrt(3)/2:1);
      if(n.x!==undefined||n.y!==undefined){if(n.x===undefined||n.y===undefined||n.x<0||n.x>w||n.y<0||n.y>h)throw new Error('position');node.x=number(n.x,0,0,w);node.y=number(n.y,0,0,h);}
      if(n.homeX!==undefined||n.homeY!==undefined){if(n.homeX===undefined||n.homeY===undefined||n.homeX<0||n.homeX>w||n.homeY<0||n.homeY>h)throw new Error('origin');node.homeX=number(n.homeX,0,0,w);node.homeY=number(n.homeY,0,0,h);}
      if(n.pct!==undefined)node.pct=number(n.pct,clean.defaultPct,0,(n.fused||isFreeKey(k))?6200:150);if(n.sizeRatio!==undefined)node.sizeRatio=number(n.sizeRatio,1,0,6200);if(node.disabled)node.filled=false;clean.nodes[nodeKey(k)]=node; });
    function checkActive(c){var refs=[c.single].concat((c.tangents||[]).flatMap(function(t){return[t.a,t.b];}),c.members||[],c.holes||[],c.notches||[],c.soft||[]);refs.forEach(function(k){if(k&&clean.nodes[k]&&clean.nodes[k].disabled)throw new Error('removed support');});(c.cuts||[]).forEach(checkActive);}clean.contours.forEach(checkActive);
    clean.reference=validateReference(o.reference);
    clean.nextId = Math.max(Number.isSafeInteger(o.nextId) && o.nextId > 0 && o.nextId < Number.MAX_SAFE_INTEGER - 10000 ? o.nextId : 1, clean.contours.reduce(function(m, c){ return Math.max(m, c.id + 1, (c.cuts || []).reduce(function(n, cc){ return Math.max(n, cc.id + 1); }, 1)); }, 1));
    if(clean.nextId > Number.MAX_SAFE_INTEGER - 10000) throw new Error('id');
    return clean;
  }
  function loadProject(text){
    var o;
    try{ if(typeof text !== 'string' || text.length > 10000000) throw new Error('size'); o = validateProject(JSON.parse(text)); }
    catch(e){ setStatus('this file is not a valid Hofmann Trace project.'); return false; }
    closeSizePopup(true); cancelWork(); commit();
    state.cols = Math.max(2, Math.min(30, o.cols | 0)); state.rows = Math.max(2, Math.min(30, o.rows | 0)); state.offset = !!o.offset;
    state.defaultPct = o.defaultPct; state.fillet = o.fillet;
    state.guideOpacity = typeof o.guideOpacity === 'number' ? o.guideOpacity : 0.6;
    state.bevel = typeof o.bevel === 'number' ? Math.max(0, Math.min(1, o.bevel)) : 1; bevelApplied = state.bevel; $('bevelIn').value = Math.round(state.bevel * 100);
    state.shapeColor = normHex(o.shapeColor) || '#111111'; state.bgColor = normHex(o.bgColor) || '#ffffff';
    state.sym = ['none', 'v', 'h', 'both'].indexOf(o.sym) >= 0 ? o.sym : 'none';
    state.nodes = o.nodes && typeof o.nodes === 'object' ? o.nodes : {};
    state.contours = o.contours.filter(function(c){ return c && Array.isArray(c.tangents); });
    state.nextId = Math.max(+o.nextId || 1, state.contours.reduce(function(m, c){ return Math.max(m, (c.id || 0) + 1); }, 1));
    state.reference=registerReference(o.reference);invalidateTrace();
    state.selected = null; maskCache = {};
    runGeometry('normalize');resetView();
    if(state.offset) state.sym = 'none';
    $('colsIn').value = state.cols; $('rowsIn').value = state.rows; $('offsetIn').checked = state.offset; syncSymUi();
    $('sizeIn').value = state.defaultPct; $('sizeValue').textContent=state.defaultPct+' %'; $('guideIn').value = Math.round(state.guideOpacity * 100); $('filletIn').value = Math.round(state.fillet * 100);
    $('shapeColor').value = state.shapeColor; $('shapeHex').value = state.shapeColor; $('bgColor').value = state.bgColor; $('bgHex').value = state.bgColor;
    render();
    setStatus('project opened — ' + state.contours.length + ' shape' + (state.contours.length === 1 ? '' : 's') + '.');
    return true;
  }
  $('openProject').addEventListener('click', function(){ $('exportMenu').classList.remove('open'); $('projectFile').value = ''; $('projectFile').click(); });
  $('projectFile').addEventListener('change', function(){
    var f = this.files && this.files[0]; if(!f) return;
    if(f.size > 10000000){ setStatus('project file is too large (10 MB maximum).'); return; }
    var rd = new FileReader(); rd.onload = function(){ loadProject(String(rd.result)); }; rd.onerror = function(){ setStatus('could not read this project file.'); }; rd.readAsText(f);
  });
  function resetGrid(prop, value){
    closeSizePopup(true); cancelWork(); commit();
    state[prop] = value;
    if(state.offset) state.sym = 'none';
    state.contours = []; state.nodes = {}; state.selected = null;
    syncControls();
    render();
    setStatus('grid changed — canvas cleared.');
  }
  $('colsIn').addEventListener('change', function(){ var v = clampInput(this); if(v !== state.cols) resetGrid('cols', v); });
  $('rowsIn').addEventListener('change', function(){ var v = clampInput(this); if(v !== state.rows) resetGrid('rows', v); });
  $('offsetIn').addEventListener('change', function(){ if(this.checked !== state.offset) resetGrid('offset', this.checked); });
  /* symmetry: rail button + small icon popup */
  var symNames = { none: 'symmetry off.', v: 'left / right symmetry — what you draw, resize, fill or melt is mirrored.', h: 'top / bottom symmetry — what you draw, resize, fill or melt is mirrored.', both: 'symmetry on both axes — what you draw, resize, fill or melt is mirrored.' };
  function syncSymUi(){
    var on = state.sym !== 'none', btn = $('symBtn');
    btn.classList.toggle('dim', !on); btn.classList.toggle('on', on);
    btn.disabled = !!state.offset;
    btn.setAttribute('data-tip', state.offset ? 'symmetry (not with staggered rows)' : 'symmetry (m)');
    $('symMenu').querySelectorAll('[data-sym]').forEach(function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-sym') === state.sym ? 'true' : 'false'); });
  }
  function setSym(v){
    if(state.offset) v = 'none';
    if(state.sym!==v)commit(); state.sym = v; syncSymUi(); render(); setStatus(symNames[v]);
  }
  function openSymMenu(){
    if(state.offset) return;
    var menu = $('symMenu'), r = $('symBtn').getBoundingClientRect();
    menu.classList.add('open');
    var mr = menu.getBoundingClientRect();
    if(window.innerWidth <= 760){ menu.style.left = Math.max(6, Math.min(window.innerWidth - mr.width - 6, r.left + r.width / 2 - mr.width / 2)) + 'px'; menu.style.top = (r.top - mr.height - 6) + 'px'; }
    else { menu.style.left = (r.right + 6) + 'px'; menu.style.top = Math.max(6, Math.min(window.innerHeight - mr.height - 6, r.top + r.height / 2 - mr.height / 2)) + 'px'; }
  }
  function closeSymMenu(){ $('symMenu').classList.remove('open'); }
  $('symBtn').addEventListener('click', function(){ if($('symMenu').classList.contains('open')) closeSymMenu(); else openSymMenu(); });
  $('symMenu').addEventListener('click', function(e){ var b = e.target.closest('[data-sym]'); if(!b) return; closeSymMenu(); setSym(b.getAttribute('data-sym')); });
  syncSymUi();
  // A whole slider drag or colour edit occupies one history entry. Geometry
  // previews use its initial contours so moving back restores the same topology.
  var controlEdit=null,controlTimer=null,bevelTimer=null,bevelBefore=null,bevelApplied=1;
  function beginControlEdit(prop){
    if(controlEdit&&controlEdit.prop===prop)return;
    finishControlEdit();closeSizePopup(true);
    controlEdit={prop:prop,before:snapshot(),base:JSON.parse(JSON.stringify(state)),dirty:false};
  }
  function previewControl(){
    if(controlTimer)clearTimeout(controlTimer);controlTimer=null;
    if(!controlEdit||!controlEdit.dirty)return;
    var base=JSON.parse(JSON.stringify(state));base.contours=JSON.parse(JSON.stringify(controlEdit.base.contours));base.nodes=JSON.parse(JSON.stringify(controlEdit.prop==='defaultPct'?state.nodes:controlEdit.base.nodes));
    var prop=controlEdit.prop;controlEdit.dirty=false;
    if(state[prop]===controlEdit.base[prop]){cancelGeometry();state.contours=base.contours;state.nodes=JSON.parse(JSON.stringify(controlEdit.base.nodes));maskCache={};maskCacheN=0;return;}
    if(prop==='bevel')runGeometry('bevel',{from:controlEdit.base.bevel},base);
    else if(prop==='defaultPct')runGeometry('settle',{caps:true},base);
  }
  function finishControlEdit(){
    if(!controlEdit)return;previewControl();var before=controlEdit.before;controlEdit=null;
    if(snapshot()!==before)pushHistory(before);
  }
  function bindRange(id,prop,scale,geometry){
    var el=$(id);
    function update(){
      if(geometryBusy&&(!controlEdit||controlEdit.prop!==prop)){el.value=state[prop]*scale;return;}
      var v=+el.value/scale;if(v===state[prop])return;
      beginControlEdit(prop);if(prop==='defaultPct')scaleAllNodes(v,controlEdit.base);state[prop]=v;if(geometry)geometryRevision++;controlEdit.dirty=geometry;
      if(prop==='defaultPct')$('sizeValue').textContent=Math.round(v)+' %';
      if(geometry&&!controlTimer)controlTimer=setTimeout(previewControl,70);
      scheduleRender();
    }
    el.addEventListener('input',update);
    el.addEventListener('change',function(){update();finishControlEdit();scheduleRender();});
    el.addEventListener('blur',finishControlEdit);
  }
  bindRange('sizeIn','defaultPct',1,true);bindRange('bevelIn','bevel',100,true);
  bindRange('guideIn','guideOpacity',100,false);bindRange('filletIn','fillet',100,false);
  function normHex(v){
    v = (typeof v === 'string' ? v : '').trim().replace(/^#/, '');
    if(/^[0-9a-f]{3}$/i.test(v)) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    return /^[0-9a-f]{6}$/i.test(v) ? '#' + v.toLowerCase() : null;
  }
  function bindColor(pickerId, hexId, prop){
    var picker = $(pickerId), hex = $(hexId);
    picker.addEventListener('input', function(){ beginControlEdit(prop); state[prop] = this.value; hex.value = this.value; hex.classList.remove('bad'); render(); });
    hex.addEventListener('input', function(){ var v = normHex(this.value); this.classList.toggle('bad', !v); if(v){ beginControlEdit(prop); state[prop] = v; picker.value = v; render(); } });
    picker.addEventListener('change',function(){finishControlEdit();render();});
    hex.addEventListener('blur',finishControlEdit);
    hex.addEventListener('change', function(){ finishControlEdit();var v = normHex(this.value); if(v) this.value = v; else { this.value = state[prop]; this.classList.remove('bad'); } });
  }
  bindColor('shapeColor', 'shapeHex', 'shapeColor');
  bindColor('bgColor', 'bgHex', 'bgColor');
  $('clearBtn').addEventListener('click', function(){ if(!state.contours.length && !Object.keys(state.nodes).length && !relax && !poly && !geometryBusy) return; closeSizePopup(true); cancelWork(); commit(); state.contours = []; state.nodes = {}; state.selected = null; render(); setStatus('canvas cleared.'); });
  $('undoBtn').addEventListener('click', undo);
  $('redoBtn').addEventListener('click', redo);
  function setSettingsOpen(open){
    $('side').classList.toggle('open', open);
    $('settingsBtn').setAttribute('aria-expanded', String(open));
  }
  $('settingsBtn').addEventListener('click', function(e){
    e.preventDefault(); e.stopPropagation();
    $('exportMenu').classList.remove('open'); closeSymMenu(); closeSizePopup(true);
    setSettingsOpen(!$('side').classList.contains('open'));
  });
  document.addEventListener('pointerdown', function(e){
    if(window.innerWidth <= 760 && $('side').classList.contains('open') && !e.target.closest('#side') && !e.target.closest('#settingsBtn')) setSettingsOpen(false);
    if(!e.target.closest('.menu') && !e.target.closest('#exportBtn')) $('exportMenu').classList.remove('open');
    if(!e.target.closest('#symMenu') && !e.target.closest('#symBtn')) closeSymMenu();
  });

  document.addEventListener('keydown', function(e){
    if(previewHold){if(e.key==='Escape')endInstantPreview();return;}
    var mod = e.ctrlKey || e.metaKey, tag = document.activeElement && document.activeElement.tagName;
    if(mod && e.key.toLowerCase() === 'z'){ e.preventDefault(); if(e.shiftKey) redo(); else undo(); return; }
    if(mod && e.key.toLowerCase() === 'y'){ e.preventDefault(); redo(); return; }
    if(state.tool==='select'&&tag!=='INPUT'&&(e.key==='Delete'||e.key==='Backspace')){e.preventDefault();if(nodeSelection.length)deleteNodes();else deleteSelected();return;}
    if(state.tool==='select'&&e.key==='Escape'&&!sizeEdit&&!geometryBusy){finishNodeGesture(false);cancelAddPlacement();sizeCopy=null;selectShape(null);render();return;}
    if(tag === 'INPUT'){ if(e.key === 'Enter' && sizeEdit){ closeSizePopup(true); } if(e.key === 'Escape' && sizeEdit){ closeSizePopup(false); } return; }
    if(e.key === 'Escape'){ if(sizeEdit) closeSizePopup(false); else if(poly) cancelPoly(); else if(geometryBusy){cancelWork();setStatus('Update cancelled.');render();} else if(relax){ relax = null; activeObstacles = null; render(); } else if(state.selected !== null){ state.selected = null; render(); } }
    else if(e.key === 'Enter'){ if(poly && poly.pts.length >= 3) closePoly(); else if(sizeEdit) closeSizePopup(true); }
    else if((e.key === 'Delete' || e.key === 'Backspace') && state.selected !== null) deleteSelected();
    else if(e.key === 'l') setTool('lassoAdd');
    else if(e.key === 'L') setTool('lassoSub');
    else if(e.key === 'p') setTool('polyAdd');
    else if(e.key === 'P') setTool('polySub');
    else if(e.key === 'v') setTool('select');
    else if(e.key === 'f') setTool('fill');
    else if(e.key === 'm'){ var order = ['none', 'v', 'h', 'both']; setSym(order[(order.indexOf(state.sym) + 1) % order.length]); }
  });

