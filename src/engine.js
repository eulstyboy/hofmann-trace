  // Contrast sampling happens in the page; assembling editable grid contours
  // happens here, in the same Worker as the drawing engine.
  function buildImageTrace(keys,style){
    if(style==='pixels'){keys.forEach(function(k){var n=state.nodes[k]||{};n.filled=true;state.nodes[k]=n;});return;}
    var remaining=new Set(keys);
    function single(k){state.contours.push({id:state.nextId++,single:k,closed:true,tangents:[],members:[k],holes:[],cuts:[],necks:[],notches:[],soft:[]});}
    while(remaining.size){
      var first=remaining.values().next().value,component=[],queue=[first];remaining.delete(first);
      for(var q=0;q<queue.length;q++){
        var k=queue[q],pk=parseKey(k),c=center(pk.i,pk.j);component.push(k);
        remaining.forEach(function(candidate){var p=nodeCenter(candidate);
          if(Math.hypot(p.x-c.x,p.y-c.y)<=S*1.05){remaining.delete(candidate);queue.push(candidate);}
        });
      }
      if(component.length===1){single(component[0]);continue;}
      var d=component.map(function(k){var pk=parseKey(k),p=center(pk.i,pk.j);return'M'+(p.x-S/2)+','+(p.y-rowStep()/2)+'h'+S+'v'+rowStep()+'h'+(-S)+'Z';}).join('');
      // Crop each component: a few isolated pixels must not allocate a full
      // 30×30 canvas for every small shape in a high-contrast photograph.
      var centers=component.map(function(k){var p=parseKey(k);return center(p.i,p.j);});
      var left=Math.floor(Math.min.apply(null,centers.map(function(p){return p.x;}))-S/2-2),top=Math.floor(Math.min.apply(null,centers.map(function(p){return p.y;}))-rowStep()/2-2);
      var width=Math.ceil(Math.max.apply(null,centers.map(function(p){return p.x;}))+S/2+2-left),height=Math.ceil(Math.max.apply(null,centers.map(function(p){return p.y;}))+rowStep()/2+2-top);
      var canvas=createCanvas();canvas.width=width;canvas.height=height;var ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.setTransform(1,0,0,1,-left,-top);var path=new Path2D(d);ctx.lineWidth=1.5;ctx.fill(path);ctx.stroke(path);
      var rgba=ctx.getImageData(0,0,width,height).data,mask=new Uint8Array(width*height);for(var mi=0;mi<mask.length;mi++)mask[mi]=rgba[mi*4+3]>60?1:0;
      var loop=elTrace({m:mask,w:width,h:height,sc:1}).map(function(p){return{x:p.x+left,y:p.y+top};}),contour=null;
      try{
        setObstacles(component,false,[],[]);seedMode=true;
        var pts=elRelax(loop,1800);contour=buildContour(pts,component);
      }finally{activeObstacles=null;seedMode=false;}
      if(!contour||!validContour(contour)){component.forEach(single);continue;}
      contour.members=component.slice();contour.holes=[];contour.cuts=[];contour.necks=[];contour.soft=contour.soft||[];
      swallowedToHoles(contour);state.contours.push(contour);
    }
  }
  /* ---------- elastic core ---------- */
  var elH = 3, maskCanvas = null, activeObstacles = null, stats = { relaxIt: 0, relaxCalls: 0 };
  function setObstacles(insideKeys, carve, forcedOut, ignored){
    var inside = {}; insideKeys.forEach(function(k){ inside[k] = true; });
    var skip = {}; (ignored || []).forEach(function(k){ skip[k] = true; });
    var obs = {};
    for(var slot of activeKeys()){var coordinate=parseKey(slot),i=coordinate.i,j=coordinate.j;
      var k = key(i, j);
      // every other circle is a peg the band bends around; where it overlaps a member the member's disc wins (pinch geometry)
      // (holes are ignored: they are subtracted from the filled shape afterwards, never felt by the band)
      obs[k] = inside[k] ? 'in' : (skip[k] ? '' : 'out');
    }
    activeObstacles = obs; rebuildObstacleIndex();
  }
  var hitCtx = createCanvas().getContext('2d');
  function insideTest(d){ var p = new Path2D(d); return function(x, y){ return hitCtx.isPointInPath(p, x, y, 'nonzero'); }; }
  function keysInsidePath(d){
    var out = [];
    if(!d) return out;
    var f = insideTest(d);
    for(var slot of activeKeys()){var coordinate=parseKey(slot),i=coordinate.i,j=coordinate.j;
      var c = center(i, j);
      if(f(c.x, c.y)) out.push(key(i, j));
    }
    return out;
  }
  function keysInsideMask(mask){
    var out = [];
    for(var slot of activeKeys()){var coordinate=parseKey(slot),i=coordinate.i,j=coordinate.j;
      var c = center(i, j), px = Math.round(c.x * mask.sc), py = Math.round(c.y * mask.sc);
      if(px >= 0 && py >= 0 && px < mask.w && py < mask.h && mask.m[py * mask.w + px]) out.push(key(i, j));
    }
    return out;
  }
  // the circles a shape is made of: chosen by the lasso (never by growth), minus what lasso − took away
  function memberKeys(c){
    if(!c.members){
      var notch = {}; (c.notches || []).forEach(function(k){ notch[k] = true; });
      c.members = uniq(keysInsidePath(contourPath(c)).concat(contourKeys(c))).filter(function(k){ return !notch[k]; });
    }
    return c.members.slice();
  }
  function isNotch(c, k){ return (c.notches || []).indexOf(k) >= 0 || (c.soft || []).indexOf(k) >= 0; }
  function contourKeys(c){
    var ks = {};
    if(c.single) ks[c.single] = true;
    c.tangents.forEach(function(t){ ks[t.a] = true; ks[t.b] = true; });
    return Object.keys(ks);
  }
  var obstacleIndex=null;
  function rebuildObstacleIndex(){
    obstacleIndex=null;if(!editedLayout())return;obstacleIndex={};
    activeKeys().forEach(function(k){if(activeObstacles&&!activeObstacles[k])return;var nd=nodeHit(k),pad=nd.r+S;
      var item={k:k,c:nd.c,r:nd.r,rho:nd.rho,e:nd.e,role:activeObstacles?activeObstacles[k]:'in'};
      for(var y=Math.floor((nd.c.y-pad)/S);y<=Math.floor((nd.c.y+pad)/S);y++)for(var x=Math.floor((nd.c.x-pad)/S);x<=Math.floor((nd.c.x+pad)/S);x++){var cell=x+','+y;(obstacleIndex[cell]||(obstacleIndex[cell]=[])).push(item);}
    });
  }
  function elNear(pt){
    if(obstacleIndex&&activeObstacles)return obstacleIndex[Math.floor(pt.x/S)+','+Math.floor(pt.y/S)]||[];
    var out = [];
    var i0 = Math.round((pt.y - MARGIN) / rowStep());
    for(var i = i0 - 1; i <= i0 + 1; i++){
      if(i < 0 || i >= state.rows) continue;
      var j0 = Math.round((pt.x - MARGIN - (state.offset && i % 2 === 1 ? S / 2 : 0)) / S);
      for(var j = j0 - 1; j <= j0 + 1; j++){
        if(j < 0 || j >= state.cols) continue;
        var k = key(i, j);
        if(!nodeActive(k)||(activeObstacles && !activeObstacles[k])) continue;
        var ndn = nodeGeomFor(k,center(i, j), hitRadius(k));
        out.push({ k: k, c: ndn.c, r: ndn.r, rho: ndn.rho, e: ndn.e, role: activeObstacles ? activeObstacles[k] : 'in' });
      }
    }
    return out;
  }
  function elProject(q, c, r){
    var dx = q.x - c.x, dy = q.y - c.y, d = Math.hypot(dx, dy);
    if(d < 1e-6){ dx = 1; dy = 0; d = 1; }
    q.x = c.x + dx / d * r; q.y = c.y + dy / d * r;
  }
  // nin (optional): the band's local interior normal at q. A member's centre must lie on the interior side and a
  // peg's centre on the exterior side; a point caught on the wrong side of a disc is moved across it instead of
  // being pushed radially, so the band never wraps a peg or cuts through a member.
  function elPushOut(q, nin, deepOnly){
    var cs = elNear(q), n;
    for(n = 0; n < cs.length; n++){
      if(cs[n].role === 'out') continue;
      var nd1 = cs[n], c1 = nd1.c, s1 = sdf(q, nd1);
      if(s1 >= 0) continue;
      if(nin && (!deepOnly || s1 < -0.5 * nd1.r) && (c1.x - q.x) * nin.x + (c1.y - q.y) * nin.y < -0.5){ var sp1 = support(nd1, nin); q.x = c1.x - nin.x * sp1; q.y = c1.y - nin.y * sp1; }
      else projectTo(q, nd1, 0);
    }
    for(n = 0; n < cs.length; n++){
      if(cs[n].role !== 'out') continue;
      var nd2 = cs[n], c2 = nd2.c, s2 = sdf(q, nd2);
      if(s2 >= 0) continue;
      var riding = false;
      for(var m = 0; m < cs.length && !riding; m++){
        if(cs[m].role !== 'out' && sdf(q, cs[m]) <= 0.8) riding = true;
      }
      if(riding) continue;
      if(nin && (!deepOnly || s2 < -0.5 * nd2.r) && (c2.x - q.x) * nin.x + (c2.y - q.y) * nin.y > 0.5){ var sp2 = support(nd2, nin); q.x = c2.x + nin.x * sp2; q.y = c2.y + nin.y * sp2; }
      else projectTo(q, nd2, 0);
    }
    return q;
  }
  function elResample(pts, h){
    var n = pts.length, seg = [], total = 0;
    for(var i = 0; i < n; i++){ var a = pts[i], b = pts[(i + 1) % n]; var L = Math.hypot(b.x - a.x, b.y - a.y); seg.push(L); total += L; }
    if(!(total > 0)) return pts.slice();
    var count = Math.max(12, Math.min(4000, Math.round(total / h))), step = total / count, out = [], i2 = 0, acc = 0;
    for(var m = 0; m < count; m++){
      var target = m * step;
      while(i2 < n - 1 && acc + seg[i2] < target){ acc += seg[i2]; i2++; }
      var a2 = pts[i2], b2 = pts[(i2 + 1) % n], t = seg[i2] > 0 ? (target - acc) / seg[i2] : 0;
      out.push({ x: a2.x + (b2.x - a2.x) * t, y: a2.y + (b2.y - a2.y) * t });
    }
    return out;
  }
  function clearance(q){
    var cs = elNear(q), best = Infinity;
    for(var n = 0; n < cs.length; n++){ var d = sdf(q, cs[n]); if(d < best) best = d; }
    return best;
  }
  function elIterate(pts, beta){
    var n = pts.length, cx = 0, cy = 0;
    if(beta > 0){ for(var i = 0; i < n; i++){ cx += pts[i].x; cy += pts[i].y; } cx /= n; cy /= n; }
    var sigma = elSignedArea(pts) >= 0 ? 1 : -1;
    var next = new Array(n), maxMove = 0;
    for(var i2 = 0; i2 < n; i2++){
      var p = pts[i2], a = pts[(i2 - 1 + n) % n], b = pts[(i2 + 1) % n];
      var q = { x: p.x + 0.5 * ((a.x + b.x) / 2 - p.x), y: p.y + 0.5 * ((a.y + b.y) / 2 - p.y) };
      if(beta > 0 && clearance(q) > S * 0.5){ q.x += beta * (cx - q.x); q.y += beta * (cy - q.y); }
      // a strand dragged deep into a disc is put back on the correct side of it (near the rim: plain radial push)
      var a2 = pts[(i2 - 2 + n) % n], b2 = pts[(i2 + 2) % n], tx = b2.x - a2.x, ty = b2.y - a2.y, tl = Math.hypot(tx, ty);
      elPushOut(q, tl > 1e-6 ? { x: -ty / tl * sigma, y: tx / tl * sigma } : null, true);
      var mv = Math.hypot(q.x - p.x, q.y - p.y); if(mv > maxMove) maxMove = mv;
      next[i2] = q;
    }
    return { pts: next, maxMove: maxMove };
  }
  // one side-aware pass over a seed loop: points caught on the wrong side of a disc are moved across it
  function sidePass(pts){
    var n = pts.length, sigma = elSignedArea(pts) >= 0 ? 1 : -1, out = new Array(n);
    for(var i = 0; i < n; i++){
      var a = pts[(i - 2 + n) % n], b = pts[(i + 2) % n], tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty);
      var nin = tl > 1e-6 ? { x: -ty / tl * sigma, y: tx / tl * sigma } : null;
      out[i] = elPushOut({ x: pts[i].x, y: pts[i].y }, nin);
    }
    return out;
  }
  function elRelaxRun(pts, maxIt){
    var it, lastPer = perimeter(pts), perAt = 0, stalled = false;
    for(it = 0; it < maxIt; it++){
      var r = elIterate(pts, 0); pts = r.pts;
      if(it % 8 === 7){ pts = elResample(pts, elH); pts.forEach(function(q){ elPushOut(q); }); if(pts.length > 2500) break; }
      if(it % 40 === 39){ var per = perimeter(pts); stalled = lastPer - per < 0.25; lastPer = per; }
      // converged, or stalled in a sub-pixel jitter at a junction (the loop is not getting any shorter)
      if(it > 40 && (r.maxMove < 0.012 || (stalled && r.maxMove < 0.6))) break;
    }
    stats.relaxIt += it; stats.relaxCalls++;
    return pts;
  }
  function elRelax(loop, maxIt){
    var pts = sidePass(elResample(loop, elH)); pts.forEach(function(q){ elPushOut(q); });
    pts = elRelaxRun(pts, maxIt || 4000);
    // a real rubber band cannot cross itself: cut off any sub-loop, then let it settleSync again
    for(var pass = 0; pass < 3; pass++){
      var u = untangle(pts);
      if(u === pts) break;
      pts = elResample(u, elH); pts.forEach(function(q){ elPushOut(q); });
      pts = elRelaxRun(pts, 600);
    }
    return pts;
  }
  function segX(a, b, c, d){
    var r1x = b.x - a.x, r1y = b.y - a.y, r2x = d.x - c.x, r2y = d.y - c.y;
    var den = r1x * r2y - r1y * r2x; if(Math.abs(den) < 1e-9) return null;
    var t = ((c.x - a.x) * r2y - (c.y - a.y) * r2x) / den, u = ((c.x - a.x) * r1y - (c.y - a.y) * r1x) / den;
    if(t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
    return { x: a.x + r1x * t, y: a.y + r1y * t };
  }
  function inCenters(){
    var out = [];
    if(!activeObstacles) return out;
    Object.keys(activeObstacles).forEach(function(k){ if(activeObstacles[k] === 'in'){ var pk = parseKey(k); out.push(center(pk.i, pk.j)); } });
    return out;
  }
  // split a self-crossing (or self-touching, < 1.2 px) loop at the crossing and keep the half that holds the circles
  function untangle(pts){
    var n = pts.length, hit = null;
    if(n < 12) return pts;
    for(var i = 0; i < n && !hit; i++){
      var a = pts[i], b = pts[(i + 1) % n];
      var minx = Math.min(a.x, b.x) - 4, maxx = Math.max(a.x, b.x) + 4, miny = Math.min(a.y, b.y) - 4, maxy = Math.max(a.y, b.y) + 4;
      for(var j = i + 2; j < n; j++){
        if(i === 0 && j === n - 1) continue;
        var c = pts[j], d = pts[(j + 1) % n];
        if(c.x < minx && d.x < minx || c.x > maxx && d.x > maxx || c.y < miny && d.y < miny || c.y > maxy && d.y > maxy) continue;
        var p = segX(a, b, c, d);
        if(!p){
          var gap = Math.min(j - i, n - (j - i));
          if(gap >= 8 && Math.hypot(a.x - c.x, a.y - c.y) < 1.2) p = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
        }
        if(p){ hit = { i: i, j: j, p: p }; break; }
      }
    }
    if(!hit) return pts;
    var A = [hit.p], B = [hit.p], q;
    for(q = hit.i + 1; q <= hit.j; q++) A.push(pts[q]);
    for(q = hit.j + 1; q < n; q++) B.push(pts[q]);
    for(q = 0; q <= hit.i; q++) B.push(pts[q]);
    var cs = inCenters(), ca = 0, cb = 0;
    cs.forEach(function(c){ if(elWinding(c, A) !== 0) ca++; if(elWinding(c, B) !== 0) cb++; });
    if(ca !== cb) return ca > cb ? A : B;
    return Math.abs(elSignedArea(A)) >= Math.abs(elSignedArea(B)) ? A : B;
  }
  function perimeter(pts){ var L = 0; for(var i = 0; i < pts.length; i++){ var p = pts[i], q = pts[(i + 1) % pts.length]; L += Math.hypot(q.x - p.x, q.y - p.y); } return L; }
  function elWinding(pt, poly){
    var w = 0, n = poly.length;
    for(var i = 0; i < n; i++){
      var a = poly[i], b = poly[(i + 1) % n];
      if(a.y <= pt.y){ if(b.y > pt.y && (b.x - a.x) * (pt.y - a.y) - (pt.x - a.x) * (b.y - a.y) > 0) w++; }
      else { if(b.y <= pt.y && (b.x - a.x) * (pt.y - a.y) - (pt.x - a.x) * (b.y - a.y) < 0) w--; }
    }
    return w;
  }
  function elSignedArea(poly){ var a = 0; for(var i = 0; i < poly.length; i++){ var p = poly[i], q = poly[(i + 1) % poly.length]; a += p.x * q.y - q.x * p.y; } return a / 2; }
  function elContacts(pts){
    var n = pts.length, marks = new Array(n);
    var prev = null;
    for(var i = 0; i < n; i++){
      var cs = elNear(pts[i]), best = null, bestD = Infinity, same = null;
      for(var m = 0; m < cs.length; m++){
        var d = Math.abs(sdf(pts[i], cs[m]));
        if(d > 0.3) continue;
        if(prev && cs[m].k === prev.k) same = cs[m];
        if(d < bestD){ bestD = d; best = cs[m]; }
      }
      // at the junction of two touching circles, stay on the circle we were already riding
      marks[i] = same || best; prev = marks[i];
    }
    var runs = [];
    for(var i2 = 0; i2 < n; i2++){
      var mk = marks[i2]; if(!mk) continue;
      var last = runs[runs.length - 1];
      if(last && last.k === mk.k && last.end === i2 - 1){ last.end = i2; last.len++; last.idx.push(i2); }
      else runs.push({ k: mk.k, c: mk.c, start: i2, end: i2, len: 1, idx: [i2] });
    }
    if(runs.length > 1){
      var f = runs[0], l = runs[runs.length - 1];
      if(f.k === l.k && f.start === 0 && l.end === n - 1){ l.len += f.len; l.idx = l.idx.concat(f.idx); runs.shift(); }
    }
    // a band bending around a sharp corner touches it at a single point: keep such one-point contacts
    runs = runs.filter(function(r){ return r.len >= 2 || radius(r.k) <= 3 || nodeOf(r.k).rho <= 3; });
    var sigma = elSignedArea(pts) >= 0 ? 1 : -1;
    var contacts = runs.map(function(r){
      var cross = 0;
      r.idx.forEach(function(i3){ var p = pts[i3], q = pts[(i3 + 1) % n]; cross += (p.x - r.c.x) * (q.y - p.y) - (p.y - r.c.y) * (q.x - p.x); });
      var flow;
      if(r.len >= 3){ flow = cross >= 0 ? 'O' : 'A'; }
      else { var w = elWinding(r.c, pts); flow = w > 0 ? 'O' : w < 0 ? 'A' : (sigma > 0 ? 'A' : 'O'); }
      var rr = Math.max(hitRadius(r.k), 1);
      return { k: r.k, flow: flow, len: r.len, turn: Math.abs(cross) / (rr * rr), wrapped: elWinding(r.c, pts) !== 0 };
    });
    contacts = contacts.filter(function(c){ return c.turn >= 0.04 || (c.wrapped && radius(c.k) <= 3); });
    var merged = [];
    contacts.forEach(function(c){
      var last = merged[merged.length - 1];
      if(last && last.k === c.k){
        if(last.flow === c.flow){ last.len += c.len; }
        else if(c.len > last.len){ merged[merged.length - 1] = c; }
      } else merged.push(c);
    });
    if(merged.length > 1 && merged[0].k === merged[merged.length - 1].k && merged[0].flow === merged[merged.length - 1].flow){ merged[merged.length - 1].len += merged[0].len; merged.shift(); }
    return merged;
  }
  function elOverlapping(ka, kb){ return gapNodes(nodeOf(ka), nodeOf(kb)) < -1e-6; }
  function gapBetween(ka, kb){ return gapNodes(nodeOf(ka), nodeOf(kb)); }
  // a carved circle is only reachable if the band (thickness 2*PAD) fits through the gaps on both sides of it
  function squeezed(n, p, q){
    var gp = p === n ? Infinity : gapBetween(n, p), gq = q === n ? Infinity : gapBetween(n, q);
    return (gp > 0 && gp < SQUEEZE) || (gq > 0 && gq < SQUEEZE);
  }
  function chainOf(c){
    if(c.single) return [{ k: c.single, f: 'O' }];
    var ts = c.tangents; if(!ts || !ts.length) return [];
    var chain = [{ k: ts[0].a, f: ts[0].fA }];
    ts.forEach(function(t){ chain.push({ k: t.b, f: t.fB }); });
    if(chain.length > 1 && chain[chain.length - 1].k === chain[0].k) chain.pop();
    return chain;
  }
  function tangentsFromChain(chain){
    var out = [];
    for(var i = 0; i < chain.length; i++){
      var A = chain[i], B = chain[(i + 1) % chain.length];
      if(A.k === B.k) continue;
      out.push({ a: A.k, b: B.k, fA: A.f, fB: B.f });
    }
    return out;
  }
  // release pegs the band could no longer reach (circles grew and closed the dent around them)
  // is the direct tangent P->Q still blocked by peg n? (a peg picked up by growth lets go once it no longer deflects)
  function slack(n, P, Q){
    if(P.f !== Q.f || P.k === Q.k) return false;
    var g = tangentGeom({ a: P.k, b: Q.k, fA: P.f, fB: Q.f }); if(!g) return false;
    var nd = nodeHit(n), vx = g.pB.x - g.pA.x, vy = g.pB.y - g.pA.y, L = Math.hypot(vx, vy), n2 = Math.max(1, Math.ceil(L / 2));
    for(var i = 0; i <= n2; i++){ var t = i / n2; if(sdf({ x: g.pA.x + vx * t, y: g.pA.y + vy * t }, nd) < 1) return false; }
    return true;
  }
  // a carved circle is no dent any more when the outline would have to run almost a full turn around it, or when
  // its two tangents cross each other (the band merely grazes it)
  function pegDegenerate(gi, go, flow){
    if(arcDelta(gi.thB !== undefined ? gi.thB : gi.angB, go.thA !== undefined ? go.thA : go.angA, flow) > TAU - 0.35) return true;
    // at a sharp corner the two tangents meet in one point: that is a bend, not a crossing
    if(Math.hypot(gi.pB.x - go.pA.x, gi.pB.y - go.pA.y) < 0.5) return false;
    return !!segX(gi.pA, gi.pB, go.pA, go.pB);
  }
  function pegArcTooLong(S, P, Q){
    if(P.k === S.k || Q.k === S.k) return false;
    var gi = tangentGeomRobust(P.k, S.k, P.f, S.f), go = tangentGeomRobust(S.k, Q.k, S.f, Q.f);
    if(!gi || !go) return false;
    return pegDegenerate(gi, go, S.f);
  }
  // is circle k (almost) entirely swallowed by the outline the chain would draw without it?
  function centerInsideChain(chain, k){
    var d = contourPath({ tangents: tangentsFromChain(chain), closed: true }); if(!d) return false;
    var pk = parseKey(k), c = center(pk.i, pk.j), r = radius(k) * 0.9, f = insideTest(d), inside = 0;
    for(var a = 0; a < 12; a++){ if(f(c.x + r * Math.cos(a * TAU / 12), c.y + r * Math.sin(a * TAU / 12))) inside++; }
    return inside >= 11;
  }
  // would the outline drawn by the chain without circle k run around k's centre (k swallowed)?
  function centreInChain(chain, k){
    var d = contourPath({ tangents: tangentsFromChain(chain), closed: true }); if(!d) return false;
    var pk = parseKey(k), c = center(pk.i, pk.j);
    return insideTest(d)(c.x, c.y);
  }
  // drop pegs the band would not hold any more: soft pegs that no longer deflect the tangent, and pegs
  // (hard or soft) the band (thickness 2*PAD) can no longer reach because the circles closed in around them
  function prunePegs(c){
    var hard = {}, soft = {};
    (c.notches || []).forEach(function(k){ hard[k] = true; });
    (c.soft || []).forEach(function(k){ soft[k] = true; });
    var chain = chainOf(c), dropped = [];
    if(chain.length < 3) return dropped;
    for(var guard = 0; guard < chain.length + 1; guard++){
      var hit = -1;
      for(var i = 0; i < chain.length; i++){
        var x = chain[i]; if(!hard[x.k] && !soft[x.k]) continue;
        var P = chain[(i - 1 + chain.length) % chain.length], Q = chain[(i + 1) % chain.length];
        // a soft peg lets go only when the direct tangent clears it AND leaves it outside (a small circle sitting
        // right on the direct tangent's path is still in the way: dropping it would swallow it)
        if(soft[x.k] && slack(x.k, P, Q)){ var rest = chain.slice(0, i).concat(chain.slice(i + 1)); if(!centreInChain(rest, x.k)){ hit = i; break; } }
        if(pegArcTooLong(x, P, Q)){ hit = i; break; }
      }
      if(hit < 0) break;
      dropped.push(chain[hit].k); chain.splice(hit, 1);
      if(chain.length < 2) break;
    }
    if(dropped.length){
      c.tangents = tangentsFromChain(chain); delete c.single;
      if(chain.length === 1) c.single = chain[0].k;
      c.notches = (c.notches || []).filter(function(k){ return dropped.indexOf(k) < 0; });
      c.soft = (c.soft || []).filter(function(k){ return dropped.indexOf(k) < 0; });
    }
    return dropped;
  }
  function elContourFromContacts(contacts){
    var changed = true;
    while(changed && contacts.length > 1){
      changed = false;
      for(var ci = 0; ci < contacts.length; ci++){
        var A0 = contacts[ci], B0 = contacts[(ci + 1) % contacts.length];
        if(A0.k === B0.k || A0.flow === B0.flow || !elOverlapping(A0.k, B0.k)) continue;
        if(A0.wrapped && !B0.wrapped){ A0.pinch = 'exit'; continue; }
        if(!A0.wrapped && B0.wrapped){ A0.pinch = 'entry'; continue; }
        if(A0.wrapped && B0.wrapped && (A0.len || 0) >= 3 && (B0.len || 0) >= 3) continue;
        contacts.splice((A0.len || 0) <= (B0.len || 0) ? ci : (ci + 1) % contacts.length, 1);
        changed = true; break;
      }
    }
    if(!contacts.length) return null;
    var nO = 0, nA = 0;
    contacts.forEach(function(c){ if(c.wrapped){ if(c.flow === 'O') nO++; else nA++; } });
    var wrapFlow = nO >= nA ? 'O' : 'A';
    var notches = contacts.filter(function(c){ return !c.wrapped || c.flow !== wrapFlow; }).map(function(c){ return c.k; });
    if(contacts.length === 1) return contacts[0].wrapped ? { id: state.nextId++, tangents: [], closed: true, single: contacts[0].k, notches: [], holes: [] } : null;
    var tangents = [];
    for(var i = 0; i < contacts.length; i++){
      var A = contacts[i], B = contacts[(i + 1) % contacts.length];
      if(A.k === B.k) continue;
      var t = { a: A.k, b: B.k, fA: A.flow, fB: B.flow };
      if(A.pinch) t.pinch = A.pinch;
      if(!tangentGeomRobust(A.k, B.k, A.flow, B.flow, t.pinch)) return null;
      tangents.push(t);
    }
    if(tangents.length < 2) return null;
    return { id: state.nextId++, tangents: tangents, closed: true, notches: uniq(notches), holes: [] };
  }
  // member circles the taut band slipped past (tiny ones, mostly): hook them into the chain
  function insertExposed(contacts, members){
    if(!contacts.length || !members || !members.length) return contacts;
    var have = {}, wrapFlow = null; contacts.forEach(function(c){ have[c.k] = true; if(c.wrapped && !wrapFlow) wrapFlow = c.flow; });
    var todo = members.filter(function(k){ return !have[k]; });
    if(!todo.length) return contacts;
    if(!wrapFlow) wrapFlow = contacts[0].flow;
    for(var guard = 0; guard < todo.length + 2 && todo.length; guard++){
      var probe = elContourFromContacts(contacts.map(function(c){ return Object.assign({}, c); }));
      if(!probe) return contacts;
      var d = contourPath(probe); if(!d) return contacts;
      var inside = insideTest(d), n = contacts.length, inserted = false;
      for(var m = 0; m < todo.length; m++){
        var k = todo[m], pk = parseKey(k), c = center(pk.i, pk.j);
        if(inside(c.x, c.y)){ todo.splice(m, 1); m--; continue; }
        if(n === 1){
          contacts.push({ k: k, flow: wrapFlow, len: 2, turn: 1, wrapped: true });
          todo.splice(m, 1); inserted = true; break;
        }
        var best = -1, bestD = Infinity;
        for(var i = 0; i < n; i++){
          var A = contacts[i], B = contacts[(i + 1) % n];
          if(A.k === B.k) continue;
          var g = tangentGeomRobust(A.k, B.k, A.flow, B.flow, A.pinch); if(!g) continue;
          var vx = g.pB.x - g.pA.x, vy = g.pB.y - g.pA.y, L2 = vx * vx + vy * vy;
          var t = L2 > 1e-9 ? ((c.x - g.pA.x) * vx + (c.y - g.pA.y) * vy) / L2 : 0.5;
          t = Math.max(0, Math.min(1, t));
          var dd = Math.hypot(c.x - (g.pA.x + vx * t), c.y - (g.pA.y + vy * t)) - radius(k);
          if(dd < bestD){ bestD = dd; best = i; }
        }
        if(best < 0) continue;
        contacts.splice(best + 1, 0, { k: k, flow: wrapFlow, len: 2, turn: 1, wrapped: true });
        todo.splice(m, 1); inserted = true; break;
      }
      if(!inserted) break;
    }
    return contacts;
  }
  function selfIntersects(pts){
    var n = pts.length;
    for(var i = 0; i < n; i++){
      var a = pts[i], b = pts[(i + 1) % n];
      var minx = Math.min(a.x, b.x), maxx = Math.max(a.x, b.x), miny = Math.min(a.y, b.y), maxy = Math.max(a.y, b.y);
      for(var j = i + 2; j < n; j++){
        if(i === 0 && j === n - 1) continue;
        var c = pts[j], d = pts[(j + 1) % n];
        if(c.x < minx && d.x < minx || c.x > maxx && d.x > maxx || c.y < miny && d.y < miny || c.y > maxy && d.y > maxy) continue;
        if(segX(a, b, c, d)) return true;
      }
    }
    return false;
  }
  // a clean outline: it exists, does not cross itself, and runs through no circle it does not wrap
  function validContour(c){
    var sg = contourSegments(c); if(!sg) return false;
    var pts = sampleContour(c, 4); if(pts.length < 3 || selfIntersects(pts)) return false;
    var chain = chainOf(c), cO = 0; chain.forEach(function(x){ if(x.f === 'O') cO++; });
    var major = cO * 2 >= chain.length ? 'O' : 'A', wrapped = {};
    chain.forEach(function(x){ if(x.f === major) wrapped[x.k] = true; });
    for(var slot of activeKeys()){var coordinate=parseKey(slot),i=coordinate.i,j=coordinate.j;
      var k = key(i, j); if(wrapped[k]) continue;
      var ct = center(i, j), r = trueRadius(k) - 1; if(r <= 0) continue;
      for(var q = 0; q < pts.length; q++){ if(Math.hypot(pts[q].x - ct.x, pts[q].y - ct.y) < r) return false; }
    }
    return true;
  }
  // a carved circle visited twice in a row around one wrapped circle (X > M > X) is a hairpin the band folded around
  // that circle: it draws a crossed, ghost-like outline. Keep whichever single visit gives a clean outline.
  function untwist(c){
    if(!c || c.single || !c.tangents) return c;
    for(var guard = 0; guard < 8; guard++){
      var chain = chainOf(c), n = chain.length, fixed = false;
      if(n < 4) return c;
      for(var i = 0; i < n && !fixed; i++){
        var a = chain[i], m = chain[(i + 1) % n], b = chain[(i + 2) % n];
        if(a.k !== b.k || a.f !== b.f || m.k === a.k) continue;
        var cands = [i, (i + 2) % n];
        for(var q = 0; q < cands.length; q++){
          var ch2 = chain.filter(function(x, idx){ return idx !== cands[q]; });
          var test = { tangents: tangentsFromChain(ch2), closed: true, necks: c.necks };
          if(validContour(test)){ c.tangents = test.tangents; fixed = true; break; }
        }
        if(!fixed){ var ch3 = chain.filter(function(x, idx){ return idx !== i; }); c.tangents = tangentsFromChain(ch3); fixed = true; }
      }
      if(!fixed) return c;
    }
    return c;
  }
  function buildContour(pts, members){
    var contacts = elContacts(pts);
    // the band may only wrap the circles that were selected: a wrapped circle that is not one of them is dropped
    // from the chain (if the band closed around it, it then becomes a hole rather than a lobe)
    if(members && members.length){
      var isM = {}; members.forEach(function(k){ isM[k] = true; });
      var kept = contacts.filter(function(c){ return !(c.wrapped && !isM[c.k]); });
      if(kept.length) contacts = kept;
    }
    var withExposed = insertExposed(contacts.map(function(c){ return Object.assign({}, c); }), members);
    return untwist(elContourFromContacts(withExposed) || elContourFromContacts(contacts));
  }
  var maskCache = {}, maskCacheN = 0;
  function elMask(d, grow){
    var size = canvasSize(), sc = 1, w = Math.ceil(size.W * sc), h = Math.ceil(size.H * sc);
    var ck = w + 'x' + h + '|' + (grow || 0) + '|' + d, hit = maskCache[ck];
    if(hit) return hit;
    if(!maskCanvas) maskCanvas = createCanvas();
    maskCanvas.width = w; maskCanvas.height = h;
    var ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(sc, 0, 0, sc, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineWidth = grow ? 2 * grow : 1.5; ctx.lineJoin = 'round';
    if(d){ var p = new Path2D(d); ctx.fill(p, 'nonzero'); ctx.stroke(p); }
    var img = ctx.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h);
    for(var i = 0; i < w * h; i++){ m[i] = img[i * 4 + 3] > 60 ? 1 : 0; }
    var res = { m: m, w: w, h: h, sc: sc };
    if(maskCacheN > 24){ maskCache = {}; maskCacheN = 0; }
    maskCache[ck] = res; maskCacheN++;
    return res;
  }
  // two closed contours overlap if a boundary point of one lies inside the other, or they wrap a common circle
  function contoursOverlap(a, b){
    var da = contourPath(a), db = contourPath(b); if(!da || !db) return false;
    var ma = memberKeys(a), mb = memberKeys(b);
    for(var q = 0; q < ma.length; q++){ if(mb.indexOf(ma[q]) >= 0) return true; }
    // a boundary point of one must lie clearly inside the other (a tangent merely grazing the other outline,
    // e.g. two circles lassoed diagonally next to a shape, is not an overlap)
    var MARGIN = 2.5;
    var inB = insideTest(db), pa = sampleContour(a, 3), pb = sampleContour(b, 3);
    function deepInside(p, test, other){
      if(!test(p.x, p.y)) return false;
      for(var q = 0; q < other.length; q++){ if(Math.hypot(other[q].x - p.x, other[q].y - p.y) < MARGIN) return false; }
      return true;
    }
    for(var i = 0; i < pa.length; i++){ if(deepInside(pa[i], inB, pb)) return true; }
    var inA = insideTest(da);
    for(var j = 0; j < pb.length; j++){ if(deepInside(pb[j], inA, pa)) return true; }
    // circles merely touching (a circle capped at its neighbour sits TOUCH px away) and outlines running close
    // to each other (both hugging the same peg) are NOT overlaps: shapes only join through the lasso
    return false;
  }
  // does the hand-drawn lasso loop run over an existing shape? (then the new shape joins it, even if the tightened
  // outline itself would not reach into the neighbour)
  function loopTouchesContour(loop, c){
    var pts = sampleContour(c, 4), DEPTH = 4;
    for(var i = 0; i < pts.length; i++){
      var p = pts[i];
      if(elWinding(p, loop) === 0) continue;
      var near = false;
      for(var q = 0; q < loop.length && !near; q++){ if(Math.hypot(loop[q].x - p.x, loop[q].y - p.y) < DEPTH) near = true; }
      if(!near) return true;   // an outline point clearly inside the drawn loop, not just brushed by it
    }
    return false;
  }
  function elTrace(mask){
    var m = mask.m, w = mask.w, h = mask.h, sx = -1, sy = -1;
    for(var y = 0; y < h && sy < 0; y++){ for(var x = 0; x < w; x++){ if(m[y * w + x]){ sx = x; sy = y; break; } } }
    if(sy < 0) return [];
    var nb = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
    function fg(x, y){ return x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1; }
    var pts = [], cx = sx, cy = sy, bx = sx - 1, by = sy, guard = w * h * 4;
    while(guard-- > 0){
      pts.push({ x: (cx + 0.5) / mask.sc, y: (cy + 0.5) / mask.sc });
      var kb = 0;
      for(var q = 0; q < 8; q++){ if(cx + nb[q][0] === bx && cy + nb[q][1] === by){ kb = q; break; } }
      var moved = false;
      for(var i = 1; i <= 8; i++){
        var k = (kb + i) % 8, nx = cx + nb[k][0], ny = cy + nb[k][1];
        if(fg(nx, ny)){ var pk = (k + 7) % 8; bx = cx + nb[pk][0]; by = cy + nb[pk][1]; cx = nx; cy = ny; moved = true; break; }
      }
      if(!moved) break;
      if(cx === sx && cy === sy && pts.length > 2) break;
    }
    return pts;
  }
  // analytic sampling of a contour (lines + arcs), far cheaper than SVG getPointAtLength
  function sampleContour(c, h){
    var sg = contourSegments(c); if(!sg) return [];
    var pts = [], cur = sg.start;
    sg.segs.forEach(function(g){
      if(g.t === 'L'){
        var L = Math.hypot(g.to.x - cur.x, g.to.y - cur.y), n = Math.max(1, Math.ceil(L / h));
        for(var i = 0; i < n; i++){ var t = i / n; pts.push({ x: cur.x + (g.to.x - cur.x) * t, y: cur.y + (g.to.y - cur.y) * t }); }
      } else {
        var delta = g.full ? TAU : (g.flow === 'O' ? ((g.aOut - g.aIn) % TAU + TAU) % TAU : ((g.aIn - g.aOut) % TAU + TAU) % TAU);
        var sgn = g.flow === 'O' ? 1 : -1, n2 = Math.max(1, Math.ceil(g.r * delta / h));
        for(var i2 = 0; i2 < n2; i2++){ var a = g.aIn + sgn * delta * i2 / n2; pts.push({ x: g.c.x + g.r * Math.cos(a), y: g.c.y + g.r * Math.sin(a) }); }
      }
      cur = g.to;
    });
    return pts.length >= 3 ? elResample(pts, h) : pts;
  }
  function uniq(arr){ var o = {}; arr.forEach(function(k){ o[k] = true; }); return Object.keys(o); }
  function retension(c, extraOut, prepared){
    if(!c || !c.closed) return false;
    var members0 = memberKeys(c);
    if(extraOut && extraOut.length){ c.members = members0.filter(function(k){ return extraOut.indexOf(k) < 0; }); members0 = c.members.slice(); }
    if(!prepared) prunePegs(c);
    var d = contourPath(c); if(!d) return false;
    seedMode = true; var loop = prepared || sampleContour(c, elH); seedMode = false;
    if(loop.length < 3) return false;
    // holes and the circles of inner cuts are subtracted afterwards: the outer band never feels them
    var holes = (c.holes || []).concat(cutMemberKeys(c));
    // holes are subtracted afterwards, they never steer the band (a hole crossed by a tangent must not flip the outline)
    var hard = uniq((c.notches || []).concat(extraOut || [])).filter(function(k){ return holes.indexOf(k) < 0; });
    var forced = uniq(hard.concat(c.soft || [])).filter(function(k){ return holes.indexOf(k) < 0; });
    var members = members0.filter(function(k){ return forced.indexOf(k) < 0; });
    if(!members.length) return false;
    setObstacles(members, false, forced, holes);
    var pts = elRelax(loop, 1500);
    var nc = buildContour(pts, members);
    activeObstacles = null;
    if(!nc) return false;
    c.tangents = nc.tangents; delete c.single; if(nc.single) c.single = nc.single;
    c.notches = hard;
    c.soft = (nc.notches || []).filter(function(k){ return hard.indexOf(k) < 0; });
    reconcileMembers(c);
    pruneHoles(c); if(!c.cut) swallowedToHoles(c);
    if(!c.cut) retensionCuts(c);
    return true;
  }
  // a hole survives while its centre sits inside the shape (it may cross the outline: it is clipped there)
  function pruneHoles(c){
    var cutKeys = (c.cuts || []).reduce(function(acc, cc){ return acc.concat(memberKeys(cc)); }, []);
    if(!c.holes || !c.holes.length){
      c.holes = [];
      c.notches = (c.notches || []).filter(function(k){ return cutKeys.indexOf(k) < 0; });
      c.soft = (c.soft || []).filter(function(k){ return cutKeys.indexOf(k) < 0; });
      return;
    }
    var d = contourPath(c), ck = contourKeys(c), mk = memberKeys(c);
    if(!d){ c.holes = []; return; }
    var inside = insideTest(d);
    c.holes = c.holes.filter(function(k){
      if(ck.indexOf(k) >= 0 || mk.indexOf(k) >= 0 || cutKeys.indexOf(k) >= 0) return false;
      var pk = parseKey(k), ct = center(pk.i, pk.j);
      return inside(ct.x, ct.y);
    });
    c.notches = (c.notches || []).filter(function(k){ return c.holes.indexOf(k) < 0 && cutKeys.indexOf(k) < 0; });
    c.soft = (c.soft || []).filter(function(k){ return c.holes.indexOf(k) < 0 && cutKeys.indexOf(k) < 0; });
  }
  // a circle that was never selected must not end up inside a shape: when the outline closes over one (a channel
  // pinched shut by a growing neighbour, say), it turns into a hole instead of being swallowed
  function swallowedToHoles(c){
    if(c.cut) return;
    var d = contourPath(c); if(!d) return;
    var inside = insideTest(d), mk = memberKeys(c), ck = contourKeys(c), holes = c.holes || [], added = [];
    var cutKeys = (c.cuts || []).reduce(function(acc, cc){ return acc.concat(memberKeys(cc)); }, []);
    for(var slot of activeKeys()){var coordinate=parseKey(slot),i=coordinate.i,j=coordinate.j;
      var k = key(i, j);
      if(mk.indexOf(k) >= 0 || ck.indexOf(k) >= 0 || holes.indexOf(k) >= 0 || cutKeys.indexOf(k) >= 0 || trueRadius(k) < 0.5) continue;
      var ct = center(i, j);
      if(inside(ct.x, ct.y)) added.push(k);
    }
    if(!added.length) return;
    c.holes = holes.concat(added);
    c.notches = (c.notches || []).filter(function(k){ return added.indexOf(k) < 0; });
    c.soft = (c.soft || []).filter(function(k){ return added.indexOf(k) < 0; });
  }
  // a lasso − cut is an inner contour: it tightens around its own circles and bends around the shape's circles
  function retensionCuts(c){
    if(!c.cuts || !c.cuts.length) return;
    var d = contourPath(c); if(!d){ c.cuts = []; return; }
    var inside = insideTest(d);
    c.cuts = c.cuts.filter(function(cc){
      cc.cut = true;
      if(!retension(cc)) return false;
      // keep a cut while one of its circles still sits inside the shape
      return memberKeys(cc).some(function(k){ var pk = parseKey(k), ct = center(pk.i, pk.j); return inside(ct.x, ct.y); });
    });
  }
  // a member the outline no longer wraps nor encloses is not part of the shape any more (keeps the member list in
  // step with what is drawn, so a later re-tension cannot bring it back as an unexpected lobe)
  function reconcileMembers(c){
    if(!c.members || !c.members.length) return;
    var d = contourPath(c); if(!d) return;
    var inside = insideTest(d), ck = contourKeys(c);
    var kept = c.members.filter(function(k){ if(ck.indexOf(k) >= 0) return true; var pk = parseKey(k), ct = center(pk.i, pk.j); return inside(ct.x, ct.y); });
    if(kept.length) c.members = kept;
  }
  function cutMemberKeys(c){ return (c.cuts || []).reduce(function(acc, cc){ return acc.concat(memberKeys(cc)); }, []); }
  // Once a negative region reaches the exterior it is a notch in the same band,
  // not a clipped second band. Boolean clipping alone leaves sharp intersections.
  function openCutPieces(c){
    if(!hasHoles(c)) return null;
    var outline = contourPath(c); if(!outline) return null;
    var inside = insideTest(outline), outerPts = sampleContour(c, 3);
    var parts = (c.cuts || []).map(function(cc){ return { contour: cc }; });
    (c.holes || []).forEach(function(k){ parts.push({ hole: k, contour: { single: k, tangents: [], closed: true, members: [k] } }); });
    parts.forEach(function(part){
      part.path = contourPath(part.contour);
      part.inside = insideTest(part.path);
      var pts = sampleContour(part.contour, 2);
      part.open = pts.some(function(p){ return !inside(p.x, p.y); }) &&
        (pts.some(function(p){ return inside(p.x, p.y); }) || outerPts.some(function(p){ return part.inside(p.x, p.y); }));
    });
    if(!parts.some(function(p){ return p.open; })) return null;
    // Include enclosed cuts connected to the opening, even when only their edges
    // overlap. Otherwise the remnant of that cut would intersect the new band.
    var grew = true;
    while(grew){
      grew = false;
      parts.forEach(function(p){
        if(p.open) return;
        if(parts.some(function(q){ return q.open && contoursOverlap(p.contour, q.contour); })){ p.open = true; grew = true; }
      });
    }
    var opened = parts.filter(function(p){ return p.open; }), kept = parts.filter(function(p){ return !p.open; });
    var removed = uniq(opened.reduce(function(ks, p){ return ks.concat(memberKeys(p.contour)); }, []));
    var ignored = uniq(kept.reduce(function(ks, p){ return ks.concat(memberKeys(p.contour)); }, []));
    var members = memberKeys(c).filter(function(k){ return removed.indexOf(k) < 0 && ignored.indexOf(k) < 0; });
    if(!members.length) return [];
    var mask = elMask(outline), diff = { m: new Uint8Array(mask.m), w: mask.w, h: mask.h, sc: mask.sc };
    opened.forEach(function(p){ var cut = elMask(p.path); for(var i = 0; i < diff.m.length; i++){ if(cut.m[i]) diff.m[i] = 0; } });
    var components = maskComponents(diff, 1), pieces = [], failed = false;
    var hard = uniq((c.notches || []).concat(removed));
    components.forEach(function(comp){
      var own = members.filter(function(k){ var pk = parseKey(k), ct = center(pk.i, pk.j), x = Math.round(ct.x * comp.sc), y = Math.round(ct.y * comp.sc); return x >= 0 && y >= 0 && x < comp.w && y < comp.h && !!comp.m[y * comp.w + x]; });
      if(!own.length) return;
      var seed = elTrace(comp), nc;
      try{
        setObstacles(own, false, hard, ignored);
        nc = seed.length >= 3 ? buildContour(elRelax(seed, 2500), own) : null;
      } finally { activeObstacles = null; }
      if(!nc || !validContour(nc)){ failed = true; return; }
      var soft = nc.notches || [];
      nc.members = own; nc.notches = hard.slice(); nc.soft = soft.filter(function(k){ return hard.indexOf(k) < 0; });
      nc.necks = uniq((c.necks || []).concat(opened.reduce(function(ks, p){ return ks.concat(p.contour.necks || []); }, [])));
      nc.solo = (c.solo || []).filter(function(k){ return own.indexOf(k) >= 0; });
      var inPiece = insideTest(contourPath(nc));
      nc.holes = kept.filter(function(p){ return p.hole; }).map(function(p){ return p.hole; });
      nc.cuts = kept.filter(function(p){ return !p.hole && memberKeys(p.contour).some(function(k){ var pk = parseKey(k), ct = center(pk.i, pk.j); return inPiece(ct.x, ct.y); }); }).map(function(p){ return JSON.parse(JSON.stringify(p.contour)); });
      reconcileMembers(nc); pruneHoles(nc); swallowedToHoles(nc);
      pieces.push(nc);
    });
    // An incomplete reconstruction must never silently drop a surviving island.
    if(failed) return null;
    if(pieces.length) pieces[0].id = c.id;
    return pieces;
  }
  function resolveOpenCuts(){
    var changed = [], limit = state.contours.reduce(function(n, c){ return n + (c.cuts || []).length + (c.holes || []).length; }, 0) + 1;
    for(var pass = 0; pass < limit; pass++){
      var again = false, out = [];
      state.contours.forEach(function(c){
        var pieces = openCutPieces(c);
        if(pieces === null){ out.push(c); return; }
        again = true; changed.push(c.id);
        pieces.forEach(function(p){ changed.push(p.id); out.push(p); });
      });
      state.contours = out;
      if(!again) break;
    }
    return uniq(changed);
  }
  function retensionAll(){ state.contours.forEach(function(c){ retension(c); }); }
  // does circle k (at its current radius) matter to contour c?
  function circleTouches(c, k){
    if(contourKeys(c).indexOf(k) >= 0 || isNotch(c, k) || (c.holes || []).indexOf(k) >= 0) return true;
    if((c.cuts || []).some(function(cc){ return contourKeys(cc).indexOf(k) >= 0 || isNotch(cc, k) || memberKeys(cc).indexOf(k) >= 0; })) return true;
    var d = contourPath(c); if(!d) return false;
    var pk = parseKey(k), ct = center(pk.i, pk.j), nd = nodeHit(k);
    if(insideTest(d)(ct.x, ct.y)) return true;
    var pts = sampleContour(c, 4);
    for(var i = 0; i < pts.length; i++){ if(sdf(pts[i], nd) <= 2) return true; }
    return false;
  }
  function mergeOverlaps(onlyIds, joinIds){
    var closed = state.contours.filter(function(c){ return c.closed; });
    if(closed.length < 2) return 0;
    var parent = {}; closed.forEach(function(c){ parent[c.id] = c.id; });
    function find(x){ while(parent[x] !== x){ parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    for(var i = 0; i < closed.length; i++){ for(var j = i + 1; j < closed.length; j++){
      var a = closed[i], b = closed[j];
      if(onlyIds && onlyIds.indexOf(a.id) < 0 && onlyIds.indexOf(b.id) < 0) continue;
      var joined = joinIds && joinIds.indexOf(a.id) >= 0 && joinIds.indexOf(b.id) >= 0;
      if(joined || contoursOverlap(a, b)) parent[find(a.id)] = find(b.id);
    } }
    var groups = {}; closed.forEach(function(c){ var r = find(c.id); (groups[r] = groups[r] || []).push(c); });
    var replaced = [];
    Object.keys(groups).forEach(function(g){
      var members = groups[g]; if(members.length < 2) return;
      var union = null;
      members.forEach(function(c){ var mk = elMask(contourPath(c)); if(!union) union = { m: new Uint8Array(mk.m), w: mk.w, h: mk.h, sc: mk.sc }; else { for(var q = 0; q < mk.m.length; q++){ if(mk.m[q]) union.m[q] = 1; } } });
      var loop = elTrace(union);
      if(loop.length < 12) return;
      var inKeys = [], notches = [], holes = [];
      members.forEach(function(c){ inKeys = inKeys.concat(memberKeys(c)); });
      inKeys = uniq(inKeys);
      members.forEach(function(c){
        (c.notches || []).concat(c.soft || []).forEach(function(k){ if(inKeys.indexOf(k) < 0 && notches.indexOf(k) < 0) notches.push(k); });
        holes = holes.concat(c.holes || []);
      });
      holes = uniq(holes).filter(function(k){ return inKeys.indexOf(k) < 0; });
      notches = notches.filter(function(k){ return holes.indexOf(k) < 0; });
      var ignoredM = holes.concat(members.reduce(function(acc, c){ return acc.concat(cutMemberKeys(c)); }, [])).filter(function(k){ return inKeys.indexOf(k) < 0; });
      setObstacles(inKeys, false, notches, ignoredM);
      var pts = elRelax(loop, 2500);
      var contour = buildContour(pts, inKeys);
      activeObstacles = null;
      if(!contour) return;
      contour.members = inKeys;
      contour.necks = uniq(members.reduce(function(acc, c){ return acc.concat(c.necks || []); }, []));
      contour.solo = uniq(members.reduce(function(acc, c){ return acc.concat(c.single ? [c.single] : []).concat(c.solo || []); }, []));
      contour.notches = uniq(notches.concat(contour.notches || []));
      contour.soft = [];
      contour.holes = holes;
      contour.cuts = members.reduce(function(acc, c){ return acc.concat(c.cuts || []); }, []);
      reconcileMembers(contour); pruneHoles(contour); swallowedToHoles(contour); retensionCuts(contour);
      replaced.push({ members: members, contour: contour });
    });
    if(!replaced.length) return 0;
    replaced.forEach(function(r){
      var firstIdx = state.contours.indexOf(r.members[0]);
      state.contours = state.contours.filter(function(c){ return r.members.indexOf(c) < 0; });
      state.contours.splice(Math.min(firstIdx, state.contours.length), 0, r.contour);
    });
    state.selected = null;
    return replaced.length;
  }
  // newId: a freshly added contour (only its overlaps are checked); keys: circles that changed (only contours they touch are re-tensioned)
  function settleSync(newId, keys, joinIds){
    var opened = resolveOpenCuts();
    var targets = state.contours;
    if(keys && keys.length){ targets = state.contours.filter(function(c){ return keys.some(function(k){ return circleTouches(c, k); }); }); }
    targets.forEach(function(c){ retension(c); });
    opened = opened.concat(resolveOpenCuts());
    var ids = newId ? [newId] : (keys && keys.length ? targets.map(function(c){ return c.id; }) : null);
    if(ids) ids = uniq(ids.concat(opened)).map(Number);
    if(ids && !ids.length) return 0;
    var merged = mergeOverlaps(ids, joinIds);
    resolveOpenCuts();
    return merged;
  }

  /* ---------- lasso + ---------- */
  function prepareLoop(pts){
    var insideMap = {};
    for(var slot of activeKeys()){var coordinate=parseKey(slot),i=coordinate.i,j=coordinate.j; var k = key(i, j); insideMap[k] = elWinding(center(i, j), pts) !== 0; }
    setObstacles(Object.keys(insideMap).filter(function(k){ return insideMap[k]; }), true);
    var n = pts.length, orig = pts.map(function(p){ return { x: p.x, y: p.y }; });
    var out = pts.map(function(p){ return { x: p.x, y: p.y }; });
    for(var q = 0; q < n; q++){
      var a = orig[(q - 3 + n) % n], b = orig[(q + 3) % n];
      var tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      var nx = -ty, ny = tx;
      if(elWinding({ x: orig[q].x + 4 * nx, y: orig[q].y + 4 * ny }, orig) === 0){ nx = ty; ny = -tx; }
      for(var pass = 0; pass < 3; pass++){
        var pt = out[q], cs = elNear(pt), hit = null;
        for(var m = 0; m < cs.length; m++){ if(sdf(pt, cs[m]) < -1e-6){ hit = cs[m]; break; } }
        if(!hit) break;
        var dirx = insideMap[hit.k] ? -nx : nx, diry = insideMap[hit.k] ? -ny : ny, spd = support(hit, { x: dirx, y: diry }) + 0.6;
        out[q] = { x: hit.c.x + spd * dirx, y: hit.c.y + spd * diry };
      }
    }
    return elResample(out, elH);
  }
  var relaxQueue = [];
  function startRelaxSync(points, sub, noMirror){
    if(!noMirror){ var extra = mirrorLoops(points); if(sub){ subtractLoop(points); extra.forEach(function(l){ subtractLoop(l, true); }); return; } relaxQueue = extra; }
    else if(sub){ subtractLoop(points); return; }
    var pts = elResample(points, elH);
    pts = prepareLoop(pts);
    pts = sidePass(pts); pts.forEach(function(q){ elPushOut(q); });
    var members = Object.keys(activeObstacles || {}).filter(function(k){ return activeObstacles[k] === 'in'; });
    pts = untangle(pts);
    relax = { pts: pts, loop: elResample(points, 4), iter: 0, phase: 1, sub: false, members: members, lastPer: perimeter(pts), stalled: false, cuts: 0 };
    requestAnimationFrame(relaxStep);
  }
  function relaxBatch(count){
    for(var k = 0; k < count; k++){
      var beta = relax.phase === 1 ? 0.03 : 0;
      var r = elIterate(relax.pts, beta);
      relax.pts = r.pts; relax.iter++;
      if(relax.iter % 8 === 0){ relax.pts = elResample(relax.pts, elH); relax.pts.forEach(function(q){ elPushOut(q); }); }
      if(relax.iter % 40 === 0){ var per = perimeter(relax.pts); relax.stalled = relax.lastPer - per < 0.25; relax.lastPer = per; }
      if(relax.phase === 1 && (r.maxMove < 0.25 || relax.iter > 900)){ relax.phase = 2; relax.stalled = false; }
      else if(relax.phase === 2 && (r.maxMove < 0.015 || relax.iter > 3000 || (relax.stalled && r.maxMove < 0.6))){
        var u = untangle(relax.pts);
        if(u !== relax.pts && relax.cuts < 3){ relax.pts = elResample(u, elH); relax.pts.forEach(function(q){ elPushOut(q); }); relax.cuts++; relax.stalled = false; relax.lastPer = perimeter(relax.pts); relax.iter = Math.min(relax.iter, 2000); continue; }
        finishRelax(); return true;
      }
      if(perimeter(relax.pts) < S * 0.6){ relax = null; activeObstacles = null; setStatus('the loop collapsed — enclose at least one circle.'); render(); nextQueued(); return true; }
    }
    return false;
  }
  function relaxStep(){ if(!relax) return; if(!relaxBatch(30)){ render(); requestAnimationFrame(relaxStep); } }
  function nextQueued(){ if(relaxQueue.length){ var l = relaxQueue.shift(); startRelaxSync(l, false, true); return true; } return false; }
  function finishRelax(){
    var contacts = elContacts(relax.pts), members = relax.members, loop = relax.loop;
    var contour = contacts.length ? buildContour(relax.pts, members) : null;
    relax = null; activeObstacles = null;
    if(!contacts.length){ setStatus('the loop touches no circle.'); render(); nextQueued(); return; }
    if(!contour){ setStatus('loop too tight — draw a wider one.'); render(); nextQueued(); return; }
    commit();
    contour.members = members.slice(); contour.soft = []; contour.holes = []; reconcileMembers(contour); swallowedToHoles(contour);
    // shapes the drawn loop ran over join the new one (the lasso is the only way to join shapes)
    var joinIds = state.contours.filter(function(c){ return c.closed && loopTouchesContour(loop, c); }).map(function(c){ return c.id; });
    if(joinIds.length) joinIds.push(contour.id);
    state.contours.push(contour);
    state.selected = null;
    var merged = settleSync(contour.id, null, joinIds);
    var n = contourKeys(contour).length;
    setStatus(merged ? 'shape merged with ' + (merged === 1 ? 'a neighbouring shape.' : merged + ' neighbouring shapes.') : 'shape added — ' + n + ' circle' + (n > 1 ? 's' : '') + ' on the outline.');
    render();
    nextQueued();
  }

  /* ---------- lasso − ---------- */
  // connected components of a mask (4-connectivity); returns [{m, w, h, sc, count}]
  function maskComponents(mask, minCount){
    var w = mask.w, h = mask.h, m = mask.m, seen = new Uint8Array(w * h), out = [], stack = [];
    for(var s0 = 0; s0 < w * h; s0++){
      if(!m[s0] || seen[s0]) continue;
      var comp = new Uint8Array(w * h), count = 0; stack.length = 0; stack.push(s0); seen[s0] = 1;
      while(stack.length){
        var p = stack.pop(); comp[p] = 1; count++;
        var x = p % w, y = (p - x) / w;
        if(x > 0 && m[p - 1] && !seen[p - 1]){ seen[p - 1] = 1; stack.push(p - 1); }
        if(x < w - 1 && m[p + 1] && !seen[p + 1]){ seen[p + 1] = 1; stack.push(p + 1); }
        if(y > 0 && m[p - w] && !seen[p - w]){ seen[p - w] = 1; stack.push(p - w); }
        if(y < h - 1 && m[p + w] && !seen[p + w]){ seen[p + w] = 1; stack.push(p + w); }
      }
      if(count >= minCount) out.push({ m: comp, w: w, h: h, sc: mask.sc, count: count });
    }
    return out;
  }
  // lasso −: the drawn loop (plus the circles it contains) is cut out of every shape it touches, as if the shape had
  // been drawn without those circles: a circle at the edge dents the outline, an inner circle reached through the
  // loop becomes a channel, an inner circle the loop does not open up becomes a hole.
  function subtractLoop(loopPts, skipCommit){
    var loop = elResample(loopPts, 4);
    var K = [];
    for(var slot of activeKeys()){var coordinate=parseKey(slot),i=coordinate.i,j=coordinate.j; var k = key(i, j); if(elWinding(center(i, j), loop) !== 0) K.push(k); }
    if(!K.length){ setStatus('no circle inside the loop.'); render(); return; }
    var affected = state.contours.filter(function(c){
      if(c.single) return K.indexOf(c.single) >= 0;
      var mk = memberKeys(c);
      if(K.some(function(kk){ return mk.indexOf(kk) >= 0; })) return true;
      // circles already removed by an earlier cut, and any circle sitting inside the outline, count too
      if((c.cuts || []).some(function(cc){ var cm = memberKeys(cc); return K.some(function(kk){ return cm.indexOf(kk) >= 0; }); })) return true;
      var d = contourPath(c); if(!d) return false;
      var inS = insideTest(d);
      return K.some(function(kk){ var pk = parseKey(kk), ct = center(pk.i, pk.j); return inS(ct.x, ct.y); });
    });
    if(!affected.length){ setStatus('these circles belong to no shape.'); render(); return; }
    if(!skipCommit) commit();
    var removed = 0, added = [];
    // the cut is the shape lasso + would have drawn around these circles: the loop tightens into an elastic band
    // that links them with tangents (and bends around the circles it must not eat into), then that band is subtracted
    var neg = prepareLoop(elResample(loopPts, elH));
    neg = sidePass(neg); neg.forEach(function(q){ elPushOut(q); });
    neg = elRelax(untangle(neg), 3000);
    activeObstacles = null;
    var poly = function(pts){ return 'M' + pts.map(function(q, qi){ return (qi ? 'L' : '') + fmt(q.x) + ',' + fmt(q.y); }).join(' ') + ' Z'; };
    var cutD = poly(neg);
    K.forEach(function(k){ cutD += ' ' + segsToSvg(circleSegs(k)); });
    // a loop that comes in from outside a shape also digs the corridor it was drawn along
    var entersFromOutside = affected.some(function(c){ var inS = insideTest(contourPath(c)); return loop.some(function(q){ return !inS(q.x, q.y); }); });
    if(entersFromOutside) cutD += ' ' + poly(loop);
    var cut = elMask(cutD, 0);
    // the removed circles that are not part of the outline become (or extend) an inner cut of piece nc
    function attachCut(nc, c, K, neg){
      var ck = contourKeys(nc), inComp = insideTest(contourPath(nc));
      var ctr = function(k){ var pk = parseKey(k); return center(pk.i, pk.j); };
      var interior = K.filter(function(k){ if(ck.indexOf(k) >= 0) return false; var ct = ctr(k); return inComp(ct.x, ct.y); });
      nc.holes = (c.holes || []).slice();
      var oldCuts = (c.cuts || []).filter(function(cc){ return memberKeys(cc).some(function(k){ var ct = ctr(k); return inComp(ct.x, ct.y); }); });
      // A one-circle hole must take part in the same extension as a multi-circle cut.
      (c.holes || []).forEach(function(k){
        if(K.indexOf(k) >= 0 || elWinding(ctr(k), neg) !== 0){
          oldCuts.push({ single: k, tangents: [], members: [k], closed: true, cut: true });
        }
      });
      // an earlier cut that the new one touches (shares a circle, or the new band runs over it) is absorbed into it
      var Kall = K.slice(), absorbed = [];
      oldCuts.forEach(function(cc){
        var cm = memberKeys(cc), cd = contourPath(cc), inC = cd ? insideTest(cd) : null;
        var touch = cm.some(function(k){ return K.indexOf(k) >= 0 || elWinding(ctr(k), neg) !== 0; }) || (inC && K.some(function(k){ var ct = ctr(k); return inC(ct.x, ct.y); }));
        if(touch){ absorbed.push(cc); Kall = uniq(Kall.concat(cm)); }
      });
      nc.cuts = oldCuts.filter(function(cc){ return absorbed.indexOf(cc) < 0; });
      var cutDone = false;
      if(Kall.length > 1 && (absorbed.length || interior.length === K.length)){
        // the removed circles become one inner Hofmann contour (an elastic band tightened around them)
        var seedPts = neg;
        if(absorbed.length){
          var um = null, add = function(dd){ var mk = elMask(dd); if(!um) um = { m: new Uint8Array(mk.m), w: mk.w, h: mk.h, sc: mk.sc }; else { for(var q = 0; q < mk.m.length; q++){ if(mk.m[q]) um.m[q] = 1; } } };
          add(poly(neg)); K.forEach(function(k){ add(segsToSvg(circleSegs(k))); }); absorbed.forEach(function(cc){ var dd = contourPath(cc); if(dd) add(dd); });
          seedPts = elTrace(um);
        }
        if(seedPts.length >= 12){
          setObstacles(Kall, false, [], []);
          var cp = absorbed.length ? elRelax(seedPts, 2500) : seedPts;
          activeObstacles = null;
          if(orient(nc) > 0 === (elSignedArea(cp) > 0)) cp = cp.slice().reverse();
          var cutC = buildContour(cp, Kall);
          if(cutC){ cutC.members = Kall.slice(); cutC.soft = (cutC.notches || []).slice(); cutC.notches = []; cutC.holes = []; cutC.necks = []; cutC.cut = true; nc.cuts.push(cutC); cutDone = true; }
        }
      }
      if(!cutDone){
        nc.cuts = (c.cuts || []).filter(function(cc){ return oldCuts.indexOf(cc) >= 0; });
        nc.holes = uniq(nc.holes.concat(interior));
        absorbed.forEach(function(cc){ nc.holes = uniq(nc.holes.concat(memberKeys(cc).filter(function(k){ var ct = ctr(k); return ck.indexOf(k) < 0 && inComp(ct.x, ct.y); }))); });
      }
    }
    affected.forEach(function(c){
      state.contours = state.contours.filter(function(x){ return x !== c; });
      if(c.single){ removed++; return; }
      var mk0 = memberKeys(c), ck0 = contourKeys(c), d0 = contourPath(c), inS0 = d0 ? insideTest(d0) : null;
      // circles that are neither on the outline nor its members nor outside it (i.e. already-removed circles inside
      // the shape) only change the inner cuts: the outline itself is left exactly as it is
      var touchesOutline = !inS0 || K.some(function(k){ if(ck0.indexOf(k) >= 0) return true; var pk = parseKey(k), ct = center(pk.i, pk.j); return !inS0(ct.x, ct.y); });
      // a removal that touches an existing cut only extends that cut (the cut is clipped to the outline anyway):
      // carving the outline as well would draw the same edge twice and leave slivers between the two
      var extendsCut = (c.holes || []).some(function(k){ return K.indexOf(k) >= 0 || elWinding(center(parseKey(k).i, parseKey(k).j), neg) !== 0; }) || (c.cuts || []).some(function(cc){
        var cm = memberKeys(cc), cd = contourPath(cc), inC = cd ? insideTest(cd) : null;
        return cm.some(function(k){ return K.indexOf(k) >= 0 || elWinding(center(parseKey(k).i, parseKey(k).j), neg) !== 0; }) || (inC && K.some(function(k){ var pk = parseKey(k), ct = center(pk.i, pk.j); return inC(ct.x, ct.y); }));
      });
      if(!touchesOutline || extendsCut){
        var nc0 = JSON.parse(JSON.stringify(c)); nc0.id = state.nextId++;
        // The exterior remains the positive shell; only its interior membership changes.
        nc0.members = mk0.filter(function(k){ return K.indexOf(k) < 0 || ck0.indexOf(k) >= 0; });
        attachCut(nc0, c, K, neg);
        reconcileMembers(nc0); pruneHoles(nc0); swallowedToHoles(nc0);
        state.contours.push(nc0); added.push(nc0.id);
        return;
      }
      var members0 = mk0.filter(function(k){ return K.indexOf(k) < 0; });
      var hard = uniq((c.notches || []).concat(K));
      var shape = elMask(contourPath(c));
      var diff = { m: new Uint8Array(shape.m.length), w: shape.w, h: shape.h, sc: shape.sc };
      for(var q = 0; q < diff.m.length; q++) diff.m[q] = shape.m[q] && !cut.m[q] ? 1 : 0;
      var comps = maskComponents(diff, 40), made = 0;
      comps.forEach(function(comp){
        var members = members0.filter(function(k){ var pk = parseKey(k), ct = center(pk.i, pk.j), px = Math.round(ct.x * comp.sc), py = Math.round(ct.y * comp.sc); return px >= 0 && py >= 0 && px < comp.w && py < comp.h && comp.m[py * comp.w + px]; });
        if(!members.length) return;
        var seed = elTrace(comp); if(seed.length < 12) return;
        var ignoreH = (c.holes || []).concat(cutMemberKeys(c)).filter(function(k){ return K.indexOf(k) < 0; });
        setObstacles(members, false, hard, ignoreH);
        var pts = elRelax(seed, 2500);
        var nc = buildContour(pts, members);
        activeObstacles = null;
        // the band may have short-cut across the empty part of the piece (a thin arm, say); then it covers far more
        // than the piece itself, and the safer seed is the shape's previous outline with the removed circles as pegs
        if(nc){
          var area = Math.abs(elSignedArea(sampleContour(nc, 3))) * comp.sc * comp.sc;
          if(area > comp.count * 1.12 + 400 && comps.length === 1){
            seedMode = true; var seed2 = sampleContour(c, elH); seedMode = false;
            setObstacles(members, false, hard, ignoreH);
            var pts2 = elRelax(seed2, 2500), nc2 = buildContour(pts2, members);
            activeObstacles = null;
            if(nc2){ var area2 = Math.abs(elSignedArea(sampleContour(nc2, 3))) * comp.sc * comp.sc; if(area2 < area) nc = nc2; }
          }
        }
        if(!nc) return;
        nc.members = members; nc.notches = hard.slice(); nc.soft = (nc.notches || []).filter(function(k){ return hard.indexOf(k) < 0; });
        nc.necks = (c.necks || []).slice();
        attachCut(nc, c, K, neg);
        reconcileMembers(nc); pruneHoles(nc); swallowedToHoles(nc);
        state.contours.push(nc); added.push(nc.id); made++;
      });
      if(!made) removed++;
    });
    state.selected = null;
    settleSync(null);
    setStatus(K.length + ' circle' + (K.length > 1 ? 's' : '') + ' removed' + (removed ? ', ' + removed + ' shape' + (removed > 1 ? 's' : '') + ' deleted.' : '.'));
    render();
  }
