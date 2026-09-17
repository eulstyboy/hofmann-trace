  /* ---------- export ---------- */
  function hexToRgb(h){ var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function exportSvgString(withBg){
    var size = canvasSize(), body = '';
    if(withBg) body += '<rect width="' + fmt(size.W) + '" height="' + fmt(size.H) + '" fill="' + state.bgColor + '"/>';
    body += '<g id="shapes">';
    state.contours.forEach(function(c){ body += shapeSvg(c); });
    body += '</g>';
    var filled = Object.keys(state.nodes).filter(function(k){ return nodeActive(k)&&state.nodes[k].filled; });
    if(filled.length){
      body += '<g id="filled-circles">';
      filled.forEach(function(k){ body += '<path d="' + segsToSvg(circleSegs(k)) + '" fill="' + state.shapeColor + '"/>'; });
      body += '</g>';
    }
    return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + fmt(size.W) + '" height="' + fmt(size.H) + '" viewBox="0 0 ' + fmt(size.W) + ' ' + fmt(size.H) + '">' + body + '</svg>';
  }
  function segsToEps(sg, H){
    var deg = function(a){ return fmt(-a * 180 / Math.PI); };
    var s = fmt(sg.start.x) + ' ' + fmt(H - sg.start.y) + ' moveto\n';
    sg.segs.forEach(function(g){
      if(g.t === 'L'){ s += fmt(g.to.x) + ' ' + fmt(H - g.to.y) + ' lineto\n'; return; }
      var op = g.flow === 'O' ? 'arcn' : 'arc';
      if(g.full){
        var mid = g.flow === 'O' ? g.aIn + Math.PI : g.aIn - Math.PI;
        s += fmt(g.c.x) + ' ' + fmt(H - g.c.y) + ' ' + fmt(g.r) + ' ' + deg(g.aIn) + ' ' + deg(mid) + ' ' + op + '\n';
        s += fmt(g.c.x) + ' ' + fmt(H - g.c.y) + ' ' + fmt(g.r) + ' ' + deg(mid) + ' ' + deg(g.aOut) + ' ' + op + '\n';
      } else {
        s += fmt(g.c.x) + ' ' + fmt(H - g.c.y) + ' ' + fmt(g.r) + ' ' + deg(g.aIn) + ' ' + deg(g.aOut) + ' ' + op + '\n';
      }
    });
    return s + (sg.closed ? 'closepath\n' : '');
  }
  function exportEpsString(withBg){
    var size = canvasSize(), W = fmt(size.W), H = fmt(size.H);
    var rgb = function(h){ return hexToRgb(h).map(function(v){ return fmt(v / 255); }).join(' '); };
    var s = '%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: Hofmann Trace\n%%BoundingBox: 0 0 ' + Math.ceil(size.W) + ' ' + Math.ceil(size.H) + '\n%%HiResBoundingBox: 0 0 ' + W + ' ' + H + '\n%%EndComments\ngsave\n';
    if(withBg) s += rgb(state.bgColor) + ' setrgbcolor\nnewpath 0 0 moveto ' + W + ' 0 lineto ' + W + ' ' + H + ' lineto 0 ' + H + ' lineto closepath fill\n';
    s += rgb(state.shapeColor) + ' setrgbcolor\n';
    state.contours.forEach(function(c){
      var sg = contourSegments(c); if(!sg) return;
      if(hasHoles(c)){
        s += 'gsave\nnewpath\n' + segsToEps(sg, size.H) + 'clip\n';
        holeSegsList(c).forEach(function(hs){
          s += 'newpath\n-1 -1 moveto ' + (W + 1) + ' -1 lineto ' + (W + 1) + ' ' + (H + 1) + ' lineto -1 ' + (H + 1) + ' lineto closepath\n' + segsToEps(hs, size.H) + 'eoclip\n';
        });
        s += 'newpath\n' + segsToEps(sg, size.H) + 'fill\ngrestore\n';
      } else {
        s += 'newpath\n' + segsToEps(sg, size.H) + 'fill\n';
      }
    });
    Object.keys(state.nodes).forEach(function(k){
      if(!nodeActive(k)||!state.nodes[k].filled) return;
      var pk = parseKey(k), p = center(pk.i, pk.j);
      s += 'newpath\n' + segsToEps(circleSegs(k), size.H) + 'fill\n';
    });
    return s + 'grestore\nshowpage\n%%EOF\n';
  }
  function rasterize(longSide, type, cb){
    var size = canvasSize(), scale = longSide / Math.max(size.W, size.H);
    var w = Math.round(size.W * scale), h = Math.round(size.H * scale);
    var svgStr = exportSvgString(type === 'image/jpeg' ? true : $('exportBg').checked);
    var img = new Image(), bg = state.bgColor;
    img.onload = function(){
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var ctx = cv.getContext('2d');
      try{
        if(type === 'image/jpeg'){ ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(img, 0, 0, w, h);
        cv.toBlob(function(blob){ cb(blob); }, type, 0.92);
      }catch(err){ cb(null); }
    };
    img.onerror = function(){ cb(null); };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
  }
  function saveFile(filename, data){
    var types = { json: 'application/json', svg: 'image/svg+xml', eps: 'application/postscript', png: 'image/png', jpg: 'image/jpeg' };
    try{
      var blob = data instanceof Blob ? data : new Blob([data], { type: types[filename.split('.').pop()] || 'application/octet-stream' });
      var url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
      setStatus(filename + ' — download requested.');
    }catch(err){ setStatus('download failed. Try opening the app directly in your browser.'); }
  }
  function hasArtwork(){ return state.contours.length > 0 || Object.keys(state.nodes).some(function(k){ return nodeActive(k)&&state.nodes[k].filled; }); }
  $('exportBtn').addEventListener('click', function(){ $('exportMenu').classList.toggle('open'); });
  $('exportMenu').addEventListener('click', async function(e){
    var b = e.target.closest('[data-fmt]'); if(!b) return;
    $('exportMenu').classList.remove('open');
    var fmtName = b.getAttribute('data-fmt');
    if(fmtName==='json'){openProjectSave();return;}
    finishPaint(true);finishControlEdit();closeSizePopup(true);await whenIdle();
    if(!hasArtwork()){ setStatus('nothing to export — draw a shape first.'); return; }
    var sz = b.getAttribute('data-size') === 'hd' ? 2160 : 1080, withBg = $('exportBg').checked;
    if(fmtName === 'svg') saveFile('hofmann-trace.svg', exportSvgString(withBg));
    else if(fmtName === 'merged'){setStatus('Merging vector outlines…');var result=await runGeometry('flatten',{withBg:withBg});if(result&&result.text)saveFile('hofmann-trace-merged.svg',result.text);}
    else if(fmtName === 'eps') saveFile('hofmann-trace.eps', exportEpsString(withBg));
    else {
      var type = fmtName === 'jpg' ? 'image/jpeg' : 'image/png';
      setStatus('rendering image…');
      rasterize(sz, type, function(blob){ if(!blob){ setStatus('rendering failed.'); return; } saveFile('hofmann-trace-' + sz + '.' + (fmtName === 'jpg' ? 'jpg' : 'png'), blob); });
    }
  });

