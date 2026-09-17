/* The same geometry implementation is assembled here and in the UI fallback. */
(function(){
  var S=60,MARGIN=60,TAU=Math.PI*2,state={},relax=null,drawing=null,poly=null,sizeEdit=null,status='';
  function createCanvas(){return new OffscreenCanvas(1,1);}
  function setStatus(s){status=s;}
  function render(){}
  function commit(){}
  function requestAnimationFrame(){}
  /* ENGINE */
  self.onmessage=function(event){
    var job=event.data;state=job.state;relax=null;relaxQueue=[];activeObstacles=null;seedMode=false;status='';
    maskCache={};maskCacheN=0;localGeometryInfo=null;
    var started=performance.now();
    try{
      if(job.type==='lasso'){
        startRelaxSync(job.points,job.sub);
        while(relax)relaxBatch(256);
      }else if(job.type==='layout'||job.type==='settle'&&job.previousNodes){runLocalGeometry(job);
      }else if(job.type==='trace'){buildImageTrace(job.keys,job.style);
      }else if(job.type==='bevel'){
        var from=job.from,to=state.bevel,n=Math.max(1,Math.ceil(Math.abs(to-from)/.25));
        for(var i=1;i<=n;i++){state.bevel=from+(to-from)*i/n;maskCache={};maskCacheN=0;enforceCaps();settleSync(null);}
      }else if(job.type==='normalize'){
        resolveOpenCuts();state.contours.forEach(function(c){untwist(c);(c.cuts||[]).forEach(untwist);var cm=cutMemberKeys(c);if(cm.length&&contourKeys(c).some(function(k){return cm.indexOf(k)>=0;}))retension(c);});
      }else if(job.type==='flatten'){
        var result=mergedSvgString(job.withBg);
        self.postMessage({id:job.id,text:result,ms:performance.now()-started});return;
      }else{
        if(job.caps)enforceCaps();settleSync(null,job.keys);
      }
      self.postMessage({id:job.id,state:state,status:status,ms:performance.now()-started,stats:stats,scope:localGeometryInfo});
    }catch(error){self.postMessage({id:job.id,error:String(error&&error.message||error)});}
  };
})();
