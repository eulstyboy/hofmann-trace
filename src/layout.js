  // Grid keys remain stable when a circle is moved, fused or removed.
  function isFreeKey(k){return typeof k==='string'&&/^-1_[1-9]\d{0,2}$/.test(k)&&parseKey(k).j<=900;}
  function hasFreeNodes(){return Object.keys(state.nodes).some(isFreeKey);}
  function nodeActive(k){var n=state.nodes[k];return (!isFreeKey(k)||!!n)&&!(n&&n.disabled);}
  function activeKeys(){var out=[];for(var i=0;i<state.rows;i++)for(var j=0;j<state.cols;j++){var k=key(i,j);if(nodeActive(k))out.push(k);}return out.concat(Object.keys(state.nodes).filter(function(k){return isFreeKey(k)&&nodeActive(k);}));}
  function gridCenter(i,j){return{x:MARGIN+j*S+(state.offset&&i%2===1?S/2:0),y:MARGIN+i*rowStep()};}
  function nodeCenter(k){var p=parseKey(k);return center(p.i,p.j);}
  // Fusion changes a node's size and position, not its corner-rounding rule.
  function nodeGeomFor(k,c,r){return nodeGeomR(c,r);}
  function editedLayout(){return Object.keys(state.nodes).some(function(k){var n=state.nodes[k];return n.disabled||n.x!==undefined||n.fused;});}
  function sizeLimit(k){return isFreeKey(k)||(state.nodes[k]&&state.nodes[k].fused)?6200:150;}
  function reflectedKey(k,v,h){
    if(!v&&!h)return nodeActive(k)?k:null;
    if(!editedLayout()){var p=parseKey(k);return key(h?state.rows-1-p.i:p.i,v?state.cols-1-p.j:p.j);}
    var c=nodeCenter(k),s=canvasSize(),x=v?s.W-c.x:c.x,y=h?s.H-c.y:c.y;
    return activeKeys().find(function(q){var p=nodeCenter(q);return Math.hypot(p.x-x,p.y-y)<.1;})||null;
  }
  function symmetryTransforms(){var out=[{v:false,h:false}];if(symOn()){if(state.sym==='v'||state.sym==='both')out.push({v:true,h:false});if(state.sym==='h'||state.sym==='both')out.push({v:false,h:true});if(state.sym==='both')out.push({v:true,h:true});}return out;}
  // Repair the support chain before relaxing it: removed circles must never
  // survive as invisible pegs, including inside negative contours and necks.
  function repairNodeContours(mapping){
    function mapped(k){var q=Object.prototype.hasOwnProperty.call(mapping,k)?mapping[k]:k;return q&&nodeActive(q)?q:null;}
    function list(a){return uniq((a||[]).map(mapped).filter(Boolean));}
    function repair(c,exclude){
      exclude=Array.isArray(exclude)?exclude:[];
      var old=chainOf(c),chain=[];
      c.members=list(memberKeys(c)).filter(function(k){return exclude.indexOf(k)<0;});
      ['holes','notches','soft','solo'].forEach(function(f){c[f]=list(c[f]).filter(function(k){return c.members.indexOf(k)<0;});});
      c.necks=uniq((c.necks||[]).map(function(pair){var p=pair.split('|'),a=mapped(p[0]),b=mapped(p[1]);return a&&b&&a!==b?pairKey(a,b):null;}).filter(Boolean));
      c.cuts=(c.cuts||[]).filter(function(part){return repair(part,c.members);});
      if(!c.members.length)return false;
      old.forEach(function(item){var k=mapped(item.k);if(!k)return;var flow=item.f;
        if(chain.length&&chain[chain.length-1].k===k){if(flow==='O')chain[chain.length-1].f='O';return;}chain.push({k:k,f:flow});});
      if(chain.length>1&&chain[0].k===chain[chain.length-1].k)chain.pop();
      // A fusion spanning several lobes may repeat a support. Rebuild a simple
      // seed around its remaining members rather than keeping a crossing chain.
      var repeated=uniq(chain.map(function(n){return n.k;})).length!==chain.length;
      if(!chain.length||repeated){
        var points=[];c.members.forEach(function(k){var nd=nodeHit(k);for(var a=0;a<16;a++){var t=a*TAU/16;points.push({x:nd.c.x+(nd.r+1)*Math.cos(t),y:nd.c.y+(nd.r+1)*Math.sin(t)});}});
        points.sort(function(a,b){return a.x-b.x||a.y-b.y;});
        function cross(a,b,c){return(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
        var lo=[],hi=[];points.forEach(function(p){while(lo.length>1&&cross(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p);});
        points.slice().reverse().forEach(function(p){while(hi.length>1&&cross(hi[hi.length-2],hi[hi.length-1],p)<=0)hi.pop();hi.push(p);});
        var loop=lo.slice(0,-1).concat(hi.slice(0,-1));setObstacles(c.members,false,[],c.holes.concat(cutMemberKeys(c)));
        var built=buildContour(elRelax(loop,1800),c.members);activeObstacles=null;
        if(!built)throw new Error('Could not rebuild the edited support chain');chain=chainOf(built);
      }
      delete c.single;c.tangents=[];
      if(chain.length===1)c.single=chain[0].k;else c.tangents=tangentsFromChain(chain);
      return !!(c.single||c.tangents.length);
    }
    state.contours=state.contours.filter(repair);maskCache={};maskCacheN=0;
    settleSync(null);
  }
