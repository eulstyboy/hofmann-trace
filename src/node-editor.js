  var nodeSelection=[],lastNodeTap=null,nodeGesture=null,mergePlan=null,nodeTransaction=null;
  function clipRegion(poly,nx,ny,limit){
    var out=[];for(var i=0;i<poly.length;i++){var a=poly[i],b=poly[(i+1)%poly.length],da=a.x*nx+a.y*ny-limit,db=b.x*nx+b.y*ny-limit;
      if(da<=1e-7)out.push(a);if((da<0)!==(db<0)){var t=da/(da-db);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}}
    return out;
  }
  function moveRegion(k,excluded){
    var c=nodeCenter(k),n=state.nodes[k]||{},home=n.homeX!==undefined?{x:n.homeX,y:n.homeY}:c,nd=nodeOf(k),s=canvasSize(),r=nd.r;
    var poly=[{x:r,y:r},{x:s.W-r,y:r},{x:s.W-r,y:s.H-r},{x:r,y:s.H-r}],planes=[],neighbors=[];
    activeKeys().forEach(function(q){if(excluded.indexOf(q)>=0)return;var other=nodeOf(q),dx=other.c.x-home.x,dy=other.c.y-home.y,d=Math.hypot(dx,dy);if(d<.01)return;
      var nx=dx/d,ny=dy/d,limit=Math.max(other.c.x*nx+other.c.y*ny,c.x*nx+c.y*ny);
      planes.push({x:nx,y:ny,limit:limit});poly=clipRegion(poly,nx,ny,limit);neighbors.push(other);
    });
    // Keep only the final polygon edges and nearby obstacles for pointer frames.
    if(poly.length){
      var xs=poly.map(function(p){return p.x;}),ys=poly.map(function(p){return p.y;}),left=Math.min.apply(null,xs),right=Math.max.apply(null,xs),top=Math.min.apply(null,ys),bottom=Math.max.apply(null,ys);
      neighbors=neighbors.filter(function(other){var reach=other.r+nd.r+3;return other.c.x+reach>=left&&other.c.x-reach<=right&&other.c.y+reach>=top&&other.c.y-reach<=bottom;});
      planes=poly.map(function(a,i){var b=poly[(i+1)%poly.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;return{x:dy/len,y:-dx/len,limit:(a.x*dy-a.y*dx)/len};});
    }
    // Existing touching pixels are movable without forcibly shrinking them.
    var gap=2;neighbors.forEach(function(other){gap=Math.min(gap,Math.max(0,gapNodes(nd,other)));});
    return{k:k,origin:c,nd:nd,poly:poly,planes:planes,neighbors:neighbors,gap:gap};
  }
  function legalPosition(region,p){
    var r=region.nd.r,s=canvasSize();if(p.x<r-1e-5||p.y<r-1e-5||p.x>s.W-r+1e-5||p.y>s.H-r+1e-5)return false;
    if(region.planes.some(function(n){return p.x*n.x+p.y*n.y>n.limit+1e-5;}))return false;
    var nd=Object.assign({},region.nd,{c:p});return region.neighbors.every(function(other){return gapNodes(nd,other)>=region.gap-1e-5;});
  }
  function constrainedStep(region,from,wanted){
    var p={x:wanted.x,y:wanted.y},s=canvasSize(),r=region.nd.r;
    for(var pass=0;pass<5;pass++){
      p.x=Math.max(r,Math.min(s.W-r,p.x));p.y=Math.max(r,Math.min(s.H-r,p.y));
      region.planes.forEach(function(n){var d=p.x*n.x+p.y*n.y-n.limit;if(d>0){p.x-=n.x*d;p.y-=n.y*d;}});
      region.neighbors.forEach(function(other){var nd=Object.assign({},region.nd,{c:p}),gap=gapNodes(nd,other);if(gap>=region.gap)return;
        var dx=p.x-other.c.x,dy=p.y-other.c.y;
        // The normal of the Minkowski sum handles circles and rounded pixels.
        var expanded={c:other.c,e:nd.e+other.e,rho:nd.rho+other.rho,r:nd.r+other.r};var normal=sdfNormal(p,expanded);
        if(Math.hypot(dx,dy)<1e-8)normal={x:1,y:0};p.x+=normal.x*(region.gap-gap+1e-6);p.y+=normal.y*(region.gap-gap+1e-6);
      });
    }
    if(legalPosition(region,p))return p;
    var lo=0,hi=1;for(var i=0;i<18;i++){var t=(lo+hi)/2,q={x:from.x+(p.x-from.x)*t,y:from.y+(p.y-from.y)*t};if(legalPosition(region,q))lo=t;else hi=t;}
    return{x:from.x+(p.x-from.x)*lo,y:from.y+(p.y-from.y)*lo};
  }
  function beginNodeGesture(e,p){
    // Capture the hit before closing a popup can rebuild the SVG scene.
    var hit=e.target&&e.target.closest?e.target.closest('[data-contour]'):null,action=null;
    if(hit){action={id:+hit.getAttribute('data-contour')};if(hit.classList.contains('tan-hit')){action.tangent={};['data-contour','data-cut','data-a','data-b'].forEach(function(attr){action.tangent[attr]=hit.getAttribute(attr);});}}
    closeSizePopup(true);finishControlEdit();if(geometryBusy)return;mergePlan=null;
    if(sizeCopy){beginSizeCopyGesture(e,p);return;}
    if(addPlacement){state.selected=null;tangentFocus=null;beginAddGesture(e,p);return;}
    var initialSelection=nodeSelection.slice(),k=action&&action.tangent?null:nodeAt(p,1.12),add=e.shiftKey;
    var slop=(e.pointerType==='touch'?6:3)*canvasSize().W/camera.zoom/svg.getBoundingClientRect().width;
    if(!k)lastNodeTap=null;
    if(add)lastNodeTap=null;
    // A shape/tangent click acts on release. Dragging from the same place
    // becomes a selection box, and a cancelled touch never changes a neck.
    if(!k&&action&&!add){
      nodeGesture={pointerId:e.pointerId,kind:'surface',start:p,last:p,slop:slop,action:action,initialSelection:initialSelection,initialShape:state.selected,initialTangent:tangentFocus};
      svg.setPointerCapture(e.pointerId);e.preventDefault();return;
    }
    state.selected=null;tangentFocus=null;
    if(k&&add){var at=nodeSelection.indexOf(k);if(at<0)nodeSelection.push(k);else nodeSelection.splice(at,1);render();e.preventDefault();return;}
    var before=snapshot();
    if(k){nodeSelection=[k];var transforms=symmetryTransforms(),entries=[];
      transforms.forEach(function(t){var q=reflectedKey(k,t.v,t.h);if(!q)return;var entry=entries.find(function(n){return n.k===q;});if(entry){if(t.v!==entry.v)entry.lockX=true;if(t.h!==entry.h)entry.lockY=true;return;}entries.push({k:q,v:t.v,h:t.h,c:nodeCenter(q)});});
      var keys=entries.map(function(n){return n.k;});entries.forEach(function(n){n.region=moveRegion(n.k,keys);});
      nodeGesture={pointerId:e.pointerId,kind:'move',start:p,last:p,before:before,entries:entries,changed:false,initialSelection:initialSelection,pointerType:e.pointerType,tapKey:k,slop:e.pointerType==='touch'?6*canvasSize().W/camera.zoom/svg.getBoundingClientRect().width:2};
      if(e.pointerType==='touch'){var held=nodeGesture;held.holdTimer=setTimeout(function(){
        if(nodeGesture!==held||held.changed)return;held.kind='toggle';held.fastDOM=false;lastNodeTap=null;nodeSelection=held.initialSelection.slice();var index=nodeSelection.indexOf(k);if(index<0)nodeSelection.push(k);else nodeSelection.splice(index,1);sceneSignature=null;overlayHTML=null;render();setStatus('Added to selection. Drag empty space to select an area; double-tap a circle for size.');
      },450);}
    }else{nodeGesture={pointerId:e.pointerId,kind:'box',start:p,last:p,initial:add?nodeSelection.slice():[]};if(!add)nodeSelection=[];}
    svg.setPointerCapture(e.pointerId);e.preventDefault();render();
    if(nodeGesture.kind==='move')cacheMovingElements(nodeGesture);
  }
  function moveNodeGesture(p){
    var g=nodeGesture;if(!g)return;g.last=p;
    if(g.kind==='add'){updateAddPreview(p);return;}
    if(g.kind==='size-copy'){if(Math.hypot(p.x-g.start.x,p.y-g.start.y)>g.slop)g.cancelled=true;return;}
    if(g.kind==='toggle')return;
    if(g.kind==='surface'){
      if(Math.hypot(p.x-g.start.x,p.y-g.start.y)<=g.slop)return;
      g.kind='box';g.initial=[];nodeSelection=[];state.selected=null;tangentFocus=null;
    }
    if(g.holdTimer&&Math.hypot(p.x-g.start.x,p.y-g.start.y)>g.slop){clearTimeout(g.holdTimer);g.holdTimer=null;}
    if(g.kind==='box'){
      nodeSelection=uniq(g.initial.concat(activeKeys().filter(function(k){var c=nodeCenter(k);return c.x>=Math.min(p.x,g.start.x)&&c.x<=Math.max(p.x,g.start.x)&&c.y>=Math.min(p.y,g.start.y)&&c.y<=Math.max(p.y,g.start.y);})));scheduleRender();return;
    }
    if(!g.changed&&Math.hypot(p.x-g.start.x,p.y-g.start.y)<g.slop)return;
    var primary=g.entries[0],current=nodeCenter(primary.k),target={x:primary.c.x+p.x-g.start.x,y:primary.c.y+p.y-g.start.y};
    if(primary.lockX)target.x=primary.c.x;if(primary.lockY)target.y=primary.c.y;
    var steps=Math.max(1,Math.ceil(Math.hypot(target.x-current.x,target.y-current.y)/2)),pos=current;
    for(var step=1;step<=steps;step++){
      var dx=target.x-pos.x,dy=target.y-pos.y,distance=Math.hypot(dx,dy),fraction=Math.min(1,2/(distance||1));
      var wanted={x:pos.x+dx*fraction,y:pos.y+dy*fraction};
      var next=constrainedStep(primary.region,pos,wanted);
      // Check every mirrored counterpart together, including collisions between them.
      function valid(candidate){var moved=g.entries.map(function(n){return{n:n,p:{x:n.c.x+(n.v?-1:1)*(candidate.x-primary.c.x),y:n.c.y+(n.h?-1:1)*(candidate.y-primary.c.y)}};});
        return moved.every(function(m,i){return (!m.n.lockX||Math.abs(m.p.x-m.n.c.x)<1e-6)&&(!m.n.lockY||Math.abs(m.p.y-m.n.c.y)<1e-6)&&legalPosition(m.n.region,m.p)&&moved.every(function(b,j){if(j<=i)return true;return gapNodes(Object.assign({},m.n.region.nd,{c:m.p}),Object.assign({},b.n.region.nd,{c:b.p}))>=-1e-5;});});}
      if(!valid(next)){var lo=0,hi=1;for(var it=0;it<16;it++){var t=(lo+hi)/2;if(valid({x:pos.x+(next.x-pos.x)*t,y:pos.y+(next.y-pos.y)*t}))lo=t;else hi=t;}next={x:pos.x+(next.x-pos.x)*lo,y:pos.y+(next.y-pos.y)*lo};}
      pos=next;
    }
    if(Math.hypot(pos.x-current.x,pos.y-current.y)<1e-7)return;
    g.entries.forEach(function(n){var data=state.nodes[n.k]||{};if(data.homeX===undefined){data.homeX=n.c.x;data.homeY=n.c.y;}data.x=n.c.x+(n.v?-1:1)*(pos.x-primary.c.x);data.y=n.c.y+(n.h?-1:1)*(pos.y-primary.c.y);state.nodes[n.k]=data;});
    g.changed=true;geometryRevision++;maskCache={};maskCacheN=0;invalidateTrace();scheduleRender();
  }
  function finishNodeGesture(keep,released){
    if(!nodeGesture)return;var g=nodeGesture;nodeGesture=null;
    sceneSignature=null;sceneHTML=null;overlayHTML=null;if(g.holdTimer)clearTimeout(g.holdTimer);
    try{if(svg.hasPointerCapture(g.pointerId))svg.releasePointerCapture(g.pointerId);}catch(e){}
    if(g.kind==='add'){if(keep)placeAddedNodes(g.last);else addPreview=null;scheduleRender();return;}
    if(g.kind==='size-copy'){if(keep&&released&&!g.cancelled)useSizeCopy(g.k);render();return;}
    if(g.kind==='surface'){
      if(keep&&released){selectShape(g.action.id);if(g.action.tangent)clickTangent({getAttribute:function(attr){return g.action.tangent[attr];}});}
      render();return;
    }
    if(g.kind==='box'&&!keep){nodeSelection=g.initialSelection||g.initial;if(g.action){state.selected=g.initialShape;tangentFocus=g.initialTangent;}}
    if(g.kind==='toggle'&&!keep)nodeSelection=g.initialSelection;
    if(g.kind==='move'&&!g.changed&&keep){var now=performance.now();if(lastNodeTap&&lastNodeTap.k===g.tapKey&&now-lastNodeTap.time<350){lastNodeTap=null;openSizePopup(g.tapKey);}else lastNodeTap={k:g.tapKey,time:now};}
    else if(g.kind==='move')lastNodeTap=null;
    if(g.kind==='move'&&g.changed){
      if(keep){var base=JSON.parse(JSON.stringify(state));base.contours=JSON.parse(g.before).contours;performNodeEdit(base,{},g.before,g.entries.map(function(n){return n.k;}),'Circle moved.');}
      else restore(g.before);
    }
    // Restore tangent hit targets before another pointerdown can arrive.
    // A pending drag frame must not leave the scene in its editing state.
    if(raf){cancelAnimationFrame(raf);raf=null;}render();
  }
  async function performNodeEdit(base,mapping,before,selection,message){
    if(nodeTransaction)return;var token={before:before};nodeTransaction=token;geometryRevision++;invalidateTrace();
    var previousNodes=JSON.parse(before).nodes;
    var result=await runGeometry('layout',{mapping:mapping,keys:uniq(changedNodeKeys(previousNodes,base.nodes).concat(Object.keys(mapping))),previousNodes:previousNodes},base);
    if(nodeTransaction!==token)return;nodeTransaction=null;
    if(result&&!result.error){pushHistory(before);nodeSelection=selection.filter(nodeActive);lastNodeTap=null;mergePlan=null;state.selected=null;setStatus(message);}
    else{restore(before);mergePlan=null;setStatus('This edit could not be completed. The previous drawing has been restored.');}
    render();
  }
  function deleteNodes(){
    finishNodeGesture(true);closeSizePopup(true);if(geometryBusy||!nodeSelection.length)return;
    var keys=uniq(nodeSelection.flatMap(mirrorKeys)),before=snapshot(),base=JSON.parse(JSON.stringify(state)),mapping={};
    keys.forEach(function(k){base.nodes[k]=Object.assign({},base.nodes[k],{disabled:true,filled:false});mapping[k]=null;});
    performNodeEdit(base,mapping,before,[],'Circles removed from the grid and from shape collisions. Undo restores them.');
  }
  function proposeMerge(){
    closeSizePopup(true);if(geometryBusy||nodeSelection.length<2)return;
    var groups=[];
    symmetryTransforms().forEach(function(t){var keys=nodeSelection.map(function(k){return reflectedKey(k,t.v,t.h);}).filter(Boolean);if(keys.length===nodeSelection.length)groups.push(uniq(keys));});
    // Selections crossing a mirror axis form one shared circle.
    for(var i=0;i<groups.length;i++)for(var j=i+1;j<groups.length;j++)if(groups[i].some(function(k){return groups[j].indexOf(k)>=0;})){groups[i]=uniq(groups[i].concat(groups[j]));groups.splice(j,1);i=-1;break;}
    var removed=uniq(groups.flat()),others=activeKeys().filter(function(k){return removed.indexOf(k)<0;}).map(nodeOf),s=canvasSize();
    var circles=groups.map(function(keys){var x=0,y=0,left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
      keys.forEach(function(k){var c=nodeCenter(k),r=trueRadius(k);x+=c.x;y+=c.y;left=Math.min(left,c.x-r);right=Math.max(right,c.x+r);top=Math.min(top,c.y-r);bottom=Math.max(bottom,c.y+r);});x/=keys.length;y/=keys.length;
      var desired=(right-left+bottom-top)/4,cap=Math.min(x,y,s.W-x,s.H-y),position={x:x,y:y};
      others.forEach(function(other){
        if(gapNodes(nodeGeomR(position,cap),other)>=TOUCH)return;
        var lo=0,hi=cap;for(var it=0;it<24;it++){var mid=(lo+hi)/2;if(gapNodes(nodeGeomR(position,mid),other)>=TOUCH)lo=mid;else hi=mid;}cap=lo;
      });
      return{keys:keys,k:keys[0],x:x,y:y,desired:desired,cap:cap,r:Math.min(desired,cap)};
    });
    circles.forEach(function(a,i){circles.slice(i+1).forEach(function(b){
      var lo=0,hi=Math.min(a.cap,b.cap);for(var it=0;it<24;it++){var mid=(lo+hi)/2;if(gapNodes(nodeGeomR({x:a.x,y:a.y},mid),nodeGeomR({x:b.x,y:b.y},mid))>=TOUCH)lo=mid;else hi=mid;}
      a.cap=Math.min(a.cap,lo);b.cap=Math.min(b.cap,lo);a.r=Math.min(a.r,a.cap);b.r=Math.min(b.r,b.cap);
    });});
    if(circles.some(function(c){return c.cap<1;})){setStatus('A neighbouring circle occupies the centre of this selection. Include it in the selection, or move it first.');return;}
    mergePlan={circles:circles,bevel:bevel(),scale:1,max:Math.min.apply(null,circles.map(function(c){return c.cap/c.r;}))};
    applyMerge();
  }
  function applyMerge(){
    if(mergePlan&&mergePlan.bevel!==bevel()){proposeMerge();return;}
    if(!mergePlan||geometryBusy)return;var before=snapshot(),base=JSON.parse(JSON.stringify(state)),mapping={},selection=[];
    mergePlan.circles.forEach(function(c){var filled=c.keys.some(function(k){return base.nodes[k]&&base.nodes[k].filled;});
      c.keys.forEach(function(k){base.nodes[k]=Object.assign({},base.nodes[k],{disabled:true,filled:false});mapping[k]=c.k;});
      var pct=c.r*mergePlan.scale/(S/2)*100;base.nodes[c.k]={x:c.x,y:c.y,homeX:c.x,homeY:c.y,pct:pct,sizeRatio:pct/(state.defaultPct||100),fused:true,filled:filled};selection.push(c.k);
    });mergePlan=null;performNodeEdit(base,mapping,before,selection,'Circles fused. Drag to move; double-click / double-tap for size.');
  }
  function nodeEditorOverlay(){
    if(state.tool!=='select')return '';if(sizeCopy)return sizeCopyOverlay();var out=[addPreviewSvg()];
    var region=nodeGesture&&nodeGesture.kind==='move'?nodeGesture.entries[0].region:(nodeSelection.length===1&&!mergePlan?moveRegion(nodeSelection[0],mirrorKeys(nodeSelection[0])):null);
    if(region&&region.poly.length){
      var poly=region.poly.map(function(p){return fmt(p.x)+','+fmt(p.y);}).join(' ');
      out.push('<defs><mask id="move-space" maskUnits="userSpaceOnUse" x="0" y="0" width="'+canvasSize().W+'" height="'+canvasSize().H+'"><polygon points="'+poly+'" fill="white"/>');
      region.neighbors.forEach(function(n){var e=n.e+region.nd.e,rho=n.rho+region.nd.rho+region.gap,r=e+rho;out.push('<rect x="'+fmt(n.c.x-r)+'" y="'+fmt(n.c.y-r)+'" width="'+fmt(2*r)+'" height="'+fmt(2*r)+'" rx="'+fmt(rho)+'" fill="black"/>');});
      out.push('</mask></defs><polygon points="'+poly+'" fill="#268cff" fill-opacity=".13" mask="url(#move-space)"/>');
    }
    nodeSelection.filter(nodeActive).forEach(function(k){var c=nodeCenter(k);out.push('<g data-selected-node="'+k+'"><path d="'+segsToSvg(circleSegs(k))+'" fill="#268cff" fill-opacity=".1" stroke="#268cff" stroke-width="1.5"/><circle cx="'+fmt(c.x)+'" cy="'+fmt(c.y)+'" r="2.3" fill="#268cff"/></g>');});
    if(nodeGesture&&nodeGesture.kind==='box'){var a=nodeGesture.start,b=nodeGesture.last;out.push('<rect x="'+fmt(Math.min(a.x,b.x))+'" y="'+fmt(Math.min(a.y,b.y))+'" width="'+fmt(Math.abs(a.x-b.x))+'" height="'+fmt(Math.abs(a.y-b.y))+'" fill="#268cff" fill-opacity=".08" stroke="#268cff" stroke-dasharray="4 3"/>');}
    return out.join('');
  }
  function syncNodeEditor(){
    wrap.classList.toggle('node-editing',state.tool==='select');
    nodeSelection=nodeSelection.filter(nodeActive);$('nodeTools').hidden=state.tool!=='select'||!!sizeEdit||state.selected!==null;
    $('nodeCount').textContent=sizeCopy?(sizeCopy.pct===null?'Pick size':Math.round(sizeCopy.pct*10)/10+' %'):addPlacement?'Click to place':nodeSelection.length+' selected';$('nodeAdd').setAttribute('aria-pressed',String(addPlacement));
    $('nodeMerge').disabled=geometryBusy||nodeSelection.length<2;$('nodeDelete').disabled=geometryBusy||!nodeSelection.length;$('nodeAdd').disabled=geometryBusy;
    $('nodePickSize').setAttribute('aria-pressed',String(!!sizeCopy));$('nodePickSize').disabled=geometryBusy;$('nodeMerge').disabled=geometryBusy||!!sizeCopy||nodeSelection.length<2;
    if(state.tool==='select')svg.style.cursor=addPlacement||sizeCopy?'crosshair':nodeGesture&&nodeGesture.kind==='move'?'grabbing':'default';
  }
  $('nodeAdd').addEventListener('click',toggleAddPlacement);
  svg.addEventListener('pointerleave',function(){if(addPlacement&&!nodeGesture){addPreview=null;scheduleRender();}});
  svg.addEventListener('contextmenu',function(e){if(state.tool==='select')e.preventDefault();});
  $('nodeDelete').addEventListener('click',deleteNodes);$('nodeMerge').addEventListener('click',proposeMerge);
  function cacheMovingElements(g){
    var keys=g.entries.map(function(n){return n.k;});
    g.elements=g.entries.map(function(n){return{entry:n,elements:['data-node','data-guide','data-filled','data-selected-node'].flatMap(function(attr){return Array.from(svg.querySelectorAll('['+attr+'="'+n.k+'"]'));})};});
    g.artwork=state.contours.filter(function(c){return [c].concat(c.cuts||[]).some(function(part){return contourKeys(part).concat(part.holes||[]).some(function(k){return keys.indexOf(k)>=0;});});}).map(function(c){return{contour:c,element:svg.querySelector('[data-artwork="'+c.id+'"]')};});
    g.fastDOM=true;
  }
  function renderMovingElements(g){
    g.elements.forEach(function(item){var p=nodeCenter(item.entry.k),transform='translate('+fmt(p.x-item.entry.c.x)+','+fmt(p.y-item.entry.c.y)+')';item.elements.forEach(function(el){el.setAttribute('transform',transform);});});
    g.artwork.forEach(function(item){if(item.element)item.element.innerHTML=shapeSvg(item.contour,' class="shape" data-contour="'+item.contour.id+'"');});
    svg.style.cursor='grabbing';
  }
