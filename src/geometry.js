  function key(i, j){ return i + '_' + j; }
  function parseKey(k){ var p = k.split('_'); return { i: +p[0], j: +p[1] }; }
  function fmt(n){ return Math.round(n * 100) / 100; }

  /* ---------- geometry ---------- */
  function rowStep(){ return state.offset ? S * Math.sqrt(3) / 2 : S; }
  function center(i, j){ var n=state.nodes[key(i,j)];return n&&typeof n.x==='number'?{x:n.x,y:n.y}:gridCenter(i,j); }
  function pctOf(k){ var n = state.nodes[k]; return n && typeof n.pct === 'number' ? n.pct : state.defaultPct; }
  // seedMode: geometry is built with the band's hit radii (tiny circles become 3 px pegs the band can hold on to)
  var seedMode = false;
  function trueRadius(k){ return Math.max(0.01, (S / 2) * pctOf(k) / 100); }
  function radius(k){ var r = trueRadius(k); return seedMode ? Math.max(r, 3) : r; }
  // the band itself has no thickness, but a peg it can only reach through a gap narrower than SQUEEZE
  // is considered out of reach once it sits inside the shape (see prunePegs)
  var SQUEEZE = 8, PAD = 0;
  function hitRadius(k){ return Math.max(trueRadius(k), 3) + PAD; }
  /* ---------- nodes: rounded squares (bevel 1 = circle, 0 = square) ---------- */
  // a node of half-size r is the square of half-size e = r - rho with its corners rounded by rho = bevel * r,
  // i.e. the hull of four corner circles: 0 top-right, 1 bottom-right, 2 bottom-left, 3 top-left (screen, y down)
  function bevel(){ return typeof state.bevel === 'number' ? Math.max(0, Math.min(1, state.bevel)) : 1; }
  function nodeGeomR(c, r){ var b = bevel(), rho = b * r, e = r - rho; if(e < 1e-6) e = 0; return { c: c, r: r, rho: rho, e: e }; }
  function nodeOf(k){ var pk = parseKey(k); return nodeGeomFor(k,center(pk.i, pk.j), radius(k)); }
  function nodeHit(k){ var pk = parseKey(k); return nodeGeomFor(k,center(pk.i, pk.j), hitRadius(k)); }
  function circleNodeOf(k){ var pk = parseKey(k); return { c: center(pk.i, pk.j), r: radius(k), rho: radius(k), e: 0 }; }
  var CSX = [1, 1, -1, -1], CSY = [-1, 1, 1, -1];
  function cornerC(nd, i){ return { x: nd.c.x + CSX[i] * nd.e, y: nd.c.y + CSY[i] * nd.e }; }
  function cornerLo(i){ return -Math.PI / 2 + i * Math.PI / 2; }
  function cornerHi(i){ return i * Math.PI / 2; }
  function pointOn(nd, i, a){ var cc = cornerC(nd, i); return { x: cc.x + nd.rho * Math.cos(a), y: cc.y + nd.rho * Math.sin(a) }; }
  // signed distance to the node's boundary (negative inside)
  function sdf(q, nd){
    var dx = Math.abs(q.x - nd.c.x) - nd.e, dy = Math.abs(q.y - nd.c.y) - nd.e;
    var ox = Math.max(dx, 0), oy = Math.max(dy, 0);
    return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(dx, dy), 0) - nd.rho;
  }
  // outward unit normal at (or nearest to) q
  function sdfNormal(q, nd){
    var px = q.x - nd.c.x, py = q.y - nd.c.y, dx = Math.abs(px) - nd.e, dy = Math.abs(py) - nd.e;
    var nx, ny;
    if(dx > 0 || dy > 0){ nx = Math.max(dx, 0) * (px < 0 ? -1 : 1); ny = Math.max(dy, 0) * (py < 0 ? -1 : 1); }
    else if(dx >= dy){ nx = px < 0 ? -1 : 1; ny = 0; }
    else { nx = 0; ny = py < 0 ? -1 : 1; }
    var L = Math.hypot(nx, ny); if(L < 1e-9){ nx = 1; ny = 0; L = 1; }
    return { x: nx / L, y: ny / L };
  }
  // move q onto the boundary, `off` px outside it
  function projectTo(q, nd, off){
    var d = sdf(q, nd), n = sdfNormal(q, nd), t = (off || 0) - d;
    q.x += n.x * t; q.y += n.y * t;
    return q;
  }
  // extent of the node along a unit direction (symmetric shape)
  function support(nd, dir){ return nd.e * (Math.abs(dir.x) + Math.abs(dir.y)) + nd.rho; }
  // distance between two nodes' boundaries (negative: they overlap)
  function gapNodes(a, b){
    var dx = Math.abs(a.c.x - b.c.x) - a.e - b.e, dy = Math.abs(a.c.y - b.c.y) - a.e - b.e;
    var ox = Math.max(dx, 0), oy = Math.max(dy, 0);
    return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(dx, dy), 0) - a.rho - b.rho;
  }
  function angIn(a, i){ var lo = cornerLo(i), hi = cornerHi(i); a = ((a - lo) % TAU + TAU) % TAU + lo; if(a > hi + 1e-4) a -= TAU; return Math.max(lo - 1e-9, Math.min(hi + 1e-9, a)); }
  // boundary walk on a node from (corner ci, angle a) to (corner cj, angle b), as arc / line segments
  function walkSegs(nd, ci, a, cj, b, flow, preferFull, pOut){
    if(nd.e === 0) return [arcSeg(nd.rho, a, b, flow, pOut, preferFull, nd.c)];
    var out = [], step = flow === 'O' ? 1 : -1, cur = ci, ang = angIn(a, ci), bq = angIn(b, cj);
    if(ci === cj){
      var direct = flow === 'O' ? bq >= ang - 1e-6 : bq <= ang + 1e-6, delta = Math.abs(bq - ang);
      if(direct && !(delta < 1e-6 && preferFull)){
        if(delta < 1e-6) return [{ t: 'L', to: pOut }];
        return [{ t: 'A', c: cornerC(nd, ci), r: nd.rho, aIn: ang, aOut: bq, flow: flow, to: pOut, full: false }];
      }
    }
    for(var guard = 0; guard < 6; guard++){
      var endA = flow === 'O' ? cornerHi(cur) : cornerLo(cur);
      if(Math.abs(endA - ang) > 1e-6 && nd.rho > 0.05) out.push({ t: 'A', c: cornerC(nd, cur), r: nd.rho, aIn: ang, aOut: endA, flow: flow, to: pointOn(nd, cur, endA), full: false });
      var nxt = (cur + step + 4) % 4, startA = flow === 'O' ? cornerLo(nxt) : cornerHi(nxt);
      out.push({ t: 'L', to: pointOn(nd, nxt, startA) });
      cur = nxt; ang = startA;
      if(cur === cj){
        if(Math.abs(bq - ang) > 1e-6 && nd.rho > 0.05) out.push({ t: 'A', c: cornerC(nd, cur), r: nd.rho, aIn: ang, aOut: bq, flow: flow, to: pOut, full: false });
        else out[out.length - 1].to = pOut;
        return out;
      }
    }
    return out;
  }
  /* ---------- symmetry ---------- */
  function symOn(){ return state.sym !== 'none' && !state.offset; }
  function mirrorKeys(k){return uniq(symmetryTransforms().map(function(t){return reflectedKey(k,t.v,t.h);}).filter(Boolean));}
  function mirrorLoops(pts){
    if(!symOn()) return [];
    var size = canvasSize(), out = [], v = state.sym === 'v' || state.sym === 'both', h = state.sym === 'h' || state.sym === 'both';
    var mx = function(p){ return { x: size.W - p.x, y: p.y }; }, my = function(p){ return { x: p.x, y: size.H - p.y }; };
    if(v) out.push(pts.map(mx));
    if(h) out.push(pts.map(my));
    if(v && h) out.push(pts.map(function(p){ return my(mx(p)); }));
    return out;
  }
  // a circle may grow until it touches a neighbour (two pixels short of it), never into it
  var TOUCH = 2;
  function maxPctFor(k){
    var c=nodeCenter(k),limit=sizeLimit(k),best=S/2*limit/100,changed=editedLayout();
    if(changed){var sz=canvasSize();best=Math.min(best,c.x,c.y,sz.W-c.x,sz.H-c.y);}
    activeKeys().forEach(function(otherKey){if(otherKey===k)return;var other=nodeOf(otherKey);
      if(gapNodes(nodeGeomFor(k,c,best),other)>=TOUCH)return;
      var lo=0,hi=best;for(var it=0;it<24;it++){var mid=(lo+hi)/2;if(gapNodes(nodeGeomFor(k,c,mid),other)>=TOUCH)lo=mid;else hi=mid;}best=lo;
    });return Math.max(0,Math.min(limit,Math.floor(best/(S/2)*100+1e-6)));
  }
  // after a size change elsewhere, shrink any circle that now collides
  function enforceCaps(){
    var changed = [];
    // A moved default-size circle may collide after global enlargement. Give
    // only those circles a local cap; untouched pixel grids can still touch.
    if(editedLayout()){
      var keys=activeKeys();keys.forEach(function(k){var n=state.nodes[k]||{};if(typeof n.pct==='number')return;var nd=nodeOf(k);
        if(keys.some(function(q){return q!==k&&gapNodes(nd,nodeOf(q))<-.001;})){
          n.pct=maxPctFor(k);n.sizeRatio=n.pct/(state.defaultPct||100);state.nodes[k]=n;changed.push(k);
        }
      });
    }
    for(var pass = 0; pass < 3; pass++){
      var any = false;
      Object.keys(state.nodes).forEach(function(k){
        var n = state.nodes[k]; if(!nodeActive(k)||typeof n.pct !== 'number') return;
        var cap = maxPctFor(k);
        if(n.pct > cap){ n.pct = cap; any = true; if(changed.indexOf(k) < 0) changed.push(k); }
      });
      if(!any) break;
    }
    return changed;
  }
  function canvasSize(){ return { W: MARGIN * 2 + (state.cols - 1) * S + (state.offset ? S / 2 : 0), H: MARGIN * 2 + (state.rows - 1) * rowStep() }; }

  // tangent line between two circles (cA, rA) and (cB, rB) for the given flows
  function circleTangent(cA, rA, cB, rB, fA, fB){
    var dx = cB.x - cA.x, dy = cB.y - cA.y, d = Math.sqrt(dx*dx + dy*dy);
    if(d < 1e-6) return null;
    var theta = Math.atan2(dy, dx), angA, angB;
    if(fA === fB){
      if(d <= Math.abs(rA - rB) + 1e-6) return null;
      var alpha = Math.acos((rA - rB) / d);
      var sg = fA === 'O' ? -1 : 1;
      angA = theta + sg * alpha; angB = angA;
    } else {
      if(d <= rA + rB + 1e-6) return null;
      var beta = Math.acos((rA + rB) / d);
      var sg2 = fA === 'O' ? -1 : 1;
      angA = theta + sg2 * beta; angB = angA + Math.PI;
    }
    return { pA: { x: cA.x + rA * Math.cos(angA), y: cA.y + rA * Math.sin(angA) }, pB: { x: cB.x + rB * Math.cos(angB), y: cB.y + rB * Math.sin(angB) }, angA: angA, angB: angB, cA: cA, cB: cB, rA: rA, rB: rB };
  }
  // tangent between two nodes: the tangent between the right pair of corner circles, i.e. the one whose line
  // supports both nodes (every other corner circle lies on the node's side of it)
  function tangentGeom(t){
    var A = nodeOf(t.a), B = nodeOf(t.b);
    var nA = A.e === 0 ? 1 : 4, nB = B.e === 0 ? 1 : 4, fallback = null;
    for(var ia = 0; ia < nA; ia++){ for(var ib = 0; ib < nB; ib++){
      var g = circleTangent(cornerC(A, ia), A.rho, cornerC(B, ib), B.rho, t.fA, t.fB); if(!g) continue;
      if(!fallback) fallback = { g: g, ia: ia, ib: ib };
      if(nA === 1 && nB === 1) break;
      var ux = g.pB.x - g.pA.x, uy = g.pB.y - g.pA.y, L = Math.hypot(ux, uy); if(L < 1e-9) continue;
      var nx = -uy / L, ny = ux / L, ok = true;
      // the node's side of the line follows from its flow (a wrapped node lies to the left of the travel direction)
      var sA = t.fA === 'O' ? 1 : -1, sB = t.fB === 'O' ? 1 : -1;
      for(var q = 0; q < nA && ok; q++){ var ca = cornerC(A, q); if(sA * (nx * (ca.x - g.pA.x) + ny * (ca.y - g.pA.y)) < A.rho - 1e-4) ok = false; }
      for(var q2 = 0; q2 < nB && ok; q2++){ var cb = cornerC(B, q2); if(sB * (nx * (cb.x - g.pA.x) + ny * (cb.y - g.pA.y)) < B.rho - 1e-4) ok = false; }
      if(ok){ fallback = { g: g, ia: ia, ib: ib }; ia = nA; break; }
    } }
    if(!fallback) return null;
    var r = fallback.g; r.iA = fallback.ia; r.iB = fallback.ib;
    r.thA = Math.atan2(r.pA.y - A.c.y, r.pA.x - A.c.x); r.thB = Math.atan2(r.pB.y - B.c.y, r.pB.x - B.c.x);
    return r;
  }

  function arcDelta(aIn, aOut, flow){ return flow === 'O' ? ((aOut - aIn) % TAU + TAU) % TAU : ((aIn - aOut) % TAU + TAU) % TAU; }
  // segments: { t:'L', to } | { t:'A', c, r, aIn, aOut, flow, to, full }
  function arcSeg(r, aIn, aOut, flow, pOut, preferFull, c){
    var delta = flow === 'O' ? ((aOut - aIn) % TAU + TAU) % TAU : ((aIn - aOut) % TAU + TAU) % TAU;
    if(delta < 1e-4 && preferFull && c) return { t: 'A', c: c, r: r, aIn: aIn, aOut: aOut, flow: flow, to: pOut, full: true };
    if(delta < 1e-6 || r < 0.05) return { t: 'L', to: pOut };
    return { t: 'A', c: c, r: r, aIn: aIn, aOut: aOut, flow: flow, to: pOut, full: false };
  }
  function segsToSvg(sg){
    var d = 'M' + fmt(sg.start.x) + ',' + fmt(sg.start.y);
    sg.segs.forEach(function(s){
      if(s.t === 'L'){ d += ' L' + fmt(s.to.x) + ',' + fmt(s.to.y); return; }
      var sw = s.flow === 'O' ? 1 : 0;
      if(s.full){
        var opp = { x: 2 * s.c.x - s.to.x, y: 2 * s.c.y - s.to.y };
        d += ' A' + fmt(s.r) + ',' + fmt(s.r) + ' 0 0 ' + sw + ' ' + fmt(opp.x) + ',' + fmt(opp.y) + ' A' + fmt(s.r) + ',' + fmt(s.r) + ' 0 0 ' + sw + ' ' + fmt(s.to.x) + ',' + fmt(s.to.y);
        return;
      }
      var delta = s.flow === 'O' ? ((s.aOut - s.aIn) % TAU + TAU) % TAU : ((s.aIn - s.aOut) % TAU + TAU) % TAU;
      d += ' A' + fmt(s.r) + ',' + fmt(s.r) + ' 0 ' + (delta > Math.PI ? 1 : 0) + ' ' + sw + ' ' + fmt(s.to.x) + ',' + fmt(s.to.y);
    });
    return d + (sg.closed ? ' Z' : '');
  }

  function tangentGeomRobust(a, b, fA, fB, pinch){
    var g = tangentGeom({ a: a, b: b, fA: fA, fB: fB });
    if(g) return g;
    var pa = parseKey(a), pb = parseKey(b);
    var cA = center(pa.i, pa.j), cB = center(pb.i, pb.j), rA = radius(a), rB = radius(b);
    var dx = cB.x - cA.x, dy = cB.y - cA.y, d = Math.hypot(dx, dy);
    if(fA !== fB && d > Math.abs(rA - rB) + 1e-6 && d <= rA + rB + 1e-6){
      var theta = Math.atan2(dy, dx);
      var cosg = Math.max(-1, Math.min(1, (d*d + rA*rA - rB*rB) / (2 * d * rA)));
      var gamma = Math.acos(cosg);
      var sA = fA === 'O' ? 1 : -1;
      var angEntry = theta - sA * gamma, angExit = theta + sA * gamma;
      if(pinch === 'exit' || pinch === 'entry'){
        var angS = pinch === 'exit' ? angExit : angEntry;
        var Ps = { x: cA.x + rA * Math.cos(angS), y: cA.y + rA * Math.sin(angS) };
        var rho = (state.fillet || 0) * Math.min(rA, rB);
        if(rho > 0.5){
          // concave corner between the wrapped arc and the carved arc: the fillet circle lies in the fill,
          // i.e. inside the wrapped circle and outside the carved one
          var aW = pinch === 'exit', RA = aW ? rA - rho : rA + rho, RB = aW ? rB + rho : rB - rho;
          var a2 = (RA*RA - RB*RB + d*d) / (2 * d), h2 = RA*RA - a2*a2;
          if(h2 >= 0 && RA > 0 && RB > 0){
            var h = Math.sqrt(h2), mx = cA.x + a2 * dx / d, my = cA.y + a2 * dy / d;
            var F1 = { x: mx + h * (-dy / d), y: my + h * (dx / d) }, F2 = { x: mx - h * (-dy / d), y: my - h * (dx / d) };
            var F = Math.hypot(F1.x - Ps.x, F1.y - Ps.y) <= Math.hypot(F2.x - Ps.x, F2.y - Ps.y) ? F1 : F2;
            var angTA = Math.atan2(F.y - cA.y, F.x - cA.x), angTB = Math.atan2(F.y - cB.y, F.x - cB.x);
            var TA = { x: cA.x + rA * Math.cos(angTA), y: cA.y + rA * Math.sin(angTA) };
            var TB = { x: cB.x + rB * Math.cos(angTB), y: cB.y + rB * Math.sin(angTB) };
            return { pA: TA, pB: TB, angA: angTA, angB: angTB, thA: angTA, thB: angTB, iA: 0, iB: 0, cA: cA, cB: cB, rA: rA, rB: rB, pinched: true, fillet: { c: F, r: rho, flow: aW ? fA : fB } };
          }
        }
        var angPs = Math.atan2(Ps.y - cB.y, Ps.x - cB.x);
        return { pA: Ps, pB: Ps, angA: angS, angB: angPs, thA: angS, thB: angPs, iA: 0, iB: 0, cA: cA, cB: cB, rA: rA, rB: rB, pinched: true };
      }
      var P = { x: cA.x + rA * Math.cos(angEntry), y: cA.y + rA * Math.sin(angEntry) };
      var Q = { x: cA.x + rA * Math.cos(angExit), y: cA.y + rA * Math.sin(angExit) };
      var angQ = Math.atan2(Q.y - cB.y, Q.x - cB.x);
      return { pA: P, pB: Q, angA: angEntry, angB: angQ, thA: angEntry, thB: angQ, iA: 0, iB: 0, cA: cA, cB: cB, rA: rA, rB: rB, pinched: true };
    }
    return null;
  }

  function circleSegs(k, flow){
    var nd = nodeOf(k), f = flow || 'A';
    if(nd.e === 0){
      var c = nd.c, r = nd.r, left = { x: c.x - r, y: c.y };
      return { start: left, closed: true, segs: [ { t: 'A', c: c, r: r, aIn: Math.PI, aOut: 0, flow: f, to: { x: c.x + r, y: c.y }, full: false }, { t: 'A', c: c, r: r, aIn: 0, aOut: Math.PI, flow: f, to: left, full: false } ] };
    }
    var st = pointOn(nd, 3, Math.PI);
    return { start: st, closed: true, segs: walkSegs(nd, 3, Math.PI, 3, Math.PI, f, true, st) };
  }
  // holes are drawn against the outline's direction, so the plain non-zero rule leaves them empty (an outline that
  // happens to wind twice around a spot keeps rendering the same whether or not the shape has holes)
  function holeFlow(c){ return elSignedArea(sampleContour(c, 6)) >= 0 ? 'A' : 'O'; }
  function orient(c){ return elSignedArea(sampleContour(c, 6)) >= 0 ? 1 : -1; }
  // the same Hofmann contour walked the other way round (flows flip, tangents reverse)
  function reverseContour(cc){
    var flip = function(f){ return f === 'O' ? 'A' : 'O'; };
    var ts = cc.tangents.slice().reverse().map(function(t){ return { a: t.b, b: t.a, fA: flip(t.fB), fB: flip(t.fA), pinch: t.pinch }; });
    return Object.assign({}, cc, { tangents: ts });
  }
  // every hole of a shape as a segment list: circle holes, and lasso − cuts (inner Hofmann contours), all drawn
  // against the outline's direction so a plain non-zero fill leaves them empty
  function holeSegsList(c){
    var out = [], hasCircles = c.holes && c.holes.length, cuts = c.cuts || [];
    if(!hasCircles && !cuts.length) return out;
    var o = orient(c), hf = o > 0 ? 'A' : 'O';
    (c.holes || []).forEach(function(k){ out.push(circleSegs(k, hf)); });
    cuts.forEach(function(cc){
      var sg = contourSegments(cc); if(!sg) return;
      if(orient(cc) === o){ sg = contourSegments(reverseContour(cc)); if(!sg) return; }
      out.push(sg);
    });
    return out;
  }
  function hasHoles(c){ return !!((c.holes && c.holes.length) || (c.cuts && c.cuts.length)); }

  // A neck is available independently of the slider position. Its amount is
  // measured as a depth below the original common tangent, not as the radius
  // of the fillet circle (whose existence threshold caused a sudden jump).
  function facingNeckSupports(g,a,b){
    if(g.pinched||g.fillet||g.rA<=.05||g.rB<=.05)return g;
    var A=nodeOf(a),B=nodeOf(b);if(!A.e&&!B.e)return g;
    var vx=g.pB.x-g.pA.x,vy=g.pB.y-g.pA.y,L=Math.hypot(vx,vy);if(L<1e-6)return g;vx/=L;vy/=L;
    var nx=(g.pA.x-g.cA.x)/g.rA,ny=(g.pA.y-g.cA.y)/g.rA;
    function face(nd,original,index,direction){
      var best={c:original,index:index},score=0;if(!nd.e)return best;
      for(var i=0;i<4;i++){var c=cornerC(nd,i),dx=c.x-original.x,dy=c.y-original.y,s=(dx*vx+dy*vy)*direction;
        if(Math.abs(dx*nx+dy*ny)<1e-6&&s>score+1e-6){best={c:c,index:i};score=s;}
      }return best;
    }
    // Along a flat side, both corner circles support the same straight line.
    // A concave neck must leave the two facing corners, not their far ends.
    var ca=face(A,g.cA,g.iA||0,1),cb=face(B,g.cB,g.iB||0,-1);
    var pA={x:ca.c.x+g.rA*nx,y:ca.c.y+g.rA*ny},pB={x:cb.c.x+g.rB*nx,y:cb.c.y+g.rB*ny};
    if((pB.x-pA.x)*vx+(pB.y-pA.y)*vy<=1e-6)return g;
    g.cA=ca.c;g.cB=cb.c;g.iA=ca.index;g.iB=cb.index;g.pA=pA;g.pB=pB;return g;
  }
  function neckAvailable(g){
    if(!g||g.pinched||g.rA<=.05||g.rB<=.05)return false;
    var d=Math.hypot(g.cB.x-g.cA.x,g.cB.y-g.cA.y);
    return d>Math.abs(g.rA-g.rB)+1e-6&&d-g.rA-g.rB<=2.4*Math.min(g.rA,g.rB)+1e-6;
  }
  function neckFillet(g,amount){
    if(!neckAvailable(g))return null;
    var vx=g.pB.x-g.pA.x,vy=g.pB.y-g.pA.y,L=Math.hypot(vx,vy);if(L<1e-6)return null;
    vx/=L;vy/=L;
    var nx=(g.pA.x-g.cA.x)/g.rA,ny=(g.pA.y-g.cA.y)/g.rA,minR=Math.min(g.rA,g.rB);
    var dx=g.cB.x-g.cA.x,dy=g.cB.y-g.cA.y,d=Math.hypot(dx,dy);
    // Stay shallower than the source circles, including overlapping circles,
    // so the two sides of a narrow neck cannot cross each other at zero.
    var floor=Math.max(.05,minR*.005,(d-g.rA-g.rB)/2+.001);
    var ra=g.rA+floor,rb=g.rB+floor,a=(ra*ra-rb*rb+d*d)/(2*d),h=Math.sqrt(Math.max(0,ra*ra-a*a));
    var mx=g.cA.x+a*dx/d,my=g.cA.y+a*dy/d;
    var y1=(mx-h*dy/d-g.pA.x)*nx+(my+h*dx/d-g.pA.y)*ny;
    var y2=(mx+h*dy/d-g.pA.x)*nx+(my-h*dx/d-g.pA.y)*ny;
    var maximum=Math.min(.9*minR,.98*(floor-Math.max(y1,y2)));
    if(maximum<=1e-6)return null;
    var t=Math.max(0,Math.min(1,amount)),depth=maximum*(1-.85*t);
    // In tangent coordinates, F=(x,rho-depth). Solving |F-A|=rA+rho
    // gives an exact circular arc at a linearly changing visible depth.
    var x=L/2-(g.rB-g.rA)*depth/L,rho=(x*x+depth*depth)/(2*depth)-g.rA;
    if(!Number.isFinite(rho)||rho<=0)return null;
    return{c:{x:g.pA.x+x*vx+(rho-depth)*nx,y:g.pA.y+x*vy+(rho-depth)*ny},r:rho};
  }

  function contourSegments(c){
    if(c.single) return circleSegs(c.single);
    var ts = c.tangents;
    if(!ts.length) return null;
    var contacts = [{ k: ts[0].a, f: ts[0].fA, pinch: ts[0].pinch }];
    ts.forEach(function(t, ti){ contacts.push({ k: t.b, f: t.fB, pinch: ts[ti + 1] ? ts[ti + 1].pinch : null }); });
    if(contacts.length > 1 && contacts[contacts.length - 1].k === contacts[0].k){ contacts[0].pinch = ts[ts.length - 1].pinch; contacts.pop(); }
    var geoms = null;
    for(var guard = 0; guard < 64; guard++){
      var n = contacts.length;
      if(n === 0) return null;
      if(n === 1) return circleSegs(contacts[0].k);
      geoms = []; var bad = -1;
      for(var i = 0; i < n; i++){
        var A = contacts[i], B = contacts[(i + 1) % n];
        var g = A.k === B.k ? null : tangentGeomRobust(A.k, B.k, A.f, B.f, A.pinch);
        if(!g){ bad = i; break; }
        geoms.push(g);
      }
      if(bad < 0){
        // a carved circle the outline would have to wrap by more than a half turn is not a dent any more: drop it
        var cO = 0; contacts.forEach(function(x){ if(x.f === 'O') cO++; });
        var majorF = cO * 2 >= n ? 'O' : 'A';
        for(var q = 0; q < n && bad < 0; q++){
          if(!isNotch(c, contacts[q].k) && contacts[q].f === majorF) continue;
          var gi = geoms[(q - 1 + n) % n], go = geoms[q];
          if(pegDegenerate(gi, go, contacts[q].f)) bad = q;
        }
        if(bad < 0) break;
        contacts.splice(bad, 1); geoms = null; continue;
      }
      var A2 = contacts[bad], B2 = contacts[(bad + 1) % n];
      contacts.splice((A2.k === B2.k || radius(A2.k) < radius(B2.k)) ? bad : (bad + 1) % n, 1);
      geoms = null;
    }
    if(!geoms || !geoms.length) return null;
    var m = contacts.length, segs = [];
    // metaball necks: only where the user asked for one (click on a tangent). The straight tangent between two
    // same-flow circles is replaced by a concave fillet tangent to both, when the circles are close enough.
    var necks = c.necks || [];
    for(var b0 = 0; b0 < geoms.length; b0++){
      var gb = geoms[b0], Ab = contacts[b0], Bb = contacts[(b0 + 1) % m];
      if(Ab.f===Bb.f)gb=facingNeckSupports(gb,Ab.k,Bb.k);
      if(Ab.f !== Bb.f || gb.pinched || gb.fillet || necks.indexOf(pairKey(Ab.k, Bb.k)) < 0) continue;
      var neck=neckFillet(gb,(state.fillet||0)/.6);if(!neck)continue;
      var F=neck.c,rhoB=neck.r;
      var aTA = Math.atan2(F.y - gb.cA.y, F.x - gb.cA.x), aTB = Math.atan2(F.y - gb.cB.y, F.x - gb.cB.x);
      gb.pA = { x: gb.cA.x + gb.rA * Math.cos(aTA), y: gb.cA.y + gb.rA * Math.sin(aTA) }; gb.angA = aTA;
      gb.pB = { x: gb.cB.x + gb.rB * Math.cos(aTB), y: gb.cB.y + gb.rB * Math.sin(aTB) }; gb.angB = aTB;
      gb.fillet = { c: F, r: rhoB, flow: Ab.f === 'O' ? 'A' : 'O' };
    }
    var hits = [];
    for(var j = 0; j < geoms.length; j++){
      var gj = geoms[j];
      if(!gj.pinched && contacts[j].f === contacts[(j + 1) % m].f){
        // The same tangent remains editable across the entire slider range.
        if(gj.fillet || neckAvailable(gj)){
          var hitSeg = gj.fillet ? arcSeg(gj.fillet.r, Math.atan2(gj.pA.y - gj.fillet.c.y, gj.pA.x - gj.fillet.c.x), Math.atan2(gj.pB.y - gj.fillet.c.y, gj.pB.x - gj.fillet.c.x), gj.fillet.flow, gj.pB, false, gj.fillet.c) : { t: 'L', to: gj.pB };
          hits.push({ a: contacts[j].k, b: contacts[(j + 1) % m].k, pA: gj.pA, pB: gj.pB, neck: !!gj.fillet, d: segsToSvg({ start: gj.pA, segs: [hitSeg], closed: false }) });
        }
      }
      if(gj.fillet){
        var fa = gj.fillet;
        segs.push(arcSeg(fa.r, Math.atan2(gj.pA.y - fa.c.y, gj.pA.x - fa.c.x), Math.atan2(gj.pB.y - fa.c.y, gj.pB.x - fa.c.x), fa.flow, gj.pB, false, fa.c));
      } else segs.push({ t: 'L', to: gj.pB });
      var next = geoms[(j + 1) % geoms.length];
      var kB = contacts[(j + 1) % m].k, ndB = (gj.pinched || next.pinched) ? circleNodeOf(kB) : nodeOf(kB);
      walkSegs(ndB, gj.iB || 0, gj.angB, next.iA || 0, next.angA, contacts[(j + 1) % m].f, !!(gj.pinched || next.pinched), next.pA).forEach(function(sg){ segs.push(sg); });
    }
    return { start: geoms[0].pA, closed: true, segs: segs, hits: hits };
  }
  function pairKey(a, b){ return a < b ? a + '|' + b : b + '|' + a; }
  function toggleNeck(c, a, b){
    var k = pairKey(a, b); c.necks = c.necks || [];
    var i = c.necks.indexOf(k);
    if(i >= 0) c.necks.splice(i, 1); else c.necks.push(k);
    return i < 0;
  }
  function contourPath(c){ var sg = contourSegments(c); return sg ? segsToSvg(sg) : ''; }
  function shapePathD(c){
    var d = contourPath(c);
    if(!d) return '';
    holeSegsList(c).forEach(function(sg){ d += ' ' + segsToSvg(sg); });
    return d;
  }
  function fillRule(c){ return 'nonzero'; }
  // Subtract each negative region separately. A combined nonzero/evenodd path
  // refills the overlap of two holes (1 - 1 - 1 != 0), so it is not a union.
  // Intersecting the complements preserves exact arcs and works for SVG hit testing.
  function shapeClipSvg(c){
    var id = 'clip-' + c.id, holes = holeSegsList(c), size = canvasSize();
    var box = 'M-1,-1 H' + (size.W + 1) + ' V' + (size.H + 1) + ' H-1 Z';
    var previous = id + '-outer';
    var defs = '<clipPath clipPathUnits="userSpaceOnUse" id="' + previous + '"><path d="' + contourPath(c) + '"/></clipPath>';
    holes.forEach(function(sg, i){
      var next = i === holes.length - 1 ? id : id + '-' + i;
      defs += '<clipPath clipPathUnits="userSpaceOnUse" id="' + next + '"><path clip-path="url(#' + previous + ')" clip-rule="evenodd" d="' + box + ' ' + segsToSvg(sg) + '"/></clipPath>';
      previous = next;
    });
    return defs;
  }
  function shapeSvg(c, extraAttrs){
    var d = contourPath(c); if(!d) return '';
    var attrs = ' fill="' + state.shapeColor + '" fill-rule="' + fillRule(c) + '"' + (extraAttrs || '');
    if(!hasHoles(c)) return '<path' + attrs + ' d="' + d + '"/>';
    var cid = 'clip-' + c.id;
    var size = canvasSize(), paint = 'M-1,-1 H' + (size.W + 1) + ' V' + (size.H + 1) + ' H-1 Z';
    return shapeClipSvg(c) + '<path' + attrs + ' clip-path="url(#' + cid + ')" d="' + paint + '"/>';
  }
