  var paintStroke=null;
  function scaleAllNodes(value,base){
    var nodes=JSON.parse(JSON.stringify(base.nodes));
    Object.keys(nodes).forEach(function(k){var n=nodes[k];if(typeof n.pct!=='number')return;
      var ratio=typeof n.sizeRatio==='number'?n.sizeRatio:n.pct/(base.defaultPct||100);
      n.sizeRatio=ratio;n.pct=Math.max(0,Math.min(sizeLimit(k),ratio*value));
    });state.nodes=nodes;
  }
  function paintKeyAt(p){
    if(editedLayout())return nodeAt(p,1);
    var i=Math.round((p.y-MARGIN)/rowStep());if(i<0||i>=state.rows)return null;
    var j=Math.round((p.x-MARGIN-(state.offset&&i%2?S/2:0))/S);if(j<0||j>=state.cols)return null;
    var c=center(i,j);return Math.abs(p.x-c.x)<=S/2&&Math.abs(p.y-c.y)<=rowStep()/2?key(i,j):null;
  }
  function beginPaint(e,p){
    finishControlEdit();if(geometryBusy)return;
    paintStroke={pointerId:e.pointerId,before:snapshot(),last:p,want:null,visited:{},changed:false};
    svg.setPointerCapture(e.pointerId);e.preventDefault();paintTo(p);
  }
  function paintTo(p){
    if(!paintStroke)return;var stroke=paintStroke,from=stroke.last,n=Math.max(1,Math.ceil(Math.hypot(p.x-from.x,p.y-from.y)/(S/8)));
    for(var i=0;i<=n;i++){
      var k=paintKeyAt({x:from.x+(p.x-from.x)*i/n,y:from.y+(p.y-from.y)*i/n});if(!k)continue;
      if(stroke.want===null)stroke.want=!(state.nodes[k]&&state.nodes[k].filled);
      mirrorKeys(k).forEach(function(mk){if(stroke.visited[mk])return;stroke.visited[mk]=true;var node=state.nodes[mk]||{filled:false};
        if(!!node.filled!==stroke.want){node.filled=stroke.want;state.nodes[mk]=node;stroke.changed=true;}
      });
    }
    stroke.last=p;scheduleRender();
  }
  function finishPaint(keep){
    if(!paintStroke)return;var stroke=paintStroke;paintStroke=null;
    try{if(svg.hasPointerCapture(stroke.pointerId))svg.releasePointerCapture(stroke.pointerId);}catch(e){}
    if(stroke.changed){if(keep)pushHistory(stroke.before);else restore(stroke.before);}
    scheduleRender();
  }
