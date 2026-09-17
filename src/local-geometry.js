  var localGeometryInfo=null;
  function changedNodeKeys(before,after){
    return uniq(Object.keys(before).concat(Object.keys(after))).filter(function(k){
      var a=before[k]||{},b=after[k]||{};
      return ['x','y','pct','disabled'].some(function(field){return a[field]!==b[field];})||isFreeKey(k)&&(!before[k]!==!after[k]);
    });
  }
  function geometryBox(){return{left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};}
  function growGeometryBox(box,x,y,r){
    if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(r))throw new Error('Invalid local geometry bounds');
    box.left=Math.min(box.left,x-r);box.right=Math.max(box.right,x+r);box.top=Math.min(box.top,y-r);box.bottom=Math.max(box.bottom,y+r);return box;
  }
  function boxesMeet(a,b){return a.left<=b.right+4&&a.right+4>=b.left&&a.top<=b.bottom+4&&a.bottom+4>=b.top;}
  function contourBox(c,box){
    box=box||geometryBox();
    var sg=contourSegments(c);if(!sg)throw new Error('Missing contour bounds');
    growGeometryBox(box,sg.start.x,sg.start.y,0);
    sg.segs.forEach(function(g){growGeometryBox(box,g.to.x,g.to.y,0);if(g.t==='A')growGeometryBox(box,g.c.x,g.c.y,g.r);});
    // Whole arc circles deliberately overestimate the box; no sampling can
    // miss a curved extremum. Include cuts and interior support changes too.
    [c].concat(c.cuts||[]).forEach(function(part){
      contourKeys(part).concat(memberKeys(part),part.holes||[],part.notches||[],part.soft||[],part.solo||[]).forEach(function(k){var n=nodeOf(k);growGeometryBox(box,n.c.x,n.c.y,n.r);});
    });return box;
  }
  function runLocalGeometry(job){
    var original=state.contours,originalNext=state.nextId,keys=job.keys||[],total=original.length;
    function compute(){if(job.type==='layout')repairNodeContours(job.mapping||{});else settleSync(null);}
    function full(reason){state.contours=JSON.parse(JSON.stringify(original));state.nextId=originalNext;compute();localGeometryInfo={mode:'full',total:total,affected:total,skipped:0,reason:reason};}
    if(!job.previousNodes||!Array.isArray(job.keys)){full('global');return;}
    var bounds=original.map(function(){return geometryBox();}),sweeps=keys.map(function(){return geometryBox();}),currentNodes=state.nodes;
    try{
      [job.previousNodes,currentNodes].forEach(function(nodes){
        state.nodes=nodes;
        original.forEach(function(c,i){contourBox(c,bounds[i]);});
        keys.forEach(function(k,i){if(isFreeKey(k)&&!nodes[k])return;var n=nodeOf(k);growGeometryBox(sweeps[i],n.c.x,n.c.y,n.r);});
      });
    }catch(error){state.nodes=currentNodes;full('bounds');return;}finally{state.nodes=currentNodes;}
    var selected=new Set();
    original.forEach(function(c,i){
      var referenced=[c].concat(c.cuts||[]).some(function(part){return contourKeys(part).concat(memberKeys(part),part.holes||[],part.notches||[],part.soft||[],part.solo||[]).some(function(k){return keys.indexOf(k)>=0;});});
      if(referenced||sweeps.some(function(b){return boxesMeet(bounds[i],b);}))selected.add(i);
    });
    function includeNeighbours(extra){
      var grew=true;while(grew){grew=false;original.forEach(function(c,i){if(selected.has(i))return;
        if((extra||[]).some(function(b){return boxesMeet(bounds[i],b);})||Array.from(selected).some(function(j){return boxesMeet(bounds[i],bounds[j]);})){selected.add(i);grew=true;}
      });}
    }
    includeNeighbours();
    for(var attempt=0;attempt<4;attempt++){
      if(selected.size===total&&total){full('connected');return;}
      state.nextId=originalNext;
      state.contours=JSON.parse(JSON.stringify(original.filter(function(c,i){return selected.has(i);})));
      if(selected.size)compute();
      var result=state.contours,count=selected.size;
      try{includeNeighbours(result.map(function(c){return contourBox(c);}));}catch(error){full('expanded bounds');return;}
      if(selected.size!==count)continue;
      var out=[],inserted=false;original.forEach(function(c,i){
        if(selected.has(i)){if(!inserted){out=out.concat(result);inserted=true;}}else out.push(c);
      });state.contours=out;
      localGeometryInfo={mode:'targeted',total:total,affected:count,skipped:total-count,passes:attempt+1};return;
    }
    full('expansion');
  }
