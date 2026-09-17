  // Analytic boundary arrangement: split lines/arcs at intersections, retain
  // only edges separating filled from empty space, then stitch closed contours.
  // No raster tracing or curve flattening is used for the merged SVG export.
  function mergedSvgString(withBg){
    var edges=[],regions=[],solid=[],epsilon=1e-7,size=canvasSize();
    function mod(a){return(a%TAU+TAU)%TAU;}
    function exactInside(sg){
      // Double-precision winding avoids the float precision of canvas hit tests
      // near shared tangents and very narrow gaps. Each arc is monotone in y.
      var pieces=[],from=sg.start;
      sg.segs.forEach(function(g){
        if(g.t==='L')pieces.push({a:from,b:g.to});
        else{
          var delta=(g.flow==='O'?1:-1)*(g.full?TAU:mod(g.flow==='O'?g.aOut-g.aIn:g.aIn-g.aOut)),ts=[0,1];
          [Math.PI/2,3*Math.PI/2].forEach(function(angle){var t=mod(delta>0?angle-g.aIn:g.aIn-angle)/Math.abs(delta);if(t>1e-10&&t<1-1e-10)ts.push(t);});
          ts.sort(function(a,b){return a-b;});
          function pt(t){return{x:g.c.x+g.r*Math.cos(g.aIn+delta*t),y:g.c.y+g.r*Math.sin(g.aIn+delta*t)};}
          for(var i=1;i<ts.length;i++)pieces.push({a:i===1?from:pt(ts[i-1]),b:i===ts.length-1?g.to:pt(ts[i]),c:g.c,r:g.r,side:Math.cos(g.aIn+delta*(ts[i-1]+ts[i])/2)>=0?1:-1});
        }
        from=g.to;
      });
      if(Math.hypot(from.x-sg.start.x,from.y-sg.start.y)>1e-8)pieces.push({a:from,b:sg.start});
      return function(x,y){
        var winding=0;
        for(var i=0;i<pieces.length;i++){var p=pieces[i];if((p.a.y>y)===(p.b.y>y))continue;
          var xx=p.c?p.c.x+p.side*Math.sqrt(Math.max(0,p.r*p.r-(y-p.c.y)*(y-p.c.y))):p.a.x+(y-p.a.y)/(p.b.y-p.a.y)*(p.b.x-p.a.x);
          if(xx>x)winding+=p.b.y>p.a.y?1:-1;
        }
        return winding!==0;
      };
    }
    function addSegments(sg){
      if(!sg)return;var from=sg.start;
      sg.segs.forEach(function(g){
        var e={type:g.t,a:from,b:g.to,c:g.c,r:g.r,splits:[0,1]};
        if(g.t==='A'){e.angle=g.aIn;e.delta=(g.flow==='O'?1:-1)*(g.full?TAU:mod(g.flow==='O'?g.aOut-g.aIn:g.aIn-g.aOut));if(g.full)e.splits.push(.5);}
        if(g.t==='A'||Math.hypot(e.a.x-e.b.x,e.a.y-e.b.y)>epsilon)edges.push(e);from=g.to;
      });
    }
    state.contours.forEach(function(c){
      var sg=contourSegments(c);if(!sg)return;
      var holes=holeSegsList(c);regions.push({outer:exactInside(sg),holes:holes.map(exactInside)});
      addSegments(sg);holes.forEach(addSegments);
    });
    Object.keys(state.nodes).forEach(function(k){if(state.nodes[k].filled){var sg=circleSegs(k);solid.push(exactInside(sg));addSegments(sg);}});
    function filled(p){return solid.some(function(f){return f(p.x,p.y);})||regions.some(function(r){return r.outer(p.x,p.y)&&!r.holes.some(function(h){return h(p.x,p.y);});});}
    function at(e,t){if(t===0)return e.a;if(t===1)return e.b;return e.type==='L'?{x:e.a.x+(e.b.x-e.a.x)*t,y:e.a.y+(e.b.y-e.a.y)*t}:{x:e.c.x+e.r*Math.cos(e.angle+e.delta*t),y:e.c.y+e.r*Math.sin(e.angle+e.delta*t)};}
    function parameter(e,p){
      if(e.type==='L'){var dx=e.b.x-e.a.x,dy=e.b.y-e.a.y;return((p.x-e.a.x)*dx+(p.y-e.a.y)*dy)/(dx*dx+dy*dy);}
      var a=Math.atan2(p.y-e.c.y,p.x-e.c.x),d=e.delta>0?mod(a-e.angle):mod(e.angle-a);
      if(TAU-d<epsilon)d=0;return d/Math.abs(e.delta);
    }
    function split(e,p){var t=parameter(e,p);if(t>=-epsilon&&t<=1+epsilon)e.splits.push(t<epsilon?0:t>1-epsilon?1:t);}
    function meet(e,f,p){var t=parameter(e,p),u=parameter(f,p);if(t>=-epsilon&&t<=1+epsilon&&u>=-epsilon&&u<=1+epsilon){split(e,p);split(f,p);}}
    function cross(a,b){return a.x*b.y-a.y*b.x;}
    function intersections(e,f){
      if(e.type==='L'&&f.type==='L'){
        var v={x:e.b.x-e.a.x,y:e.b.y-e.a.y},w={x:f.b.x-f.a.x,y:f.b.y-f.a.y},d={x:f.a.x-e.a.x,y:f.a.y-e.a.y},det=cross(v,w);
        if(Math.abs(det)>epsilon){var t=cross(d,w)/det,u=cross(d,v)/det;if(t>=-epsilon&&t<=1+epsilon&&u>=-epsilon&&u<=1+epsilon)meet(e,f,at(e,t));}
        else if(Math.abs(cross(d,v))<epsilon){[e.a,e.b,f.a,f.b].forEach(function(p){meet(e,f,p);});}return;
      }
      if(e.type==='A'&&f.type==='L'){intersections(f,e);return;}
      if(e.type==='L'){
        var dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,px=e.a.x-f.c.x,py=e.a.y-f.c.y,A=dx*dx+dy*dy,B=2*(px*dx+py*dy),C=px*px+py*py-f.r*f.r,D=B*B-4*A*C;
        if(D<-epsilon)return;D=Math.sqrt(Math.max(0,D));[-1,1].forEach(function(s){var t=(-B+s*D)/(2*A);if(t>=-epsilon&&t<=1+epsilon)meet(e,f,at(e,t));});return;
      }
      var dx=f.c.x-e.c.x,dy=f.c.y-e.c.y,d=Math.hypot(dx,dy);
      if(d<epsilon){if(Math.abs(e.r-f.r)<epsilon)[e.a,e.b,f.a,f.b].forEach(function(p){meet(e,f,p);});return;}
      if(d>e.r+f.r+epsilon||d<Math.abs(e.r-f.r)-epsilon)return;
      var a=(e.r*e.r-f.r*f.r+d*d)/(2*d),h=Math.sqrt(Math.max(0,e.r*e.r-a*a)),mx=e.c.x+a*dx/d,my=e.c.y+a*dy/d;
      [-1,1].forEach(function(s){meet(e,f,{x:mx-s*h*dy/d,y:my+s*h*dx/d});});
    }
    edges.forEach(function(e){
      var pts=[e.a,e.b];if(e.type==='A')for(var q=0;q<4;q++){var p={x:e.c.x+e.r*Math.cos(q*Math.PI/2),y:e.c.y+e.r*Math.sin(q*Math.PI/2)};if(parameter(e,p)<=1+epsilon)pts.push(p);}
      e.box={l:Math.min.apply(null,pts.map(function(p){return p.x;})),r:Math.max.apply(null,pts.map(function(p){return p.x;})),t:Math.min.apply(null,pts.map(function(p){return p.y;})),b:Math.max.apply(null,pts.map(function(p){return p.y;}))};
    });
    for(var i=0;i<edges.length;i++)for(var j=i+1;j<edges.length;j++){var e=edges[i],f=edges[j];if(e.box.r+epsilon<f.box.l||f.box.r+epsilon<e.box.l||e.box.b+epsilon<f.box.t||f.box.b+epsilon<e.box.t)continue;intersections(e,f);}
    var kept=[],seen={},vertices={},vertexId=0;
    // Neighboring buckets avoid a quantization boundary separating two numerically
    // identical tangent intersections. The tolerance is 0.00001 canvas units.
    function pointKey(p){
      var scale=1e5,x=Math.floor(p.x*scale),y=Math.floor(p.y*scale);
      for(var dx=-1;dx<=1;dx++)for(var dy=-1;dy<=1;dy++){var list=vertices[(x+dx)+','+(y+dy)]||[];for(var i=0;i<list.length;i++)if(Math.hypot(list[i].x-p.x,list[i].y-p.y)<1e-5)return list[i].id;}
      var id=++vertexId,k=x+','+y;(vertices[k]||(vertices[k]=[])).push({x:p.x,y:p.y,id:id});return id;
    }
    edges.forEach(function(e){
      e.splits.sort(function(a,b){return a-b;});
      for(var i=1;i<e.splits.length;i++){
        var lo=e.splits[i-1],hi=e.splits[i];if(hi-lo<epsilon)continue;
        var mid=at(e,(lo+hi)/2),a=at(e,lo),b=at(e,hi),dx,dy;
        if(e.type==='L'){dx=b.x-a.x;dy=b.y-a.y;}else{dx=-(mid.y-e.c.y)*Math.sign(e.delta);dy=(mid.x-e.c.x)*Math.sign(e.delta);}
        var len=Math.hypot(dx,dy);if(len<epsilon)continue;
        var off=1e-7,left=filled({x:mid.x-dy/len*off,y:mid.y+dx/len*off}),right=filled({x:mid.x+dy/len*off,y:mid.y-dx/len*off});
        if(left===right)continue;
        var edge={type:e.type,a:left?a:b,b:left?b:a,c:e.c,r:e.r,delta:e.type==='A'?e.delta*(hi-lo)*(left?1:-1):0};
        if(pointKey(edge.a)===pointKey(edge.b)&&Math.abs(edge.delta)<Math.PI)continue;
        var k=pointKey(edge.a)+'|'+pointKey(mid)+'|'+pointKey(edge.b);if(seen[k])continue;seen[k]=true;kept.push(edge);
      }
    });
    var starts={};kept.forEach(function(e){var k=pointKey(e.a);(starts[k]||(starts[k]=[])).push(e);});
    function direction(e,end){if(e.type==='L')return{x:e.b.x-e.a.x,y:e.b.y-e.a.y};var p=end?e.b:e.a,s=Math.sign(e.delta);return{x:-(p.y-e.c.y)*s,y:(p.x-e.c.x)*s};}
    var paths=[],prec=function(n){return+Number(n).toFixed(6);};
    kept.forEach(function(first){
      if(first.used)return;var e=first,d='M'+prec(e.a.x)+','+prec(e.a.y),guard=kept.length+1;
      while(guard--){
        e.used=true;
        if(e.type==='L')d+='L'+prec(e.b.x)+','+prec(e.b.y);
        else d+='A'+prec(e.r)+','+prec(e.r)+' 0 '+(Math.abs(e.delta)>Math.PI?1:0)+' '+(e.delta>0?1:0)+' '+prec(e.b.x)+','+prec(e.b.y);
        if(pointKey(e.b)===pointKey(first.a)){d+='Z';paths.push(d);break;}
        var candidates=(starts[pointKey(e.b)]||[]).filter(function(x){return!x.used;});
        if(!candidates.length)throw new Error('Could not close the merged outline. Use exact SVG export.');
        var incoming=direction(e,true);
        candidates.sort(function(a,b){function score(x){var v=direction(x,false);return(incoming.x*v.x+incoming.y*v.y)/Math.hypot(v.x,v.y);}return score(b)-score(a);});e=candidates[0];
      }
      if(guard<0)throw new Error('Merged outline did not close.');
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" width="'+size.W+'" height="'+size.H+'" viewBox="0 0 '+size.W+' '+size.H+'">'+(withBg?'<rect width="100%" height="100%" fill="'+state.bgColor+'"/>':'')+'<path fill="'+state.shapeColor+'" fill-rule="nonzero" d="'+paths.join(' ')+'"/></svg>';
  }
