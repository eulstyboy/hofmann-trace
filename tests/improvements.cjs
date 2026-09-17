const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.TEST_OUTPUT||path.join(root,'test-results'));
fs.mkdirSync(out,{recursive:true});const errors=[],results=[];
const server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\//,'')||'index.html';const f=path.resolve(root,'site',name);if(!f.startsWith(path.join(root,'site')+path.sep)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'})[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f));});
let browser,context,page,url,base;
const rect=(a,b,c,d)=>[{x:a,y:b},{x:c,y:b},{x:c,y:d},{x:a,y:d}];
async function test(name,fn){try{const t=Date.now();await fn();results.push({name,passed:true,ms:Date.now()-t});console.log('PASS '+name);}catch(e){results.push({name,passed:false,error:e.stack});console.error('FAIL '+name+' '+e.stack);}}
async function idle(){await page.evaluate(()=>__hofmann.whenIdle());}
async function state(){return page.evaluate(()=>JSON.parse(__hofmann.projectJson()));}
async function load(s){await page.evaluate(s=>__hofmann.loadProject(JSON.stringify(s)),s);await idle();}
async function change(id,values){await page.evaluate(({id,values})=>{const e=document.getElementById(id);for(const v of values){e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));}e.dispatchEvent(new Event('change',{bubbles:true}));},{id,values});await idle();}
async function undo(){await page.evaluate(()=>document.querySelector('#undoBtn').click());await idle();}
async function compareMerged(){return page.evaluate(async()=>{
 const h=__hofmann,a=h.exportSvgString(false),b=h.mergedSvgString(false),images=[];
 for(const text of [a,b]){const img=new Image();img.src='data:image/svg+xml,'+encodeURIComponent(text);await img.decode();const cv=document.createElement('canvas');cv.width=img.width;cv.height=img.height;cv.getContext('2d').drawImage(img,0,0);images.push(cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data);}
 let wrong=0,large=0,spots=[];for(let i=3;i<images[0].length;i+=4){const delta=Math.abs(images[0][i]-images[1][i]);if(delta>32)wrong++;if(delta>180){large++;if(spots.length<20)spots.push({pixel:(i-3)/4,a:images[0][i],b:images[1][i]});}}
 const doc=new DOMParser().parseFromString(b,'image/svg+xml');const src=new DOMParser().parseFromString(a,'image/svg+xml');let membershipWrong=0; if(!src.querySelector('clipPath')){const ctx=document.createElement('canvas').getContext('2d');const paths=Array.from(src.querySelectorAll('path'),p=>new Path2D(p.getAttribute('d'))),merged=new Path2D(doc.querySelector('path').getAttribute('d'));for(let y=.5;y<480;y+=1)for(let x=.5;x<480;x+=1){const sourceAt=(px,py)=>paths.some(p=>ctx.isPointInPath(p,px,py)),inside=sourceAt(x,y);if(inside!==ctx.isPointInPath(merged,x,y)&&[[-.02,0],[.02,0],[0,-.02],[0,.02]].every(([dx,dy])=>sourceAt(x+dx,y+dy)===inside))membershipWrong++;}}return {wrong,large,spots,membershipWrong,paths:doc.querySelectorAll('path').length,clip:doc.querySelectorAll('clipPath,mask').length,closed:!doc.querySelector('path').getAttribute('d')||doc.querySelector('path').getAttribute('d').endsWith('Z')};
});}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});context=await browser.newContext({viewport:{width:393,height:851},isMobile:true,hasTouch:true});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.evaluate(()=>__hofmann.storageReady);base=await state();
 await test('Worker computes all mirrors atomically with one undo',async()=>{
   await page.evaluate(()=>{__hofmann.state.sym='both';__hofmann.render();window.counts=[];window.tickCount=0;window.tick=setInterval(()=>{window.counts.push(__hofmann.state.contours.length);window.tickCount++;},5);});
   const started=Date.now();await page.evaluate(points=>__hofmann.startRelax(points,false),rect(25,25,155,155));await idle();const info=await page.evaluate(()=>{clearInterval(tick);return{engine:__hofmann.engineInfo,counts,ticks:tickCount};});
   assert.equal((await state()).contours.length,4);assert.equal(info.engine.worker,true);assert.equal(info.engine.lastError,undefined);assert.ok(info.counts.every(x=>x===0||x===4));assert.ok(info.ticks>0);fs.writeFileSync(path.join(out,'worker-performance.json'),JSON.stringify({elapsedMs:Date.now()-started,...info},null,2));await undo();assert.equal((await state()).contours.length,0);
 });
 await test('Default size slider, every range and colour gesture undo once',async()=>{
   await load(base);assert.equal(await page.locator('#sizeIn').getAttribute('type'),'range');
   for(const [id,prop,values,want] of [['sizeIn','defaultPct',[55,63,80],80],['bevelIn','bevel',[75,50,25],.25],['guideIn','guideOpacity',[30,10,70],.7],['filletIn','fillet',[20,40,50],.5],['shapeColor','shapeColor',['#ff0000','#00ff00','#345678'],'#345678'],['bgHex','bgColor',['#123456','#abcdef'],'#abcdef']]){
     const before=await state();await change(id,values);assert.equal((await state())[prop],want);await undo();assert.deepEqual(await state(),before,'undo '+id);
   }
 });
 await test('Rapid default size / bevel changes retain the final geometry',async()=>{
   await load(base);await page.evaluate(points=>__hofmann.startRelax(points,false),rect(90,90,390,390));const original=await state();
   for(const [id,values] of [['sizeIn',[65,52,84,71]],['bevelIn',[75,30,90,100]]]){await change(id,values);assert.deepEqual((await state()).contours,original.contours);}
 });
 await test('Zoom changes the view only and pinch cannot draw a lasso',async()=>{
   const before=await state();await page.locator('#zoomIn').tap();assert.ok(await page.evaluate(()=>__hofmann.camera.zoom>1));assert.deepEqual(await state(),before);await page.locator('#zoomReset').tap();
   const cdp=await context.newCDPSession(page),r=await page.locator('#canvas').boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y},{x:x+30,y}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-70,y:y+15},{x:x+70,y:y+15}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await idle();assert.ok(await page.evaluate(()=>__hofmann.camera.zoom>1.5));assert.deepEqual(await state(),before);await page.locator('#zoomReset').tap();
 });
 await test('Session survives reload and restores after explicit recovery',async()=>{
   const before=await state(),drawing=await page.evaluate(()=>__hofmann.exportSvgString(false));assert.equal(await page.evaluate(()=>__hofmann.saveSession()),true);await page.reload();await page.evaluate(()=>__hofmann.storageReady);assert.equal(await page.locator('#recovery').isVisible(),true);assert.equal((await state()).contours.length,0);await page.locator('#restoreSession').tap();await idle();assert.equal(await page.evaluate(()=>__hofmann.exportSvgString(false)),drawing);assert.equal((await state()).defaultPct,before.defaultPct);
 });
 await test('Merged vector matches bug01, overlapping cuts, circles and squares',async()=>{
   const bug=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/bug01.json'),'utf8'));await load(bug);let result=await compareMerged();assert.equal(result.paths,1);assert.equal(result.clip,0);assert.equal(result.closed,true);assert.equal(result.large,0,JSON.stringify(result));
   for(const bevel of [1,.5,0]){
     const data=structuredClone(base);data.bevel=bevel;
     const loop=(ks,id,cut)=>({id,closed:true,cut:!!cut,members:ks,holes:[],cuts:[],tangents:ks.map((a,i)=>({a,b:ks[(i+1)%ks.length],fA:cut?'A':'O',fB:cut?'A':'O'}))});
     data.contours=[loop(['1_1','1_5','5_5','5_1'],1,false)];data.contours[0].cuts=[loop(['3_2','3_4'],2,true),loop(['2_3','4_3'],3,true)];data.nodes={'3_3':{pct:71,filled:true},'0_0':{pct:71,filled:true}};
     await load(data);result=await compareMerged();assert.equal(result.large,0,JSON.stringify({bevel,...result}));assert.equal(result.clip,0);assert.equal(result.closed,true);
   }
 });
 await test('Merged SVG downloads and includes a single compound path',async()=>{
   await page.locator('#exportBtn').tap();const pending=page.waitForEvent('download');await page.locator('[data-fmt="merged"]').tap();const download=await pending;assert.equal(download.suggestedFilename(),'hofmann-trace-merged.svg');await download.saveAs(path.join(out,'merged.svg'));
 });
 await test('Merged vector handles coincident edges, touching circles and variable radii',async()=>{
   let seed=246813579;function random(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;}
   for(let n=0;n<30;n++){
     const data=structuredClone(base);data.bevel=[0,.25,.6,1][n%4];data.defaultPct=[0,40,71,100][Math.floor(n/4)%4];
     data.contours=[{id:1,single:'2_2',closed:true,tangents:[],holes:[],cuts:[]},{id:2,single:'2_2',closed:true,tangents:[],holes:[],cuts:[]}];
     for(let i=0;i<4;i++)for(let j=0;j<4;j++)if(random()>.25)data.nodes[i+'_'+j]={pct:Math.round(random()*130+20),filled:true};
     await load(data);const result=await compareMerged();if(result.membershipWrong){fs.writeFileSync(path.join(out,'boolean-case-'+n+'.json'),JSON.stringify(data));fs.writeFileSync(path.join(out,'boolean-case-'+n+'-original.svg'),await page.evaluate(()=>__hofmann.exportSvgString(false)));fs.writeFileSync(path.join(out,'boolean-case-'+n+'-merged.svg'),await page.evaluate(()=>__hofmann.mergedSvgString(false)));}assert.equal(result.membershipWrong,0,'case '+n+' '+JSON.stringify(result));assert.equal(result.closed,true);
   }
 });
 await test('Undo during background computation retains redo and circle edit history',async()=>{
   await load(base);
   await page.evaluate(points=>{window.workDone=__hofmann.startRelax(points,false);document.querySelector('#undoBtn').click();},rect(90,90,390,390));await idle();await page.waitForFunction(()=>__hofmann.state.contours.length===0);
   await page.locator('#redoBtn').tap();assert.equal((await state()).contours.length,1);
   const before=await state();const pt=await page.locator('#canvas').evaluate(svg=>{const p=new DOMPoint(120,120).matrixTransform(svg.getScreenCTM());return{x:p.x,y:p.y};});await page.touchscreen.tap(pt.x,pt.y);await change('szRange',[40,80]);await undo();assert.deepEqual(await state(),before);
 });
 await test('Worker fallback still completes without animation callbacks',async()=>{
   const ctx=await browser.newContext();await ctx.addInitScript(()=>{window.Worker=undefined;});const p=await ctx.newPage();await p.goto(url);await p.evaluate(points=>__hofmann.startRelax(points,false),rect(90,90,270,270));assert.equal(await p.evaluate(()=>__hofmann.state.contours.length),1);assert.equal(await p.evaluate(()=>__hofmann.engineInfo.worker),false);await ctx.close();
 });
 await test('Autosave refusal does not prevent drawing or exporting',async()=>{
   const ctx=await browser.newContext();await ctx.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{get(){throw new Error('Storage denied');}});});const p=await ctx.newPage();await p.goto(url);await p.evaluate(()=>__hofmann.storageReady);await p.evaluate(points=>__hofmann.startRelax(points,false),rect(90,90,270,270));assert.equal(await p.evaluate(()=>__hofmann.state.contours.length),1);assert.match(await p.locator('#saveState').innerText(),/unavailable/);await ctx.close();
 });
 await test('Large grid keeps guide elements while moving a stroke',async()=>{
   const data=structuredClone(base);data.cols=data.rows=30;await load(data);const result=await page.evaluate(()=>{const h=__hofmann;const start=performance.now();for(let i=0;i<20;i++)h.render();return {ms:performance.now()-start,n:document.querySelectorAll('.node-hit').length};});assert.equal(result.n,900);fs.writeFileSync(path.join(out,'render-performance.json'),JSON.stringify(result));assert.ok(result.ms<500);
 });
 await test('Installable site works offline with no remote dependencies',async()=>{
   await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();assert.ok(await page.evaluate(()=>!!navigator.serviceWorker.controller));
   const manifest=await(await page.request.get(url+'/manifest.webmanifest')).json();assert.equal(manifest.display,'standalone');for(const icon of manifest.icons)assert.equal((await page.request.get(url+'/'+icon.src)).ok(),true);
   await context.setOffline(true);await page.reload();await page.evaluate(()=>__hofmann.storageReady);if(await page.locator('#recovery').isVisible())await page.locator('#discardSession').tap();await load(base);await page.evaluate(points=>__hofmann.startRelax(points,false),rect(90,90,270,270));assert.equal((await state()).contours.length,1);await page.screenshot({path:path.join(out,'mobile-offline.png')});await context.setOffline(false);
 });
 await test('About credit, Instagram label and zero runtime errors',async()=>{
   await page.locator('#aboutBtn').tap();assert.match(await page.locator('#aboutDlg').innerText(),/Developed with Claude and Codex\./);assert.equal(await page.locator('.ig').innerText(),'@eulst');assert.equal(await page.locator('.ig').evaluate(el=>el.nextSibling.textContent.trim()),'on Instagram.');await page.locator('#aboutClose').tap();assert.deepEqual(errors,[]);
 });
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'improvements.json'),JSON.stringify({results,errors},null,2));console.log(results.filter(r=>r.passed).length+'/'+results.length+' improvements passed');if(results.some(r=>!r.passed))process.exitCode=1;if(browser)await browser.close();server.close();});
