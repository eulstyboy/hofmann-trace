  var geometryWorker=null,geometryWorkerURL=null,geometryJob=null,geometryPending=null,geometryBusy=false,geometrySequence=0,geometryRevision=0;
  var engineInfo={worker:false,lastMs:0,completed:0,cancelled:0};
  function cancelGeometry(){
    geometrySequence++;
    if(geometryWorker){geometryWorker.terminate();geometryWorker=null;}
    if(geometryJob)geometryJob.resolve(null);
    if(geometryPending)geometryPending.resolve(null);
    geometryJob=null;geometryPending=null;geometryBusy=false;engineInfo.cancelled++;
  }
  function finishGeometry(job,result){
    if(geometryJob!==job)return;
    geometryJob=null;
    if(geometryPending){job.resolve(null);var next=geometryPending;geometryPending=null;sendGeometry(next);return;}
    geometryBusy=false;
    if(result.error){engineInfo.lastError=result.error;setStatus(job.data.type==='flatten'?'Could not merge this outline. Use the exact SVG export.':'Could not update the shape. Your previous drawing is kept.');job.resolve(null);render();return;}
    engineInfo.lastMs=result.ms||0;engineInfo.completed++;engineInfo.scope=result.scope||null;
    if(result.state&&!job.data.preview&&job.revision===geometryRevision){
      state.contours=result.state.contours;state.nodes=result.state.nodes;state.nextId=result.state.nextId;
      maskCache={};maskCacheN=0;
      if(result.status)setStatus(result.status);
    }
    job.resolve(result);render();
  }
  function sendGeometry(job){
    geometryJob=job;geometryBusy=true;
    if(!geometryWorker&&typeof Worker!=='undefined'&&typeof OffscreenCanvas!=='undefined'){
      try{
        if(!geometryWorkerURL)geometryWorkerURL=URL.createObjectURL(new Blob([WORKER_SOURCE],{type:'text/javascript'}));
        geometryWorker=new Worker(geometryWorkerURL);engineInfo.worker=true;
        geometryWorker.onmessage=function(e){if(geometryJob&&e.data.id===geometryJob.id)finishGeometry(geometryJob,e.data);};
        geometryWorker.onerror=function(e){
          e.preventDefault();var failed=geometryJob;geometryWorker.terminate();geometryWorker=null;engineInfo.worker=false;
          if(failed)runGeometryFallback(failed);
        };
      }catch(e){geometryWorker=null;engineInfo.worker=false;}
    }
    if(geometryWorker)geometryWorker.postMessage(job.data);else runGeometryFallback(job);
  }
  function runGeometryFallback(job){
    setTimeout(function(){
      if(geometryJob!==job)return;
      var previous=state,started=performance.now(),result;
      try{
        state=JSON.parse(JSON.stringify(job.data.state));localGeometryInfo=null;
        var oldRaf=window.requestAnimationFrame;window.requestAnimationFrame=function(){};var oldRender=render,oldCommit=commit;render=function(){};commit=function(){};
        try{
          if(job.data.type==='lasso'){startRelaxSync(job.data.points,job.data.sub);while(relax)relaxBatch(256);}
          else if(job.data.type==='layout'||job.data.type==='settle'&&job.data.previousNodes){runLocalGeometry(job.data);}
          else if(job.data.type==='trace'){buildImageTrace(job.data.keys,job.data.style);}
          else if(job.data.type==='flatten'){result={text:mergedSvgString(job.data.withBg)};}
          else if(job.data.type==='normalize'){resolveOpenCuts();state.contours.forEach(function(c){untwist(c);(c.cuts||[]).forEach(untwist);var cm=cutMemberKeys(c);if(cm.length&&contourKeys(c).some(function(k){return cm.indexOf(k)>=0;}))retension(c);});}
          else if(job.data.type==='bevel'){var from=job.data.from,to=state.bevel,n=Math.max(1,Math.ceil(Math.abs(to-from)/.25));for(var i=1;i<=n;i++){state.bevel=from+(to-from)*i/n;maskCache={};maskCacheN=0;enforceCaps();settleSync(null);}}
          else {if(job.data.caps)enforceCaps();settleSync(null,job.data.keys);}
        }finally{render=oldRender;commit=oldCommit;window.requestAnimationFrame=oldRaf;}
        result=result||{state:state};result.ms=performance.now()-started;result.scope=localGeometryInfo;
      }catch(e){result={error:String(e)};}finally{state=previous;relax=null;activeObstacles=null;}
      finishGeometry(job,result);
    },0);
  }
  function runGeometry(type,options,baseState){
    return new Promise(function(resolve){
      var id=++geometrySequence,data=Object.assign({id:id,type:type,state:JSON.parse(JSON.stringify(baseState||state))},options||{});
      var job={id:id,data:data,resolve:resolve,revision:geometryRevision};
      if(geometryJob){if(geometryPending)geometryPending.resolve(null);geometryPending=job;}
      else sendGeometry(job);
      render();
    });
  }
  function whenIdle(){return new Promise(function(resolve){function check(){if(!geometryBusy&&!referenceLoading&&!controlTimer&&!liveTimer&&!bevelTimer)resolve();else setTimeout(check,10);}check();});}
  function startRelax(points,sub){
    finishControlEdit();closeSizePopup(true);
    if(geometryBusy)return;
    commit();state.selected=null;
    return runGeometry('lasso',{points:points,sub:sub});
  }
  // Synchronous geometry remains exposed only for debugging and regression fixtures.
  function settle(newId,keys,joinIds){return settleSync(newId,keys,joinIds);}
