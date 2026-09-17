  var addPlacement=false,addPreview=null;
  function cancelAddPlacement(){addPlacement=false;addPreview=null;}
  function toggleAddPlacement(){
    sizeCopy=null;
    finishNodeGesture(true);finishControlEdit();closeSizePopup(true);if(geometryBusy)return;
    addPlacement=!addPlacement;addPreview=null;mergePlan=null;nodeSelection=[];lastNodeTap=null;
    setStatus(addPlacement?'Add: click an empty space to place a circle. Escape cancels.':'Select: Shift-click or touch and hold for multiple selection.');render();
  }
  function availableFreeKeys(count){
    var keys=[];for(var i=1;i<=900&&keys.length<count;i++){var k=key(-1,i);if(!state.nodes[k]||state.nodes[k].disabled)keys.push(k);}return keys;
  }
  function planAddedNodes(point){
    var size=canvasSize(),points=[],wanted=Math.max(3,state.defaultPct*S/200);
    point={x:point.x,y:point.y};
    if(symOn()){
      if((state.sym==='v'||state.sym==='both')&&Math.abs(point.x-size.W/2)<.01)point.x=size.W/2;
      if((state.sym==='h'||state.sym==='both')&&Math.abs(point.y-size.H/2)<.01)point.y=size.H/2;
    }
    if(point.x<0||point.y<0||point.x>size.W||point.y>size.H)return{valid:false,points:[],message:'Place the circle inside the canvas.'};
    symmetryTransforms().forEach(function(t){var p={x:t.v?size.W-point.x:point.x,y:t.h?size.H-point.y:point.y};if(!points.some(function(q){return Math.hypot(p.x-q.x,p.y-q.y)<.01;}))points.push(p);});
    var others=activeKeys().map(nodeOf),cap=wanted;
    points.forEach(function(p){cap=Math.min(cap,p.x,p.y,size.W-p.x,size.H-p.y);
      others.forEach(function(other){if(gapNodes(nodeGeomR(p,cap),other)>=TOUCH)return;var lo=0,hi=cap;
        for(var i=0;i<24;i++){var mid=(lo+hi)/2;if(gapNodes(nodeGeomR(p,mid),other)>=TOUCH)lo=mid;else hi=mid;}cap=lo;
      });
    });
    points.forEach(function(p,i){points.slice(i+1).forEach(function(q){var lo=0,hi=cap;
      for(var n=0;n<24;n++){var mid=(lo+hi)/2;if(gapNodes(nodeGeomR(p,mid),nodeGeomR(q,mid))>=TOUCH)lo=mid;else hi=mid;}cap=lo;
    });});
    var keys=availableFreeKeys(points.length),valid=cap>=1&&keys.length===points.length;
    return{valid:valid,points:points,r:valid?cap:wanted,keys:keys,message:keys.length<points.length?'The canvas already has 900 added circles. Remove one to make room.':'Not enough room here. Try another position, reduce a neighbour, or remove it.'};
  }
  function updateAddPreview(p){addPreview=planAddedNodes(p);scheduleRender();}
  function beginAddGesture(e,p){
    nodeGesture={pointerId:e.pointerId,kind:'add',start:p,last:p};updateAddPreview(p);svg.setPointerCapture(e.pointerId);e.preventDefault();render();
  }
  function placeAddedNodes(p){
    if(geometryBusy)return;var plan=planAddedNodes(p);addPreview=plan;
    if(!plan.valid){setStatus(plan.message);render();return;}
    var before=snapshot(),base=JSON.parse(JSON.stringify(state)),pct=plan.r/(S/2)*100;
    plan.points.forEach(function(p,i){base.nodes[plan.keys[i]]={x:p.x,y:p.y,homeX:p.x,homeY:p.y,pct:pct,sizeRatio:pct/(state.defaultPct||100),filled:false};});
    cancelAddPlacement();performNodeEdit(base,{},before,plan.keys,'Circle added. Drag to move; double-click / double-tap for size.');
  }
  function addPreviewSvg(){
    if(!addPlacement||!addPreview)return '';var color=addPreview.valid?'#268cff':'#ed6a6a',r=addPreview.r;
    return addPreview.points.map(function(p){return '<rect data-add-preview="true" x="'+fmt(p.x-r)+'" y="'+fmt(p.y-r)+'" width="'+fmt(2*r)+'" height="'+fmt(2*r)+'" rx="'+fmt(bevel()*r)+'" fill="'+color+'" fill-opacity=".15" stroke="'+color+'" stroke-width="1.5" stroke-dasharray="4 3"/>';}).join('');
  }
