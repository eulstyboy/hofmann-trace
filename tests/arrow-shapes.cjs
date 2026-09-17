const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.TEST_OUTPUT||path.join(root,'test-results'));
fs.mkdirSync(out,{recursive:true});
const results=[],errors=[];let browser,context,page,base,empty,url;
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(fs.readFileSync(path.join(root,'hofmann-trace.html')));});
async function test(name,fn){
  if(process.env.TEST_FILTER&&!new RegExp(process.env.TEST_FILTER).test(name))return;
  const start=Date.now();try{await fn();results.push({name,passed:true,ms:Date.now()-start});console.log('PASS '+name);}
  catch(e){results.push({name,passed:false,error:e.stack});console.error('FAIL '+name+'\n'+e.stack);await page.screenshot({path:path.join(out,'arrow-failure-'+results.length+'.png')});}
}
const rect=(x1,y1,x2,y2)=>[{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}];
const state=(p=page)=>p.evaluate(()=>JSON.parse(__hofmann.projectJson()));
const selected=(p=page)=>p.evaluate(()=>__hofmann.state.selected);
const idle=(p=page)=>p.evaluate(()=>__hofmann.whenIdle());
const necks=async(p=page)=>(await state(p)).contours.reduce((n,c)=>n+(c.necks||[]).length+(c.cuts||[]).reduce((n,c)=>n+(c.necks||[]).length,0),0);
async function load(data=base,p=page){assert.equal(await p.evaluate(d=>__hofmann.loadProject(JSON.stringify(d)),data),true);await idle(p);await p.locator('[data-tool=select]').click();}
async function point(x,y,p=page){return p.locator('#canvas').evaluate((svg,{x,y})=>{const p=new DOMPoint(x,y).matrixTransform(svg.getScreenCTM());return{x:p.x,y:p.y};},{x,y});}
async function click(x,y,p=page){const q=await point(x,y,p);if(p===page)await p.mouse.click(q.x,q.y);else await p.touchscreen.tap(q.x,q.y);}
async function drag(x1,y1,x2,y2){const a=await point(x1,y1),b=await point(x2,y2);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:10});await page.mouse.up();await idle();}
async function undo(p=page){await p.locator('#undoBtn').click();await idle(p);}
function capsule(a,b,id){return{id,closed:true,members:[a,b],holes:[],notches:[],soft:[],necks:[],cut:true,tangents:[{a,b,fA:'A',fB:'A'},{a:b,b:a,fA:'A',fB:'A'}]};}
async function healthy(p=page){assert.equal(await p.evaluate(()=>__hofmann.state.contours.every(__hofmann.validContour)&&!/NaN|Infinity/.test(__hofmann.exportSvgString(false))&&!__hofmann.engineInfo.lastError),true);}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
  context=await browser.newContext({viewport:{width:1280,height:900}});await context.route('https://fonts.**',r=>r.abort());
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.evaluate(()=>__hofmann.storageReady);
  empty=await state();await page.evaluate(p=>__hofmann.startRelax(p,false),rect(90,90,390,390));await idle();base=await state();assert.equal(base.contours.length,1);

  await test('Arrow selects a shape without changing the drawing or overlapping action bars',async()=>{
    await load();await click(120,120);assert.equal(await page.locator('#nodeCount').textContent(),'1 selected');
    const before=await state();await click(150,150);assert.equal(await selected(),base.contours[0].id);
    assert.equal(await page.locator('#selFloat').evaluate(e=>e.classList.contains('open')),true);
    assert.equal(await page.locator('#nodeTools').isVisible(),false);assert.equal(await page.locator('[data-selected-node]').count(),0);
    assert.deepEqual(await state(),before);assert.ok(await page.locator('.tan-hit.revealed').count()>0);
    await click(30,30);assert.equal(await selected(),null);assert.equal(await page.locator('#nodeTools').isVisible(),true);
  });
  await test('Arrow toggles a tangent directly, supports Straighten, undo and redo',async()=>{
    await load();const before=await state();await click(150,98.7);assert.equal(await necks(),1);assert.equal(await selected(),base.contours[0].id);
    assert.equal(await page.locator('#tangentAction').innerText(),'Straighten');assert.ok(await page.locator('.tan-hit.necked').count()>0);
    await healthy();await page.screenshot({path:path.join(out,'arrow-metaball-desktop.png')});
    await page.locator('#tangentAction').click();assert.equal(await necks(),0);await undo();assert.equal(await necks(),1);
    await undo();assert.deepEqual(await state(),before);await page.locator('#redoBtn').click();await idle();assert.equal(await necks(),1);
  });
  await test('Switching from lasso to arrow keeps the selected shape and tangent action',async()=>{
    await load();await page.locator('[data-tool=lassoAdd]').click();await click(150,98.7);assert.equal(await necks(),1);
    const id=await selected();await page.locator('[data-tool=select]').click();assert.equal(await selected(),id);
    assert.equal(await page.locator('#tangentAction').isVisible(),true);assert.equal(await page.locator('#nodeTools').isVisible(),false);
    await page.locator('#tangentAction').click();assert.equal(await necks(),0);
  });
  await test('Dragging from a shape or tangent selects circles without toggling metaball',async()=>{
    await load();const before=await state();await drag(150,150,330,330);assert.equal(await page.locator('#nodeCount').textContent(),'9 selected');
    assert.equal(await selected(),null);assert.equal(await necks(),0);assert.deepEqual(await state(),before);
    await load();await drag(150,98.7,210,210);assert.equal(await page.locator('#nodeCount').textContent(),'2 selected');assert.equal(await necks(),0);assert.deepEqual(await state(),before);
    await page.keyboard.down('Shift');await drag(270,270,330,330);await page.keyboard.up('Shift');assert.equal(await page.locator('#nodeCount').textContent(),'3 selected');
  });
  await test('Circle dragging keeps its fast preview and one undo, with no stale tangent targets',async()=>{
    await load();await click(150,150);const before=await state(),a=await point(120,120),b=await point(128,125);
    await page.mouse.move(a.x,a.y);await page.mouse.down();assert.equal(await page.locator('.tan-hit').count(),0);
    await page.mouse.move(b.x,b.y,{steps:8});assert.equal(await selected(),null);assert.equal(await page.locator('.tan-hit').count(),0);
    await page.mouse.up();await idle();assert.ok((await state()).nodes['1_1'].x>120);assert.ok(await page.locator('.tan-hit').count()>0);
    await healthy();await undo();assert.deepEqual(await state(),before);
  });
  await test('Delete acts on the selected shape or circles, and Escape clears shape actions',async()=>{
    await load();await click(150,150);await page.keyboard.press('Delete');assert.equal((await state()).contours.length,0);assert.equal(await page.locator('[data-node]').count(),49);
    await undo();await click(120,120);await page.keyboard.press('Delete');await idle();assert.equal((await state()).nodes['1_1'].disabled,true);assert.equal((await state()).contours.length,1);
    await undo();await click(150,98.7);await page.keyboard.press('Escape');assert.equal(await selected(),null);
    assert.equal(await page.locator('#selFloat').evaluate(e=>e.classList.contains('open')),false);assert.equal(await page.locator('#tangentAction').isVisible(),false);assert.equal(await necks(),1);
  });
  await test('Empty cuts stay unselectable and negative tangents are editable with the arrow',async()=>{
    const data=structuredClone(base);data.contours[0].cuts=[capsule('3_2','3_3',100),capsule('2_3','4_3',101)];await load(data);await click(150,150);
    await click(210,240);assert.equal(await selected(),null);
    // Midpoint of a negative tangent, outside both endpoint circles.
    await click(210,217);const s=await state();assert.equal(s.contours[0].cuts[0].necks.length,1);assert.equal(s.contours[0].necks.length,0);
    assert.equal(await selected(),s.contours[0].id);await healthy();
  });
  await test('Zero smoothing keeps tangent handles editable and activates a tight metaball',async()=>{
    const data=structuredClone(base);data.fillet=0;await load(data);assert.ok(await page.locator('.tan-hit').count()>0);await click(150,98.7);
    assert.equal(await necks(),1);assert.equal(await selected(),base.contours[0].id);assert.ok(await page.locator('.tan-hit.necked').count()>0);
  });
  await test('Escape during a pressed tangent cancels its action, including after a selection drag',async()=>{
    await load();const before=await state(),a=await point(150,98.7),b=await point(330,330);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await state(),before);assert.equal(await selected(),null);
    await click(150,150);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.keyboard.press('Escape');await page.mouse.up();
    assert.equal(await selected(),null);assert.equal(await page.locator('[data-selected-node]').count(),0);assert.deepEqual(await state(),before);
  });
  await test('Metaball changes and undo remain atomic with mirrored shapes',async()=>{
    const data=structuredClone(empty);data.sym='v';await load(data);await page.evaluate(p=>__hofmann.startRelax(p,false),rect(90,90,210,270));await idle();assert.equal((await state()).contours.length,2);
    const before=await state();await click(150,98.7);assert.equal(await necks(),2);await healthy();await undo();assert.deepEqual(await state(),before);
  });
  await test('Changing tool or leaving the window while pressing a tangent never activates metaball',async()=>{
    await load();const before=await state(),a=await point(150,98.7);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.keyboard.press('l');await page.mouse.up();assert.deepEqual(await state(),before);assert.equal(await necks(),0);
    await page.locator('[data-tool=select]').click();await page.mouse.move(a.x,a.y);await page.mouse.down();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();assert.deepEqual(await state(),before);assert.equal(await necks(),0);
  });
  await test('Touch arrow reveals metaball handles, keeps the canvas size, and preserves double-tap sizing',async()=>{
    const ctx=await browser.newContext({viewport:{width:393,height:851},isMobile:true,hasTouch:true});await ctx.route('https://fonts.**',r=>r.abort());const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
    try{await p.goto(url);await load(base,p);const height=await p.locator('#canvas').evaluate(e=>e.getBoundingClientRect().height);
      await click(150,150,p);assert.equal(await selected(p),base.contours[0].id);
      assert.ok(await p.locator('.tan-hit.revealed').count()>0);assert.equal(await p.locator('.tan-marker').first().evaluate(e=>getComputedStyle(e).display),'block');
      await click(150,98.7,p);assert.equal(await necks(p),1);assert.equal(await p.locator('#tangentAction').innerText(),'Straighten');assert.equal(await p.locator('#nodeTools').isVisible(),false);
      assert.equal(await p.locator('#canvas').evaluate(e=>e.getBoundingClientRect().height),height);assert.notEqual(await p.evaluate(()=>document.activeElement.type),'number');
      await p.screenshot({path:path.join(out,'arrow-metaball-mobile.png')});
      // Tap the middle of the curved neck itself to reverse it.
      const q=await p.locator('.tan-hit.necked').first().evaluate(el=>{const q=el.getPointAtLength(el.getTotalLength()/2);const v=new DOMPoint(q.x,q.y).matrixTransform(el.getScreenCTM());return{x:v.x,y:v.y};});
      await p.touchscreen.tap(q.x,q.y);assert.equal(await necks(p),0);
      await click(120,120,p);await click(120,120,p);await p.locator('#sizePop.open').waitFor();assert.equal(await p.evaluate(()=>document.activeElement.type),'range');
      assert.equal(await p.locator('#canvas').evaluate(e=>e.getBoundingClientRect().height),height);await healthy(p);
    }finally{await ctx.close();}
  });
  await test('Pinch cancels a pending tangent or shape-selection drag without editing the drawing',async()=>{
    const ctx=await browser.newContext({viewport:{width:393,height:851},isMobile:true,hasTouch:true});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
    try{await p.goto(url);await load(base,p);await click(150,150,p);const before=await state(p),cdp=await ctx.newCDPSession(p),a=await point(150,98.7,p);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a,{x:a.x+55,y:a.y}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[a,{x:a.x+95,y:a.y}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.deepEqual(await state(p),before);assert.equal(await necks(p),0);
      await p.locator('#zoomReset').tap();const start=await point(150,150,p),end=await point(270,270,p);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[end]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[end,{x:end.x+50,y:end.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert.deepEqual(await state(p),before);assert.equal(await selected(p),base.contours[0].id);assert.equal(await p.locator('[data-selected-node]').count(),0);
    }finally{await ctx.close();}
  });
  await test('No runtime errors',async()=>assert.deepEqual(errors,[]));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  fs.writeFileSync(path.join(out,'arrow-shapes.json'),JSON.stringify({results,errors},null,2));console.log(results.filter(r=>r.passed).length+'/'+results.length+' arrow-shape scenarios passed');
  if(results.some(r=>!r.passed))process.exitCode=1;if(browser)await browser.close();server.close();
});
