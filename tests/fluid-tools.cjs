const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.TEST_OUTPUT||path.join(root,'test-results'));fs.mkdirSync(out,{recursive:true});
const results=[],errors=[];let browser,context,page,empty,base,url;
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(fs.readFileSync(path.join(root,'hofmann-trace.html')));});
async function test(name,fn){if(process.env.TEST_FILTER&&!new RegExp(process.env.TEST_FILTER).test(name))return;const t=Date.now();try{await fn();results.push({name,passed:true,ms:Date.now()-t});console.log('PASS '+name);}catch(e){results.push({name,passed:false,error:e.stack});console.error('FAIL '+name+'\n'+e.stack);await page.screenshot({path:path.join(out,'fluid-failure-'+results.length+'.png')});}}
const state=(p=page)=>p.evaluate(()=>JSON.parse(__hofmann.projectJson()));
const idle=(p=page)=>p.evaluate(()=>__hofmann.whenIdle());
const scope=(p=page)=>p.evaluate(()=>__hofmann.engineInfo.scope);
async function load(data=base,p=page){assert.equal(await p.evaluate(d=>__hofmann.loadProject(JSON.stringify(d)),data),true);await idle(p);await p.locator('[data-tool=select]').click();}
async function point(x,y,p=page){return p.locator('#canvas').evaluate((svg,{x,y})=>{const q=new DOMPoint(x,y).matrixTransform(svg.getScreenCTM());return{x:q.x,y:q.y};},{x,y});}
async function click(x,y,p=page){const q=await point(x,y,p);if(p===page)await p.mouse.click(q.x,q.y);else await p.touchscreen.tap(q.x,q.y);}
async function drag(a,b){a=await point(...a);b=await point(...b);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();await idle();}
async function change(id,value){await page.locator('#'+id).evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},value);await idle();}
async function undo(p=page){await p.locator('#undoBtn').click();await idle(p);}
async function pick(x,y,p=page){await p.locator('#nodePickSize').click();await click(x,y,p);}
function capsule(a,b,id){return{id,closed:true,members:[a,b],holes:[],notches:[],soft:[],necks:[],cuts:[],tangents:[{a,b,fA:'O',fB:'O'},{a:b,b:a,fA:'O',fB:'O'}]};}
const single=(k,id)=>({id,closed:true,members:[k],single:k,holes:[],notches:[],soft:[],necks:[],cuts:[],tangents:[]});
async function fullComparison(before,mapping={}){
  const report=await page.evaluate(async({before,mapping})=>{
    const h=__hofmann,saved={nodes:h.state.nodes,contours:h.state.contours,nextId:h.state.nextId,selected:h.state.selected};let full,ms;
    const local=h.exportSvgString(false);
    try{h.state.contours=structuredClone(before.contours);h.state.nextId=before.nextId;const start=performance.now();h.repairNodeContours(mapping);ms=performance.now()-start;full=h.exportSvgString(false);}
    finally{Object.assign(h.state,saved);h.render();}
    async function pixels(svg){const im=new Image();im.src='data:image/svg+xml,'+encodeURIComponent(svg);await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);return x.getImageData(0,0,c.width,c.height).data;}
    const a=await pixels(local),b=await pixels(full);let different=0,max=0;for(let i=3;i<a.length;i+=4){const d=Math.abs(a[i]-b[i]);if(d>2)different++;max=Math.max(max,d);}return{different,max,fullMs:ms};
  },{before,mapping});assert.equal(report.different,0,JSON.stringify(report));return report;
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});context=await browser.newContext({viewport:{width:1280,height:900}});await context.route('https://fonts.**',r=>r.abort());
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.evaluate(()=>__hofmann.storageReady);empty=await state();
  base=structuredClone(empty);base.contours=[capsule('1_1','1_2',1),capsule('5_4','5_5',2)];base.nextId=3;

  await test('Moving a support recalculates only its shape and matches the full engine',async()=>{
    await load();const before=await state();await drag([120,120],[128,125]);assert.deepEqual(await scope(),{mode:'targeted',total:2,affected:1,skipped:1,passes:1});
    assert.deepEqual((await state()).contours.find(c=>c.id===2),before.contours[1]);await fullComparison(before);await undo();assert.deepEqual(await state(),before);
  });
  await test('Removing a support uses its old influence and leaves a distant shape untouched',async()=>{
    await load();const before=await state();await page.evaluate(()=>__hofmann.selectNodes(['1_1']));await page.locator('#nodeDelete').click();await idle();assert.equal((await scope()).affected,1);assert.deepEqual((await state()).contours.find(c=>c.id===2),before.contours[1]);await fullComparison(before,{'1_1':null});
  });
  await test('Local merge includes interacting shapes and applies in one undo without a size panel',async()=>{
    const data=structuredClone(base);data.contours=[single('1_1',1),single('1_2',3),data.contours[1]];data.nextId=4;await load(data);const before=await state();await page.evaluate(()=>__hofmann.selectNodes(['1_1','1_2']));await page.locator('#nodeMerge').click();await idle();
    assert.equal(await page.locator('#mergeSize,#nodeMergePreview,#mergeApply').count(),0);assert.equal((await scope()).affected,2);assert.equal((await scope()).skipped,1);assert.equal((await state()).contours.length,2);await fullComparison(before,{'1_1':'1_1','1_2':'1_1'});await undo();assert.deepEqual(await state(),before);
  });
  await test('Adding a distant support skips all contour work; adding inside a shape still creates a hole',async()=>{
    await load();const before=await state();await page.locator('#nodeAdd').click();await click(330,120);await idle();assert.equal((await scope()).affected,0);assert.deepEqual((await state()).contours,before.contours);await fullComparison(before);
    await load(empty);await page.evaluate(()=>__hofmann.startRelax([{x:90,y:90},{x:270,y:90},{x:270,y:270},{x:90,y:270}],false));await idle();const data=await state();data.contours.push(single('6_6',99));data.nextId=100;await load(data);const old=await state();await page.locator('#nodeAdd').click();await click(150,150);await idle();assert.equal((await scope()).affected,1);assert.ok((await state()).contours[0].holes.includes('-1_1'));await fullComparison(old);
  });
  await test('Moving a negative support retains its hole and skips a distant shape',async()=>{
    await load(empty);await page.evaluate(()=>__hofmann.startRelax([{x:90,y:90},{x:270,y:90},{x:270,y:270},{x:90,y:270}],false));await idle();await page.evaluate(()=>__hofmann.subtractLoop([{x:155,y:155},{x:205,y:155},{x:205,y:205},{x:155,y:205}]));await idle();const data=await state();data.contours.push(single('6_6',99));data.nextId=100;await load(data);const before=await state();await drag([180,180],[185,185]);assert.equal((await scope()).affected,1);assert.equal((await scope()).skipped,1);await fullComparison(before);
  });
  await test('Individual size changes are targeted; global size still updates every shape',async()=>{
    await load();const before=await state(),q=await point(120,120);await page.mouse.dblclick(q.x,q.y);await change('szRange',45);await page.locator('#szOk').click();await idle();assert.equal((await scope()).affected,1);assert.deepEqual((await state()).contours.find(c=>c.id===2),before.contours[1]);
    await change('sizeIn',40);assert.equal(await scope(),null);assert.ok(await page.evaluate(()=>__hofmann.state.contours.every(__hofmann.validContour)));
  });
  await test('A drawing with many separated shapes avoids unrelated recalculation with identical pixels',async()=>{
    const data=structuredClone(empty);data.cols=data.rows=15;data.contours=[];let id=1;for(const i of [1,5,9])for(const j of [1,5,9,12])data.contours.push(capsule(i+'_'+j,i+'_'+(j+1),id++));data.nextId=id;await load(data);const before=await state();await drag([120,120],[128,125]);const local=await scope(),targetedMs=await page.evaluate(()=>__hofmann.engineInfo.lastMs);assert.equal(local.affected,1);assert.equal(local.skipped,11);const full=await fullComparison(before);fs.writeFileSync(path.join(out,'targeted-performance.json'),JSON.stringify({...local,targetedMs,fullMs:full.fullMs,pixelDifferences:full.different},null,2));
  });
  await test('Size pipette samples without editing, repeats the size and undoes each application once',async()=>{
    const data=structuredClone(empty);data.nodes={'1_1':{pct:40,filled:true}};await load(data);const before=await state();await pick(120,120);assert.deepEqual(await state(),before);assert.equal(await page.locator('#nodeCount').innerText(),'40 %');await click(300,300);await idle();assert.equal((await state()).nodes['4_4'].pct,40);assert.equal((await state()).nodes['4_4'].filled,undefined);
    await click(360,300);await idle();assert.equal((await state()).nodes['4_5'].pct,40);await page.screenshot({path:path.join(out,'size-pipette-desktop.png')});await undo();assert.equal((await state()).nodes['4_5'],undefined);assert.equal((await state()).nodes['4_4'].pct,40);await undo();assert.deepEqual(await state(),before);
  });
  await test('Copied sizes respect collisions and roundness without altering the source',async()=>{
    const data=structuredClone(empty);data.version=3;data.bevel=0;data.nodes={'-1_20':{x:30,y:30,pct:80,homeX:30,homeY:30},'1_1':{pct:30}};await load(data);await pick(30,30);await click(120,120);await idle();const s=await state();assert.equal(s.nodes['-1_20'].pct,80);assert.ok(s.nodes['1_1'].pct<=80);assert.ok(await page.evaluate(()=>{const h=__hofmann,n=h.nodeOf('1_1');return h.activeKeys().filter(k=>k!=='1_1').every(k=>h.gapNodes(n,h.nodeOf(k))>=1.999);}));
    await page.locator('#nodePickSize').click();const large=structuredClone(empty);large.version=3;large.nodes={'-1_20':{x:25,y:25,pct:300,homeX:25,homeY:25}};await load(large);await pick(25,25);await click(300,300);await idle();assert.ok((await state()).nodes['4_4'].pct<300);assert.match(await page.locator('#status').innerText(),/limited/);
  });
  await test('Size copying is mirrored, proportional after global resize, and accepts zero',async()=>{
    const data=structuredClone(empty);data.sym='v';data.nodes={'1_1':{pct:40}};await load(data);const before=await state();await pick(120,120);await click(120,180);await idle();assert.equal((await state()).nodes['2_1'].pct,40);assert.equal((await state()).nodes['2_5'].pct,40);await undo();assert.deepEqual(await state(),before);
    data.sym='none';await load(data);await pick(120,120);await click(300,300);await idle();await change('sizeIn',35);assert.ok(Math.abs((await state()).nodes['4_4'].pct-40*35/71)<.001);
    data.nodes['1_1'].pct=0;await load(data);await pick(120,120);await click(300,300);await idle();assert.equal((await state()).nodes['4_4'].pct,0);assert.equal(await page.locator('.guide-dot[data-guide="4_4"]').count(),1);
  });
  await test('Pipette drags and Escape never apply size; switching to Add and selection exits the pipette',async()=>{
    const data=structuredClone(empty);data.nodes={'1_1':{pct:40}};await load(data);await pick(120,120);const before=await state();await drag([300,300],[305,310]);assert.deepEqual(await state(),before);
    const q=await point(300,300);await page.mouse.move(q.x,q.y);await page.mouse.down();await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await state(),before);assert.equal(await page.locator('#nodePickSize').getAttribute('aria-pressed'),'false');
    await pick(120,120);await page.locator('#nodeAdd').click();assert.equal(await page.locator('#nodePickSize').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#nodeAdd').getAttribute('aria-pressed'),'true');await page.keyboard.press('v');assert.equal(await page.locator('#nodeAdd').getAttribute('aria-pressed'),'false');
  });
  await test('Holding the eye hides editing guides and reference without changing layout, selection or export',async()=>{
    const data=structuredClone(base);data.reference={src:await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=20;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,20,20);return c.toDataURL();}),width:20,height:20,opacity:.4,visible:true};await load(data);await click(150,120);const before=await state(),box=await page.locator('#canvas').boundingBox(),selected=await page.evaluate(()=>__hofmann.state.selected),exported=await page.evaluate(()=>__hofmann.exportSvgString(false));
    const eye=await page.locator('#previewBtn').boundingBox();await page.mouse.move(eye.x+eye.width/2,eye.y+eye.height/2);await page.mouse.down();assert.equal(await page.locator('.app.preview-only').count(),1);assert.equal(await page.locator('.guide').first().evaluate(e=>getComputedStyle(e).visibility),'hidden');assert.equal(await page.locator('#referenceImage').evaluate(e=>getComputedStyle(e).visibility),'hidden');assert.deepEqual(await page.locator('#canvas').boundingBox(),box);assert.equal(await page.locator('#previewBtn').isVisible(),true);await page.screenshot({path:path.join(out,'instant-preview-desktop.png')});
    assert.equal(await page.locator('#previewBtn').evaluate(e=>getComputedStyle(e).color!==getComputedStyle(e).backgroundColor),true);
    const centre=await point(240,240);await page.mouse.move(centre.x,centre.y);await page.mouse.wheel(0,-300);assert.equal(await page.evaluate(()=>__hofmann.camera.zoom),1);
    await page.mouse.move(5,5);await page.mouse.up();assert.equal(await page.locator('.app.preview-only').count(),0);assert.equal(await page.locator('#referenceImage').evaluate(e=>getComputedStyle(e).visibility),'visible');assert.deepEqual(await state(),before);assert.equal(await page.evaluate(()=>__hofmann.state.selected),selected);assert.equal(await page.evaluate(()=>__hofmann.exportSvgString(false)),exported);
  });
  await test('Keyboard preview blocks edits, restores on Escape or blur, and ignores text input',async()=>{
    await load();await click(150,120);const before=await state(),selected=await page.evaluate(()=>__hofmann.state.selected);await page.keyboard.down('h');assert.equal(await page.locator('.app.preview-only').count(),1);await page.keyboard.press('Delete');assert.deepEqual(await state(),before);await page.keyboard.press('Escape');await page.keyboard.up('h');assert.equal(await page.locator('.app.preview-only').count(),0);assert.equal(await page.evaluate(()=>__hofmann.state.selected),selected);
    await page.keyboard.down('h');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('h');assert.equal(await page.locator('.app.preview-only').count(),0);await page.locator('#shapeHex').focus();await page.keyboard.down('h');assert.equal(await page.locator('.app.preview-only').count(),0);await page.keyboard.up('h');await page.keyboard.press('Escape');
  });
  await test('Touch pipette keeps the keyboard closed, cancels on pinch, and touch preview cannot paint',async()=>{
    const ctx=await browser.newContext({viewport:{width:393,height:851},isMobile:true,hasTouch:true}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
    try{await p.goto(url);const data=structuredClone(base);data.nodes={'1_1':{pct:40}};await load(data,p);const height=await p.locator('#canvas').evaluate(e=>e.getBoundingClientRect().height);await pick(120,120,p);await click(300,300,p);await idle(p);assert.equal((await state(p)).nodes['4_4'].pct,40);assert.notEqual(await p.evaluate(()=>document.activeElement.type),'number');assert.equal(await p.locator('#canvas').evaluate(e=>e.getBoundingClientRect().height),height);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.screenshot({path:path.join(out,'size-pipette-mobile.png')});
      const cdp=await ctx.newCDPSession(p),a=await point(360,300,p),before=await state(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a,{x:a.x-55,y:a.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.deepEqual(await state(p),before);
      const eye=await p.locator('#previewBtn').boundingBox(),e={x:eye.x+eye.width/2,y:eye.y+eye.height/2};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[e]});assert.equal(await p.locator('.app.preview-only').count(),1);await p.screenshot({path:path.join(out,'instant-preview-mobile.png')});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[e,a]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await p.locator('.app.preview-only').count(),0);assert.deepEqual(await state(p),before);
    }finally{await ctx.close();}
  });
  await test('Targeted edits and size pipette also work without a Worker',async()=>{
    const ctx=await browser.newContext();await ctx.addInitScript(()=>{window.Worker=undefined;});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));try{await p.goto(url);const data=structuredClone(base);data.nodes={'1_1':{pct:40}};await load(data,p);await p.locator('#nodePickSize').click();for(const xy of [[120,120],[360,360]]){const q=await point(...xy,p);await p.mouse.click(q.x,q.y);await idle(p);}assert.equal((await state(p)).nodes['5_5'].pct,40);assert.equal((await scope(p)).affected,1);assert.equal((await scope(p)).skipped,1);assert.equal(await p.evaluate(()=>__hofmann.engineInfo.worker),false);}finally{await ctx.close();}
  });
  await test('No runtime errors',async()=>assert.deepEqual(errors,[]));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'fluid-tools.json'),JSON.stringify({results,errors},null,2));console.log(results.filter(r=>r.passed).length+'/'+results.length+' fluid-tool scenarios passed');if(results.some(r=>!r.passed))process.exitCode=1;if(browser)await browser.close();server.close();});
