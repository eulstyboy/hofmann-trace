const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.TEST_OUTPUT||path.join(root,'test-results'));fs.mkdirSync(out,{recursive:true});
const results=[],errors=[];let browser,page,context,base,url;
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(fs.readFileSync(path.join(root,'hofmann-trace.html')));});
async function test(name,fn){if(process.env.TEST_FILTER&&!new RegExp(process.env.TEST_FILTER).test(name))return;const start=Date.now();try{await fn();results.push({name,passed:true,ms:Date.now()-start});console.log('PASS '+name);}catch(e){results.push({name,passed:false,error:e.stack});console.error('FAIL '+name+'\n'+e.stack);await page.screenshot({path:path.join(out,'failure-'+results.length+'.png')});}}
const state=()=>page.evaluate(()=>JSON.parse(__hofmann.projectJson()));const idle=()=>page.evaluate(()=>__hofmann.whenIdle());
async function load(data=base){assert.equal(await page.evaluate(d=>__hofmann.loadProject(JSON.stringify(d)),data),true);await idle();await page.locator('[data-tool=select]').click();}
async function point(x,y){return page.locator('#canvas').evaluate((svg,{x,y})=>{const p=new DOMPoint(x,y).matrixTransform(svg.getScreenCTM());return{x:p.x,y:p.y};},{x,y});}
async function click(x,y){const p=await point(x,y);await page.mouse.click(p.x,p.y);}
async function drag(a,b,steps=1){const p=await point(...a),q=await point(...b);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(q.x,q.y,{steps});await page.mouse.up();await idle();}
async function select(keys){await page.evaluate(keys=>__hofmann.selectNodes(keys),keys);}
async function merge(keys){await select(keys);await page.locator('#nodeMerge').click();await idle();}
async function remove(keys){await select(keys);await page.locator('#nodeDelete').click();await idle();}
async function change(id,v){await page.locator('#'+id).evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},v);await idle();}
async function undo(){await page.locator('#undoBtn').click();await idle();}
async function lasso(rect,sub=false){const [a,b,c,d]=rect;await page.evaluate(({points,sub})=>__hofmann.startRelax(points,sub),{points:[{x:a,y:b},{x:c,y:b},{x:c,y:d},{x:a,y:d}],sub});await idle();}
async function alpha(points){return page.evaluate(async points=>{const im=new Image();im.src='data:image/svg+xml,'+encodeURIComponent(__hofmann.exportSvgString(false));await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);return points.map(p=>x.getImageData(...p,1,1).data[3]);},points);}
async function healthy(){const r=await page.evaluate(()=>{const h=__hofmann;return{error:h.engineInfo.lastError,refs:h.state.contours.flatMap(c=>[c,...c.cuts||[]]).flatMap(c=>[c.single,...(c.tangents||[]).flatMap(t=>[t.a,t.b]),...c.members||[],...c.holes||[],...c.notches||[]]).filter(Boolean).every(h.nodeActive),valid:h.state.contours.map(h.validContour),nan:/NaN|Infinity/.test(h.exportSvgString(false))};});assert.equal(r.refs,true);assert.equal(r.nan,false);assert.ok(r.valid.every(Boolean),JSON.stringify(r));assert.ok(!r.error,r.error);}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});context=await browser.newContext({viewport:{width:1280,height:900}});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.evaluate(()=>__hofmann.storageReady);base=await state();
 await test('Rectangle selection and Shift-click add and remove circles without opening the keyboard',async()=>{
   await load();await drag([90,90],[210,210]);assert.equal(await page.locator('#nodeCount').textContent(),'4 selected');await page.keyboard.down('Shift');await click(240,240);await page.keyboard.up('Shift');assert.equal(await page.locator('#nodeCount').textContent(),'5 selected');await page.keyboard.down('Shift');await click(240,240);await page.keyboard.up('Shift');assert.equal(await page.locator('#nodeCount').textContent(),'4 selected');assert.equal(await page.locator('#sizePop').evaluate(el=>el.classList.contains('open')),false);
 });
 await test('Merge immediately uses the mean extent and undoes once',async()=>{
   await load();const before=await state();await select(['2_2','2_3','3_2','3_3']);await page.locator('#nodeMerge').click();await idle();assert.equal(await page.locator('#nodeMergePreview,#mergeSize,#mergeApply,#mergeCancel').count(),0);assert.ok(Math.abs((await state()).nodes['2_2'].pct-171)<.001);await page.screenshot({path:path.join(out,'merge-result.png')});await undo();assert.deepEqual(await state(),before);
   await merge(['2_2','2_3','3_2','3_3']);let s=await state();assert.equal(Object.values(s.nodes).filter(n=>n.disabled).length,3);const n=s.nodes['2_2'];assert.ok(n.fused);assert.ok(Math.abs(n.pct-171)<.001);assert.equal(n.x,210);assert.equal(n.y,210);assert.equal(await page.locator('[data-node="2_3"]').count(),0);assert.equal(await page.locator('[data-node="2_2"]').count(),1);await undo();assert.deepEqual(await state(),before);await page.locator('#redoBtn').click();await idle();assert.equal((await state()).nodes['2_2'].fused,true);
 });
 await test('A fused circle can be resized, shrinks proportionally, and survives project reload',async()=>{
   await select(['2_2']);const pos=await point(210,210);await page.mouse.dblclick(pos.x,pos.y);assert.ok(+(await page.locator('#szRange').getAttribute('max'))>150);await change('szRange',120);await page.locator('#szOk').click();await idle();assert.equal((await state()).nodes['2_2'].pct,120);await change('sizeIn',35);assert.ok(Math.abs((await state()).nodes['2_2'].pct-120*35/71)<.01);const saved=await state();await load(saved);assert.deepEqual((await state()).nodes,saved.nodes);assert.equal(await page.locator('[data-node]').count(),46);
 });
 await test('Movement stops at neighbours even for a fast drag, slides, and undoes once',async()=>{
   await load();const before=await state();await drag([180,180],[390,180]);const c=await page.evaluate(()=>__hofmann.nodeCenter('2_2'));assert.ok(c.x>180&&c.x<200,JSON.stringify(c));assert.ok(Math.abs(c.y-180)<.1);assert.ok(await page.evaluate(()=>__hofmann.gapNodes(__hofmann.nodeOf('2_2'),__hofmann.nodeOf('2_3'))>=1.99));await undo();assert.deepEqual(await state(),before);
   await drag([180,180],[215,215],20);const moved=await page.evaluate(()=>__hofmann.nodeCenter('2_2'));assert.ok(moved.x>180&&moved.y>180);await page.screenshot({path:path.join(out,'move-region.png')});
 });
 await test('Deleting a neighbour enlarges the movement space and leaves no invisible peg',async()=>{
   await load();await remove(['2_3']);assert.equal((await state()).nodes['2_3'].disabled,true);await drag([180,180],[240,180]);assert.ok((await page.evaluate(()=>__hofmann.nodeCenter('2_2'))).x>239);assert.equal(await page.locator('[data-node="2_3"]').count(),0);await healthy();
 });
 await test('Removing and merging supports updates existing shapes and preserves holes',async()=>{
   await load();await lasso([80,80,400,400]);await lasso([210,210,270,270],true);assert.deepEqual(await alpha([[240,240],[180,180]]),[0,255]);
   await remove(['1_1']);await healthy();assert.equal((await state()).contours.length,1);assert.equal((await alpha([[240,240]]))[0],0);
   await merge(['4_2','4_3','5_2','5_3']);await healthy();assert.equal((await alpha([[240,240]]))[0],0);await remove(['3_3']);await healthy();assert.equal((await alpha([[240,240]]))[0],255);await page.screenshot({path:path.join(out,'edited-shape.png')});
 });
 await test('Merging a negative multi-circle hole and moving it preserves subtraction',async()=>{
   await load();await lasso([80,80,400,400]);await lasso([150,150,270,210],true);await merge(['2_2','2_3']);await healthy();assert.equal((await alpha([[210,180]]))[0],0);await drag([210,180],[212,188],5);await healthy();assert.equal((await alpha([[212,188]]))[0],0);
 });
 await test('Large fused supports collide and trace at their real position, including distant grid keys',async()=>{
   await load();const keys=[];for(let i=1;i<=5;i++)for(let j=1;j<=5;j++)keys.push(i+'_'+j);await merge(keys);const n=(await state()).nodes['1_1'];assert.ok(n.pct>450);assert.equal(n.x,240);assert.equal(n.y,240);await lasso([70,70,410,410]);assert.equal((await state()).contours.length,1);assert.ok((await state()).contours[0].members.includes('1_1'));await healthy();assert.equal((await alpha([[240,240]]))[0],255);
 });
 await test('Deleting the final support removes its shape; painting cannot resurrect disabled cells',async()=>{
   await load();await lasso([150,150,210,210]);await remove(['2_2']);assert.equal((await state()).contours.length,0);await page.locator('[data-tool=fill]').click();await drag([180,180],[180,180]);assert.equal((await state()).nodes['2_2'].filled,false);assert.deepEqual(await alpha([[180,180]]),[0]);
 });
 await test('Merging filled pixels immediately creates a square in square mode',async()=>{
   const data=structuredClone(base);data.bevel=0;data.defaultPct=100;data.nodes={'2_2':{filled:true},'2_3':{filled:true},'3_2':{filled:true},'3_3':{filled:true}};await load(data);await select(['2_2','2_3','3_2','3_3']);await page.locator('#nodeMerge').click();await idle();assert.equal((await state()).nodes['2_2'].filled,true);assert.ok(await page.evaluate(()=>__hofmann.nodeOf('2_2').e>0));assert.deepEqual(await alpha([[210,210],[260,260]]),[255,255]);await healthy();
 });
 await test('Fused nodes follow circle, rounded-square and square controls in guides and exports',async()=>{
   const data=structuredClone(base);data.nodes={'2_2':{filled:true}};await load(data);await merge(['2_2','2_3','3_2','3_3']);const before=await state();assert.equal((await alpha([[255,255]]))[0],0);
   await change('bevelIn',50);assert.equal(await page.locator('[data-guide="2_2"]').evaluate(el=>el.tagName),'rect');const rounded=await page.locator('[data-guide="2_2"]').getAttribute('rx');assert.ok(+rounded>20&&+rounded<30);
   await change('bevelIn',0);assert.equal(await page.locator('[data-guide="2_2"]').getAttribute('rx'),'0');assert.equal((await alpha([[255,255]]))[0],255);await page.screenshot({path:path.join(out,'fused-square.png')});await healthy();
   await undo();assert.equal((await state()).bevel,.5);await undo();assert.deepEqual(await state(),before);assert.equal((await alpha([[255,255]]))[0],0);
   await change('bevelIn',0);const saved=await state();await load(saved);assert.deepEqual((await state()).nodes,saved.nodes);assert.equal((await alpha([[255,255]]))[0],255);await change('bevelIn',100);assert.equal((await alpha([[255,255]]))[0],0);
 });
 await test('Fused contour supports and negative holes follow rounding without collisions',async()=>{
   await load();await lasso([80,80,400,400]);await lasso([150,150,270,210],true);await merge(['2_2','2_3']);await change('bevelIn',0);await healthy();assert.equal((await alpha([[210,180]]))[0],0);await drag([210,180],[214,183],5);await healthy();
   assert.ok(await page.evaluate(()=>{const h=__hofmann,n=h.nodeOf('2_2');return h.activeKeys().filter(k=>k!=='2_2').every(k=>h.gapNodes(n,h.nodeOf(k))>=-.01);}));await change('bevelIn',60);await healthy();assert.equal((await alpha([[210,180]]))[0],0);
 });
 await test('Mirrored square fusion respects both neighbouring and fused nodes',async()=>{
   const data=structuredClone(base);data.bevel=0;data.sym='both';await load(data);await select(['1_1','1_2','2_1','2_2']);await page.locator('#nodeMerge').click();await idle();assert.equal(await page.evaluate(()=>Object.values(__hofmann.state.nodes).filter(n=>n.fused&&!n.disabled).length),4);await idle();
   assert.ok(await page.evaluate(()=>{const h=__hofmann,keys=h.activeKeys();return keys.filter(k=>h.state.nodes[k]?.fused).every(k=>keys.filter(q=>q!==k).every(q=>h.gapNodes(h.nodeOf(k),h.nodeOf(q))>=1.99));}));await healthy();
 });
 await test('Mirrored edits appear together, constrain both circles, and remain mirrored after fusion',async()=>{
   const data=structuredClone(base);data.sym='v';await load(data);await merge(['1_1','2_1']);const s=await state();const fused=Object.values(s.nodes).filter(n=>n.fused);assert.equal(fused.length,2);assert.equal(fused[0].x+fused[1].x,480);assert.equal(fused[0].y,fused[1].y);await drag([120,150],[127,153],8);const p=await page.evaluate(()=>[__hofmann.nodeCenter('1_1'),__hofmann.nodeCenter('1_5')]);assert.ok(Math.abs(p[0].x+p[1].x-480)<.001);assert.ok(Math.abs(p[0].y-p[1].y)<.001);await remove(['1_1']);assert.equal(await page.evaluate(()=>__hofmann.nodeActive('1_5')),false);
 });
 await test('Cross-axis fusion forms one circle and rotation retains positions and deletion',async()=>{
   const data=structuredClone(base);data.sym='v';await load(data);await merge(['2_2','2_3']);const s=await state(),fused=Object.values(s.nodes).filter(n=>n.fused);assert.equal(fused.length,1);assert.equal(fused[0].x,240);assert.equal(Object.values(s.nodes).filter(n=>n.disabled).length,2);await drag([240,180],[260,185],10);assert.equal((await page.evaluate(()=>__hofmann.nodeCenter('2_2'))).x,240);const before=await state();for(let i=0;i<4;i++)await page.locator('#rotR').click();const rotated=(await state()).nodes;for(const k of Object.keys(before.nodes)){for(const field of ['x','y','homeX','homeY']){if(typeof before.nodes[k][field]!=='number')continue;assert.ok(Math.abs(rotated[k][field]-before.nodes[k][field])<1e-8);rotated[k][field]=before.nodes[k][field];}}assert.deepEqual(rotated,before.nodes);
 });
 await test('Off-grid projects reject invalid positions and references to removed circles atomically',async()=>{
   const before=await state();for(const node of [{x:NaN,y:120},{x:100000,y:120},{x:120},{homeX:120}]){const bad=structuredClone(base);bad.nodes={'1_1':node};assert.equal(await page.evaluate(d=>__hofmann.loadProject(JSON.stringify(d)),bad),false);}assert.deepEqual(await state(),before);
   const bad=structuredClone(base);bad.nodes={'1_1':{disabled:true}};bad.contours=[{id:1,single:'1_1',members:['1_1'],closed:true,tangents:[]}];assert.equal(await page.evaluate(d=>__hofmann.loadProject(JSON.stringify(d)),bad),false);
 });
 await test('Undo while an edit is computing restores the whole transaction with redo',async()=>{
   await load();await lasso([80,80,400,400]);const before=await state();await select(['1_1','1_2']);await page.locator('#nodeMerge').click();await page.locator('#undoBtn').click();await idle();assert.deepEqual(await state(),before);await page.locator('#redoBtn').click();await idle();assert.equal((await state()).nodes['1_1'].fused,true);
 });
 await test('Touch movement, multiple selection and pinch work without a keyboard',async()=>{
   const ctx=await browser.newContext({viewport:{width:393,height:851},isMobile:true,hasTouch:true}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.evaluate(d=>__hofmann.loadProject(JSON.stringify(d)),base);await p.evaluate(()=>__hofmann.whenIdle());await p.locator('[data-tool=select]').tap();const cdp=await ctx.newCDPSession(p);
   const pos=await p.locator('#canvas').evaluate(svg=>[180,195].map(x=>{const p=new DOMPoint(x,180).matrixTransform(svg.getScreenCTM());return{x:p.x,y:p.y};}));
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pos[0]]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[pos[1]]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.evaluate(()=>__hofmann.whenIdle());assert.ok(await p.evaluate(()=>__hofmann.nodeCenter('2_2').x>180));assert.equal(await p.evaluate(()=>document.activeElement.tagName==='INPUT'),false);
   const before=await p.evaluate(()=>__hofmann.projectJson());await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pos[1]]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pos[1].x,y:pos[1].y+7}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pos[1],{x:pos[1].x+50,y:pos[1].y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[pos[1],{x:pos[1].x+100,y:pos[1].y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await p.evaluate(()=>__hofmann.projectJson()),before);
   await p.locator('#zoomReset').tap();for(const [x,y] of [[120,120],[180,120]]){const q=await p.locator('#canvas').evaluate((s,p)=>{const v=new DOMPoint(...p).matrixTransform(s.getScreenCTM());return{x:v.x,y:v.y};},[x,y]);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[q]});await p.waitForTimeout(520);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}assert.equal(await p.locator('#nodeCount').textContent(),'2 selected');await p.locator('#nodeMerge').tap();await p.screenshot({path:path.join(out,'merge-mobile.png')});await p.evaluate(()=>__hofmann.whenIdle());assert.equal(await p.evaluate(()=>Object.values(__hofmann.state.nodes).filter(n=>n.fused).length),1);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await ctx.close();
 });
 await test('Edited grid enlargement and repeated fast drags cannot cross neighbours',async()=>{
   await load();await drag([180,180],[196,180]);await change('sizeIn',100);let report=await page.evaluate(()=>{const h=__hofmann,keys=h.activeKeys();return Math.min(...keys.flatMap((k,i)=>keys.slice(i+1).map(q=>h.gapNodes(h.nodeOf(k),h.nodeOf(q)))));});assert.ok(report>=-.01,String(report));
   await load();await change('sizeIn',10);for(let i=0;i<4;i++){const c=await page.evaluate(()=>__hofmann.nodeCenter('2_2'));await drag([c.x,c.y],[400,400]);}const c=await page.evaluate(()=>__hofmann.nodeCenter('2_2'));assert.ok(c.x<=240.01&&c.y<=240.01,JSON.stringify(c));
 });
 await test('Impossible fusion keeps the drawing intact and split shapes can share a fused support',async()=>{
   await load();const before=await state();await select(['2_1','2_3']);await page.locator('#nodeMerge').click();assert.equal(await page.locator('#nodeMergePreview').count(),0);assert.deepEqual(await state(),before);
   await lasso([90,90,150,150]);await lasso([150,90,210,150]);await merge(['1_1','1_2']);await healthy();assert.equal((await state()).contours.length,1);
 });
 await test('The reported open-hole bug stays smooth after moving and deleting its supports',async()=>{
   const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/bug01.json'),'utf8'));await load(fixture);await drag([120,60],[121,63],5);await healthy();await remove(['0_1']);await healthy();
 });
 await test('A cancelled computation rolls back before another project is loaded',async()=>{
   await load();await lasso([80,80,400,400]);await select(['1_1','1_2']);await page.evaluate(()=>{__hofmann.proposeMerge();});await load(base);await idle();assert.deepEqual(await state(),base);
 });
 await test('Node editing also works through the main-thread geometry fallback',async()=>{
   const ctx=await browser.newContext();await ctx.addInitScript(()=>{window.Worker=undefined;});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.evaluate(d=>__hofmann.loadProject(JSON.stringify(d)),base);await p.evaluate(()=>__hofmann.whenIdle());await p.evaluate(()=>{__hofmann.selectNodes(['2_2','2_3']);__hofmann.proposeMerge();});await p.evaluate(()=>__hofmann.whenIdle());assert.equal(await p.evaluate(()=>__hofmann.state.nodes['2_2'].fused),true);await ctx.close();
 });
 await test('30 by 30 circle movement keeps pointer frames and geometry off the main thread',async()=>{
   const data=structuredClone(base);data.cols=data.rows=30;await load(data);await page.evaluate(()=>{window.moveLongTasks=[];window.moveObserver=new PerformanceObserver(list=>list.getEntries().forEach(e=>moveLongTasks.push(e.duration)));moveObserver.observe({entryTypes:['longtask']});window.moveFrames=[];window.movePrevious=performance.now();window.moveFrame=()=>{const now=performance.now();moveFrames.push(now-movePrevious);movePrevious=now;window.moveRaf=requestAnimationFrame(moveFrame);};moveRaf=requestAnimationFrame(moveFrame);});
   await drag([600,600],[610,610],30);const timing=await page.evaluate(()=>{cancelAnimationFrame(moveRaf);moveObserver.disconnect();return{frames:moveFrames.length,p95:moveFrames.slice().sort((a,b)=>a-b)[Math.floor(moveFrames.length*.95)],longTasks:moveLongTasks,worker:__hofmann.engineInfo.worker,workerMs:__hofmann.engineInfo.lastMs};});fs.writeFileSync(path.join(out,'node-performance.json'),JSON.stringify(timing,null,2));assert.ok(timing.frames>=10);assert.equal(timing.worker,true);assert.equal(await page.locator('[data-node]').count(),900);
 });
 await test('Dragging updates only the moving guides and cancellation restores their visible positions',async()=>{
   await load();const before=await state();await page.evaluate(()=>window.untouchedGuide=document.querySelector('[data-guide="0_0"]'));const a=await point(180,180),b=await point(190,185);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
   assert.equal(await page.evaluate(()=>document.querySelector('[data-guide="0_0"]')===untouchedGuide),true);assert.match(await page.locator('[data-guide="2_2"]').getAttribute('transform'),/translate/);await page.keyboard.press('Escape');await page.mouse.up();await idle();assert.deepEqual(await state(),before);assert.equal(await page.locator('[data-guide="2_2"]').getAttribute('transform'),null);
 });
 await test('Autosave restores fused positions, sizes and removed supports after reload',async()=>{
   await load();await merge(['2_2','2_3']);await remove(['5_5']);const before=await state();assert.equal(before.version,2);assert.equal(await page.evaluate(()=>__hofmann.saveSession()),true);await page.reload();await page.evaluate(()=>__hofmann.storageReady);await page.locator('#restoreSession').click();await idle();assert.deepEqual(await state(),before);
 });
 await test('No runtime errors',async()=>assert.deepEqual(errors,[]));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'node-editor.json'),JSON.stringify({results,errors},null,2));console.log(results.filter(r=>r.passed).length+'/'+results.length+' node editor scenarios passed');if(results.some(r=>!r.passed))process.exitCode=1;if(browser)await browser.close();server.close();});


