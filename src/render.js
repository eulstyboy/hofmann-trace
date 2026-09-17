  /* ---------- render ---------- */
  var drawing = null, relax = null, poly = null, sizeEdit = null, raf = null, lastMouse = null;
  // moving average along an open polyline (the hand-drawn stroke), ends kept in place
  function smoothOpen(pts, w){
    var n = pts.length; if(n < 5) return pts;
    var out = new Array(n);
    for(var i = 0; i < n; i++){
      var a = Math.max(0, i - w), b = Math.min(n - 1, i + w), sx = 0, sy = 0, k = 0;
      for(var j = a; j <= b; j++){ sx += pts[j].x; sy += pts[j].y; k++; }
      out[i] = { x: sx / k, y: sy / k };
    }
    out[0] = pts[0]; out[n - 1] = pts[n - 1];
    return out;
  }
  // moving average along a closed loop, after resampling at a fixed spacing (so the window is a distance, not a point count)
  function smoothClosed(pts, spacing, w){
    var r = elResample(pts, spacing), n = r.length; if(n < 8) return r;
    var out = new Array(n);
    for(var i = 0; i < n; i++){
      var sx = 0, sy = 0;
      for(var j = -w; j <= w; j++){ var q = r[(i + j + n) % n]; sx += q.x; sy += q.y; }
      out[i] = { x: sx / (2 * w + 1), y: sy / (2 * w + 1) };
    }
    return out;
  }
  function scheduleRender(){ if(raf) return; raf = requestAnimationFrame(function(){ raf = null; render(); }); }

  var sceneSignature=null,sceneHTML=null,overlayHTML=null;
  function render(){
    if(nodeGesture&&nodeGesture.fastDOM){renderMovingElements(nodeGesture);return;}
    var size = canvasSize();
    frame.style.aspectRatio = size.W + ' / ' + size.H;
    var availH = Math.max(120, wrap.clientHeight - 28);
    frame.style.maxWidth = Math.round(size.W / size.H * availH) + 'px';
    var gridKey=state.cols+','+state.rows+','+state.offset;if(viewGrid!==gridKey){viewGrid=gridKey;resetView();}else applyView();
    var editingNodes=state.tool==='select'&&(addPlacement||!!sizeCopy||!!(nodeGesture&&nodeGesture.kind!=='surface'));
    var signature=JSON.stringify([state,!!drawing,!!relax,sizeEdit&&sizeEdit.k,editingNodes]);
    if(signature!==sceneSignature){sceneSignature=signature;
    var out = [];
    out.push('<rect x="0" y="0" width="' + size.W + '" height="' + size.H + '" fill="' + state.bgColor + '"/>');
    out.push(referenceSvg());
    state.contours.forEach(function(c){
      var sv = shapeSvg(c, ' class="shape" data-contour="' + c.id + '"'); if(sv) out.push('<g data-artwork="'+c.id+'">'+sv+'</g>');
    });
    Object.keys(state.nodes).forEach(function(k){
      if(!nodeActive(k)||!state.nodes[k].filled) return;
      var pk = parseKey(k); if(!isFreeKey(k)&&(pk.i >= state.rows || pk.j >= state.cols)) return;
      var fp = center(pk.i, pk.j);
      out.push('<path data-filled="'+k+'" fill="' + state.shapeColor + '" d="' + segsToSvg(circleSegs(k)) + '"/>');
    });
    // clickable tangents (straight <-> metaball neck)
    if(!editingNodes && state.tool !== 'polyAdd' && state.tool !== 'polySub' && !drawing && !relax){
      state.contours.forEach(function(c){
        [c].concat(c.cuts || []).forEach(function(part, partIndex){
        var sg = contourSegments(part); if(!sg || !sg.hits) return;
        sg.hits.forEach(function(h){
          if(Math.hypot(h.pB.x - h.pA.x, h.pB.y - h.pA.y) < 4) return;
          if(state.selected === c.id) out.push('<path class="tan-marker' + (h.neck ? ' necked' : '') + '"' + (hasHoles(c) ? ' clip-path="url(#clip-' + c.id + ')"' : '') + ' d="' + h.d + '"/>');
          out.push('<path class="tan-hit' + (h.neck ? ' necked' : '') + (state.selected === c.id ? ' revealed' : '') + '" data-contour="' + c.id + '" data-cut="' + (partIndex - 1) + '" data-a="' + h.a + '" data-b="' + h.b + '"' + (hasHoles(c) ? ' clip-path="url(#clip-' + c.id + ')"' : '') + ' d="' + h.d + '"/>');
        });
        });
      });
    }
    if(state.selected !== null){
      var sc = state.contours.filter(function(c){ return c.id === state.selected; })[0];
      if(sc){
        var sd = shapePathD(sc);
        if(sd && !hasHoles(sc)) out.push('<path class="selection" d="' + sd + '"/>');
        else if(sd){
          // dashes only along the edge of the filled area: the stroke is clipped to (outline) ∩ (outline − cuts − holes),
          // so an outline running through a cut, or a cut edge outside the outline, is not drawn
          out.push('<path class="selection inner" clip-path="url(#clip-' + sc.id + ')" d="' + sd + '"/>');
        }
      }
    }
    if(symOn()){
      if(state.sym === 'v' || state.sym === 'both') out.push('<line class="axis" x1="' + fmt(size.W / 2) + '" y1="0" x2="' + fmt(size.W / 2) + '" y2="' + fmt(size.H) + '"/>');
      if(state.sym === 'h' || state.sym === 'both') out.push('<line class="axis" x1="0" y1="' + fmt(size.H / 2) + '" x2="' + fmt(size.W) + '" y2="' + fmt(size.H / 2) + '"/>');
    }
    var go = state.guideOpacity;
    if(go > 0){
      for(var slot of activeKeys()){var coordinate=parseKey(slot),i=coordinate.i,j=coordinate.j;
        var k = key(i, j), p = center(i, j), r = radius(k), gnd = nodeOf(k);
        if(r < 1.2) out.push('<circle data-guide="'+k+'" class="guide-dot" fill-opacity="' + go + '" cx="' + fmt(p.x) + '" cy="' + fmt(p.y) + '" r="1.6"/>');
        else if(gnd.e === 0) out.push('<circle data-guide="'+k+'" class="guide" stroke-opacity="' + go + '" stroke-width="1" cx="' + fmt(p.x) + '" cy="' + fmt(p.y) + '" r="' + fmt(r) + '"/>');
        else out.push('<rect data-guide="'+k+'" class="guide" stroke-opacity="' + go + '" stroke-width="1" x="' + fmt(p.x - r) + '" y="' + fmt(p.y - r) + '" width="' + fmt(2 * r) + '" height="' + fmt(2 * r) + '" rx="' + fmt(gnd.rho) + '"/>');
      }
    }
    for(var slot2 of activeKeys()){var coordinate2=parseKey(slot2),i2=coordinate2.i,j2=coordinate2.j;
      var k2 = key(i2, j2), p2 = center(i2, j2);
      var cls = 'node-hit' + (sizeEdit && sizeEdit.k === k2 ? ' editing' : '');
      out.push('<circle class="' + cls + '" data-node="' + k2 + '" cx="' + fmt(p2.x) + '" cy="' + fmt(p2.y) + '" r="' + fmt(Math.max(radius(k2), S * 0.22)) + '"/>');
    }
    var html=out.join('');if(html!==sceneHTML){
      var layer=$('sceneLayer');if(!layer){svg.innerHTML='<g id="sceneLayer"></g><g id="overlayLayer" pointer-events="none"></g>';layer=$('sceneLayer');}
      layer.innerHTML=html;sceneHTML=html;
    }}
    var out=[tracePreviewSvg(),nodeEditorOverlay()];
    var sub = state.tool === 'lassoSub' || state.tool === 'polySub';
    if(drawing && drawing.points.length > 1){
      out.push('<polyline class="stroke' + (drawing.sub ? ' sub' : '') + '" points="' + smoothOpen(drawing.points, 4).map(function(q){ return fmt(q.x) + ',' + fmt(q.y); }).join(' ') + '"/>');
    }
    if(relax){ out.push('<polygon class="band' + (relax.sub ? ' sub' : '') + '" points="' + relax.pts.map(function(q){ return fmt(q.x) + ',' + fmt(q.y); }).join(' ') + '"/>'); }
    if(poly && poly.pts.length){
      var pp = poly.pts.map(function(q){ return fmt(q.x) + ',' + fmt(q.y); }).join(' ');
      out.push('<polyline class="poly' + (sub ? ' sub' : '') + '" points="' + pp + '"/>');
      if(lastMouse){ var l = poly.pts[poly.pts.length - 1]; out.push('<line class="poly-rubber' + (sub ? ' sub' : '') + '" x1="' + fmt(l.x) + '" y1="' + fmt(l.y) + '" x2="' + fmt(lastMouse.x) + '" y2="' + fmt(lastMouse.y) + '"/>'); }
      poly.pts.forEach(function(q, qi){ out.push('<circle class="poly-vertex' + (sub ? ' sub' : '') + '" cx="' + fmt(q.x) + '" cy="' + fmt(q.y) + '" r="' + (qi === 0 ? 4 : 2.5) + '"/>'); });
    }
    var overlay=out.join('');if(overlay!==overlayHTML){$('overlayLayer').innerHTML=overlay;overlayHTML=overlay;}
    $('busyBadge').hidden=!geometryBusy;svg.setAttribute('aria-busy',String(!!geometryBusy));
    var hardBusy=geometryBusy&&!controlEdit&&!sizeEdit;
    ['sizeIn','bevelIn','rotL','rotR','selDelete'].forEach(function(id){$(id).disabled=hardBusy;});
    var action=$('tangentAction');action.hidden=true;
    if(tangentFocus&&state.selected===+tangentFocus['data-contour']){
      var tc=state.contours.find(function(c){return c.id===state.selected;});var ci=+tangentFocus['data-cut'];if(ci>=0&&tc)tc=(tc.cuts||[])[ci];
      if(tc){action.hidden=false;action.disabled=geometryBusy;action.textContent=(tc.necks||[]).indexOf(pairKey(tangentFocus['data-a'],tangentFocus['data-b']))>=0?'Straighten':'Smooth';}
    }
    $('undoBtn').disabled = undoStack.length === 0;
    $('redoBtn').disabled = redoStack.length === 0;
    $('polyFloat').classList.toggle('open', !!(poly && poly.pts.length >= 3));
    $('selFloat').classList.toggle('open', state.selected !== null && !poly && !drawing);
    if(sizeEdit) placeSizePopup();
    if(!geometryBusy&&!drawing&&!paintStroke&&!nodeGesture&&!controlEdit&&!sizeEdit)queueSharePreview();
    var pixelMode=state.bevel<.001;$('fillIcon').setAttribute('href',pixelMode?'#i-pencil':'#i-bucket');var fillButton=document.querySelector('[data-tool="fill"]');fillButton.setAttribute('aria-label',pixelMode?'pixel pencil':'fill');fillButton.setAttribute('data-tip',pixelMode?'pixel pencil: drag to paint or erase (f)':'fill: drag to paint or erase (f)');
    syncReferenceUi();syncNodeEditor();if(!nodeGesture)queueAutosave();
  }
  window.addEventListener('resize', scheduleRender);

  /* ---------- pointer helpers ---------- */
  function svgPoint(e){
    var p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());return {x:p.x,y:p.y};
  }
  function nodeAt(pt, factor){
    var best = null, bestD = Infinity;
    for(var slot of activeKeys()){var coordinate=parseKey(slot),i=coordinate.i,j=coordinate.j;
      var k = key(i, j), c = center(i, j), d = Math.hypot(c.x - pt.x, c.y - pt.y);
      var nd = nodeGeomFor(k,c, Math.max(radius(k), S * 0.22)), cap = nd.r * ((factor || 1) - 1);
      if(sdf(pt, nd) < cap && d < bestD){ bestD = d; best = k; }
    }
    return best;
  }

  function samplePath(d, h){
    var el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', d); el.setAttribute('fill', 'none');
    svg.appendChild(el);
    var L = el.getTotalLength(), pts = [], n = Math.max(24, Math.round(L / h));
    for(var i = 0; i < n; i++){ var p = el.getPointAtLength(L * i / n); pts.push({ x: p.x, y: p.y }); }
    svg.removeChild(el);
    return pts;
  }
