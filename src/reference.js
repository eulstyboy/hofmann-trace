  var referenceAssets={},referenceSerial=0,referenceLoading=0,referenceImportVersion=0,tracePreview=null,traceGeneration=0,referenceSamples=null;
  function validateReference(ref){
    if(ref===undefined||ref===null)return null;
    if(typeof ref!=='object'||typeof ref.src!=='string'||ref.src.length>4000000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(ref.src))throw new Error('reference image');
    function num(k,f,min,max){var v=ref[k]===undefined?f:ref[k];if(typeof v!=='number'||!Number.isFinite(v))throw new Error('reference setting');return Math.max(min,Math.min(max,v));}
    return{src:ref.src,width:num('width',1,1,1600),height:num('height',1,1,1600),opacity:num('opacity',.4,0,1),scale:num('scale',1,.1,4),x:num('x',0,-1,1),y:num('y',0,-1,1),visible:ref.visible!==false,threshold:num('threshold',128,0,255),invert:!!ref.invert};
  }
  function referenceForProject(includeData){
    if(!state.reference)return null;var ref=Object.assign({},state.reference);
    if(includeData!==false){var asset=referenceAssets[ref.assetId];ref.src=asset?asset.src:'';delete ref.assetId;}
    return ref;
  }
  function registerReference(data){
    if(!data)return null;
    var id=Object.keys(referenceAssets).find(function(k){return referenceAssets[k].src===data.src;});
    if(!id){
      id='image-'+(++referenceSerial);var img=new Image(),asset={src:data.src,image:img,ready:false};referenceAssets[id]=asset;referenceLoading++;
      img.onload=function(){asset.ready=true;referenceLoading--;scheduleRender();};
      img.onerror=function(){referenceLoading--;setStatus('Could not read the reference image. Import it again.');scheduleRender();};img.src=data.src;
    }
    var ref=Object.assign({},data,{assetId:id});delete ref.src;return ref;
  }
  function referenceBounds(ref){
    var size=canvasSize(),s=Math.min(size.W/ref.width,size.H/ref.height)*ref.scale,w=ref.width*s,h=ref.height*s;
    return{x:(size.W-w)/2+ref.x*size.W,y:(size.H-h)/2+ref.y*size.H,w:w,h:h};
  }
  function referenceSvg(){
    var ref=state.reference;if(!ref||!ref.visible)return'';var asset=referenceAssets[ref.assetId];if(!asset)return'';var b=referenceBounds(ref);
    return'<image id="referenceImage" pointer-events="none" x="'+b.x+'" y="'+b.y+'" width="'+b.w+'" height="'+b.h+'" opacity="'+ref.opacity+'" href="'+asset.src+'"/>';
  }
  function traceSignature(){return JSON.stringify([state.cols,state.rows,state.offset,state.defaultPct,state.bevel,state.fillet,state.nodes,state.contours,state.reference]);}
  function invalidateTrace(){traceGeneration++;tracePreview=null;$('traceApply').disabled=true;}
  function syncReferenceUi(){
    var ref=state.reference;$('referenceControls').hidden=!ref;
    if(ref){[['refOpacity','opacity',100],['refScale','scale',100],['refX','x',100],['refY','y',100],['traceThreshold','threshold',1]].forEach(function(a){$(a[0]).value=ref[a[1]]*a[2];});$('refVisible').checked=ref.visible;$('traceInvert').checked=ref.invert;}
    if(tracePreview&&tracePreview.signature!==traceSignature())invalidateTrace();
    $('traceApply').disabled=!tracePreview||geometryBusy;$('tracePreviewBtn').disabled=!ref||referenceLoading>0||geometryBusy;
  }
  $('referenceImport').addEventListener('click',function(){$('referenceFile').value='';$('referenceFile').click();});
  $('referenceFile').addEventListener('change',async function(){
    var file=this.files&&this.files[0];if(!file)return;var token=++referenceImportVersion;
    if(file.size>25000000){setStatus('Choose an image smaller than 25 MB.');return;}
    var url=URL.createObjectURL(file),img=new Image();referenceLoading++;setStatus('Opening reference image…');
    try{
      img.src=url;await img.decode();if(token!==referenceImportVersion)return;
      if(!img.naturalWidth||img.naturalWidth*img.naturalHeight>50000000)throw new Error('Image dimensions');
      var scale=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight)),cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(img.naturalWidth*scale));cv.height=Math.max(1,Math.round(img.naturalHeight*scale));cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
      var src=cv.toDataURL('image/webp',.92);if(src.length>4000000)throw new Error('Image data');
      finishPaint(true);finishControlEdit();closeSizePopup(true);if(geometryBusy)await whenIdleGeometry();
      if(token!==referenceImportVersion)return;commit();invalidateTrace();state.reference=registerReference({src:src,width:cv.width,height:cv.height,opacity:.4,scale:1,x:0,y:0,visible:true,threshold:128,invert:false});
      setStatus('Reference added. Adjust its position and opacity, then draw or preview a shape.');
    }catch(e){setStatus('Could not import this image. Try a PNG, JPEG or WebP.');}
    finally{referenceLoading--;URL.revokeObjectURL(url);render();}
  });
  // Image decoding is separate from geometry so imports do not wait for themselves.
  function whenIdleGeometry(){return new Promise(function(resolve){function check(){if(!geometryBusy)resolve();else setTimeout(check,10);}check();});}
  [['refOpacity','opacity',100],['refScale','scale',100],['refX','x',100],['refY','y',100],['traceThreshold','threshold',1]].forEach(function(a){
    $(a[0]).addEventListener('input',function(){if(!state.reference)return;beginControlEdit('reference');state.reference[a[1]]=+this.value/a[2];invalidateTrace();scheduleRender();});
    $(a[0]).addEventListener('change',function(){finishControlEdit();render();});$(a[0]).addEventListener('blur',finishControlEdit);
  });
  [['refVisible','visible'],['traceInvert','invert']].forEach(function(a){$(a[0]).addEventListener('change',function(){if(!state.reference)return;commit();state.reference[a[1]]=this.checked;invalidateTrace();render();});});
  $('refFit').addEventListener('click',function(){if(!state.reference)return;commit();state.reference.scale=1;state.reference.x=state.reference.y=0;invalidateTrace();render();});
  $('refRemove').addEventListener('click',function(){referenceImportVersion++;if(!state.reference)return;commit();state.reference=null;invalidateTrace();render();});
  $('traceStyle').addEventListener('change',function(){invalidateTrace();render();});
  function contrastKeys(){
    var ref=state.reference,asset=ref&&referenceAssets[ref.assetId];if(!asset||!asset.ready)return[];
    var size=canvasSize(),sc=Math.min(1,700/Math.max(size.W,size.H)),b=referenceBounds(ref),cacheKey=JSON.stringify([ref.assetId,b,size]);
    if(!referenceSamples||referenceSamples.key!==cacheKey){
      var cv=document.createElement('canvas');cv.width=Math.ceil(size.W*sc);cv.height=Math.ceil(size.H*sc);var ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(asset.image,b.x*sc,b.y*sc,b.w*sc,b.h*sc);
      referenceSamples={key:cacheKey,data:ctx.getImageData(0,0,cv.width,cv.height).data,w:cv.width,h:cv.height};
    }
    var out=[],sample=referenceSamples;
    for(var slot of activeKeys()){var coordinate=parseKey(slot),i=coordinate.i,j=coordinate.j;
      var c=center(i,j),sum=0,count=0;
      for(var yy=-2;yy<=2;yy++)for(var xx=-2;xx<=2;xx++){
        var x=Math.floor((c.x+xx*S/5)*sc),y=Math.floor((c.y+yy*rowStep()/5)*sc);if(x<0||y<0||x>=sample.w||y>=sample.h)continue;var index=(y*sample.w+x)*4,d=sample.data,alpha=d[index+3]/255;if(alpha<.1)continue;
        sum+=(.2126*d[index]+.7152*d[index+1]+.0722*d[index+2])*alpha+255*(1-alpha);count++;
      }
      if(count>=5&&(ref.invert?sum/count>=ref.threshold:sum/count<ref.threshold))out.push(key(i,j));
    }
    return out;
  }
  $('tracePreviewBtn').addEventListener('click',async function(){
    finishPaint(true);finishControlEdit();closeSizePopup(true);if(geometryBusy)return;invalidateTrace();var keys=contrastKeys();
    if(!keys.length){setStatus('No cells detected. Adjust contrast or invert light / dark.');return;}
    var token=traceGeneration,signature=traceSignature(),base=JSON.parse(JSON.stringify(state)),style=$('traceStyle').value;base.contours=[];
    Object.keys(base.nodes).forEach(function(k){base.nodes[k].filled=false;});
    setStatus('Building a proposal from the image…');var result=await runGeometry('trace',{keys:keys,style:style,preview:true},base);
    if(!result||token!==traceGeneration||signature!==traceSignature())return;
    tracePreview={contours:result.state.contours,keys:style==='pixels'?keys:[],nextId:result.state.nextId,signature:signature};
    setStatus('Blue preview: '+keys.length+' cells detected. Add it to the drawing or adjust the contrast.');render();
  });
  $('traceApply').addEventListener('click',function(){
    if(!tracePreview||tracePreview.signature!==traceSignature()||geometryBusy)return;var proposal=tracePreview;commit();
    state.contours=state.contours.concat(proposal.contours);state.nextId=Math.max(state.nextId,proposal.nextId);
    proposal.keys.forEach(function(k){var node=state.nodes[k]||{};node.filled=true;state.nodes[k]=node;});invalidateTrace();render();setStatus('Image proposal added. You can edit it or undo in one step.');
  });
  $('traceCancel').addEventListener('click',function(){invalidateTrace();render();});
  function tracePreviewSvg(){
    if(!tracePreview)return'';if(tracePreview.signature!==traceSignature()){invalidateTrace();return'';}
    var out='<g opacity=".75" pointer-events="none">';
    tracePreview.contours.forEach(function(c){out+=shapeSvg(c).split('fill="'+state.shapeColor+'"').join('fill="#3d7bff"');});
    tracePreview.keys.forEach(function(k){out+='<path fill="#3d7bff" d="'+segsToSvg(circleSegs(k))+'"/>';});return out+'</g>';
  }
