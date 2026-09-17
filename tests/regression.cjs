const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.TEST_OUTPUT || path.join(root, 'test-results'));
fs.mkdirSync(output, { recursive: true });
const target = process.env.TEST_APP || path.join(root, 'hofmann-trace.html');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(target));
});
const results = [];
let browser, context, page, base, baseURL;
const errors = [];
const rect = (x1,y1,x2,y2) => [{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}];
const bug01 = JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','bug01.json'),'utf8'));
async function test(name, fn) {
  if(process.env.TEST_FILTER && !new RegExp(process.env.TEST_FILTER).test(name)) return;
  const start = Date.now();
  try { await fn(); results.push({name, passed:true, ms:Date.now()-start}); console.log('PASS '+name); }
  catch(e) { results.push({name, passed:false, error:e.message}); console.error('FAIL '+name+'\n'+e.stack); }
}
async function load(data=base) {
  const ok = await page.evaluate(data=>window.__hofmann.loadProject(JSON.stringify(data)), data);
  assert.notEqual(ok,false, 'project import rejected');
  await page.evaluate(()=>window.__hofmann.whenIdle ? window.__hofmann.whenIdle() : undefined);
}
async function state() { return page.evaluate(()=>JSON.parse(window.__hofmann.projectJson())); }
async function pixels(points, withBg=false) {
  return page.evaluate(async ({points,withBg})=>{
    const h=window.__hofmann;
    const image=new Image(); image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(h.exportSvgString(withBg));
    await image.decode(); const canvas=document.createElement('canvas'); canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    return points.map(([x,y])=>Array.from(ctx.getImageData(x,y,1,1).data));
  }, {points,withBg});
}
async function svgTap(x,y) {
  const point=await page.locator('#canvas').evaluate((svg,{x,y})=>{
    const p=new DOMPoint(x,y).matrixTransform(svg.getScreenCTM());return {x:p.x,y:p.y};
  },{x,y});
  await page.touchscreen.tap(point.x, point.y);
}
function capsule(a,b,id) { return { id,closed:true,members:[a,b],holes:[],notches:[],soft:[],necks:[],cut:true,tangents:[{a,b,fA:'A',fB:'A'},{a:b,b:a,fA:'A',fB:'A'}] }; }
async function subtract(points) { await page.evaluate(points=>window.__hofmann.subtractLoop(points), points); }
async function shot(name) { await page.screenshot({path:path.join(output,name+'.png')}); }
async function smoothOutline(){
  const report=await page.evaluate(()=>{
    const h=window.__hofmann;
    return h.state.contours.map(c=>{
      const sg=h.contourSegments(c), dirs=[];let cur=sg.start;
      const unit=v=>{const n=Math.hypot(v.x,v.y);return n>1e-7?{x:v.x/n,y:v.y/n}:null;};
      for(const g of sg.segs){
        if(g.t==='L'){
          const d=unit({x:g.to.x-cur.x,y:g.to.y-cur.y});if(d)dirs.push({start:d,end:d});
        }else{
          const sign=g.flow==='O'?1:-1;
          dirs.push({start:unit({x:-sign*(cur.y-g.c.y),y:sign*(cur.x-g.c.x)}),end:unit({x:-sign*(g.to.y-g.c.y),y:sign*(g.to.x-g.c.x)})});
        }
        cur=g.to;
      }
      return {valid:h.validContour(c), joins:dirs.map((d,i)=>{const next=dirs[(i+1)%dirs.length].start;return d.end.x*next.x+d.end.y*next.y;})};
    });
  });
  assert.ok(report.length>0);
  for(const item of report){assert.equal(item.valid,true);assert.ok(item.joins.every(dot=>dot>0.99999),'non-tangent join: '+Math.min(...item.joins));}
}

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  baseURL='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
  context=await browser.newContext({viewport:{width:393,height:851},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await context.route('https://fonts.**', route=>route.abort());
  await context.addInitScript(()=>{window.showSaveFilePicker=undefined;});
  page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(baseURL);
  await page.evaluate(points=>window.__hofmann.startRelax(points,false),rect(90,90,390,390));
  await page.waitForFunction(()=>window.__hofmann.state.contours.length===1 && !document.querySelector('.band'));
  base=await state();

  await test('Overlapping negative contours remain empty (SVG and canvas)',async()=>{
    const fixture=structuredClone(base);
    fixture.contours[0].cuts=[capsule('3_2','3_4',100),capsule('2_3','4_3',101)];
    await load(fixture);
    const p=await pixels([[240,240],[180,240],[240,180],[120,120]]);
    assert.equal(p[0][3],0,'overlap of negative regions was refilled');
    assert.equal(p[1][3],0);assert.equal(p[2][3],0);assert.equal(p[3][3],255);
    const eps=await page.evaluate(()=>window.__hofmann.exportEpsString(false));
    assert.equal((eps.match(/eoclip/g)||[]).length,2);
    fs.writeFileSync(path.join(output,'overlapping-cuts.svg'),await page.evaluate(()=>window.__hofmann.exportSvgString(false)));
    fs.writeFileSync(path.join(output,'overlapping-cuts.eps'),eps);
    await shot('overlapping-cuts');
  });
  await test('Single hole extended through the exterior',async()=>{
    await load(); await subtract(rect(215,215,265,265));
    assert.deepEqual((await state()).contours[0].holes,['3_3']);
    await subtract(rect(215,215,445,265));
    assert.equal((await state()).contours.length,1);
    assert.equal((await state()).contours[0].cuts.length,0,'open cut must become part of the exterior band');
    await smoothOutline();
    for(const p of await pixels([[240,240],[300,240],[360,240],[420,240]])) assert.equal(p[3],0);
    assert.equal((await pixels([[300,180]]))[0][3],255);
    await shot('single-hole-to-exterior');
  });
  await test('bug01 import rebuilds one continuous band tangent to the circles',async()=>{
    await load(bug01);
    const repaired=await state();assert.equal(repaired.contours.length,1);
    assert.equal(repaired.contours[0].cuts.length,0,'the opening is still a clipped intersection');
    assert.equal(repaired.contours[0].holes.length,0);
    assert.deepEqual(repaired.contours[0].members.slice().sort(),bug01.contours[0].members.slice().sort());
    await smoothOutline();
    const bytes=await pixels([[150,100],[135,130],[180,180],[240,180],[300,120],[120,120]]);
    assert.equal(bytes[0][3],0,'old projecting corner still exists');assert.equal(bytes[1][3],255,'left supporting circle lost');
    assert.equal(bytes[2][3],0);assert.equal(bytes[3][3],0);assert.equal(bytes[4][3],255);assert.equal(bytes[5][3],255);
    fs.writeFileSync(path.join(output,'bug01-corrige.json'),JSON.stringify(repaired,null,2));
    fs.writeFileSync(path.join(output,'bug01-corrige.svg'),await page.evaluate(()=>window.__hofmann.exportSvgString(true)));
    await shot('bug01-mobile');
    const svgBefore=await page.evaluate(()=>window.__hofmann.exportSvgString(true));await load(repaired);
    assert.equal(await page.evaluate(()=>window.__hofmann.exportSvgString(true)),svgBefore);
  });
  await test('bug01 new negative lasso opens the hole with circle tangents',async()=>{
    const before=structuredClone(bug01),cut=before.contours[0].cuts[0];
    const ks=['1_2','2_2','2_3','1_3'];cut.members=ks;
    cut.tangents=ks.map((a,i)=>({a,b:ks[(i+1)%ks.length],fA:'A',fB:'A'}));
    await load(before);assert.equal((await state()).contours[0].cuts.length,1);
    await subtract(rect(155,35,265,145));
    assert.equal((await state()).contours[0].cuts.length,0);await smoothOutline();
    const after=await pixels([[150,100],[150,130],[180,180],[240,180]]);
    await page.locator('#undoBtn').tap();assert.equal((await state()).contours[0].cuts.length,1);
    await page.locator('#redoBtn').tap();assert.deepEqual(await pixels([[150,100],[150,130],[180,180],[240,180]]),after);await smoothOutline();
  });
  await test('bug01 resizing keeps tangent joins and cancel restores the exact shape',async()=>{
    await load(bug01);const before=await page.evaluate(()=>window.__hofmann.exportSvgString(true));
    await svgTap(120,120);await page.locator('#szInput').fill('65');await page.locator('#szInput').dispatchEvent('change');
    await smoothOutline();assert.equal((await state()).contours[0].cuts.length,0);
    await page.locator('#szCancel').tap();assert.equal(await page.evaluate(()=>window.__hofmann.exportSvgString(true)),before);
  });
  await test('An opened hole crossing both sides preserves two smooth islands',async()=>{
    await load();await subtract(rect(215,215,265,265));await subtract(rect(35,215,445,265));
    assert.equal((await state()).contours.length,2,'one of the surviving pieces was lost or rejoined');
    assert.equal((await pixels([[240,180],[240,300]]))[0][3],255);
    assert.equal((await pixels([[240,180],[240,300]]))[1][3],255);
    assert.equal((await pixels([[240,240]]))[0][3],0);
    await smoothOutline();
  });
  await test('Multi-circle hole extended through exterior, reversed lasso and diagonal',async()=>{
    for(const reverse of [false,true]){
      await load(); const hole=rect(155,215,265,265);await subtract(reverse?hole.reverse():hole);
      const channel=rect(215,215,445,265);await subtract(reverse?channel.reverse():channel);
      assert.equal((await state()).contours.length,1);
      for(const p of await pixels([[180,240],[240,240],[300,240],[380,240]])) assert.equal(p[3],0);
      const before=await pixels([[180,240],[240,240],[300,180]]);
      await page.locator('#undoBtn').tap();await page.locator('#redoBtn').tap();
      assert.deepEqual(await pixels([[180,240],[240,240],[300,180]]),before);
    }
    await load();await subtract(rect(155,215,265,265));
    await subtract([{x:217,y:218},{x:398,y:37},{x:443,y:82},{x:262,y:263}]);
    assert.equal((await pixels([[180,240],[240,240],[360,120]]))[0][3],0);
    assert.equal((await pixels([[240,240]]))[0][3],0);
    await shot('diagonal-cut');
  });
  await test('Overlapping hole and cut cannot refill each other',async()=>{
    const fixture=structuredClone(base);fixture.contours[0].holes=['3_3'];fixture.contours[0].cuts=[capsule('3_2','3_4',102)];
    await load(fixture);assert.equal((await pixels([[240,240]]))[0][3],0);
  });
  await test('Interior subtraction preserves the exterior pixels',async()=>{
    await load();const pts=[[99,150],[98,150],[120,120],[360,120],[300,380]], before=await pixels(pts);
    await subtract(rect(155,215,265,265));assert.deepEqual(await pixels(pts),before);
  });
  await test('Rounded and square nodes retain negative regions',async()=>{
    for(const bevel of [0,.5,1]){
      const fixture=structuredClone(base);fixture.bevel=bevel;await load(fixture);
      await page.evaluate(()=>{window.__hofmann.settle(null);window.__hofmann.render();});
      await subtract(rect(155,215,265,265));await subtract(rect(215,215,445,265));
      for(const p of await pixels([[180,240],[240,240],[300,240]])) assert.equal(p[3],0,'bevel '+bevel);
      assert.equal((await pixels([[300,180]]))[0][3],255);
    }
  });
  await test('Crossing cuts are not selectable in their empty intersection',async()=>{
    const fixture=structuredClone(base);fixture.contours[0].cuts=[capsule('3_2','3_4',100),capsule('2_3','4_3',101)];await load(fixture);
    const isShape=await page.locator('#canvas').evaluate(svg=>{
      const p=new DOMPoint(240,240).matrixTransform(svg.getScreenCTM());
      return document.elementsFromPoint(p.x,p.y).some(el=>el.classList.contains('shape'));
    });assert.equal(isShape,false);
  });
  await test('Clearing an in-progress lasso prevents shapes from reappearing',async()=>{
    await load();
    await page.evaluate(points=>{window.__hofmann.startRelax(points,false);document.querySelector('#clearBtn').click();},rect(20,20,90,90));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal((await state()).contours.length,0);
  });
  await test('Mobile layout and settings never submit a form or download',async()=>{
    await load();
    assert.equal(await page.evaluate(()=>innerWidth),393);
    await page.evaluate(()=>{
      window.submissions=0;const form=document.createElement('form');form.id='settingsTestHost';document.body.appendChild(form);form.appendChild(document.querySelector('.app'));
      form.addEventListener('submit',e=>{e.preventDefault();window.submissions++;});
    });
    let downloads=0;const listener=()=>downloads++;page.on('download',listener);
    await page.locator('#settingsBtn').tap();
    assert.equal(await page.locator('#settingsBtn').getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('#side').evaluate(el=>getComputedStyle(el).visibility),'visible');
    assert.equal(await page.evaluate(()=>window.submissions),0);assert.equal(downloads,0);
    assert.equal(await page.locator('dialog[open]').count(),0);
    await shot('mobile-settings');await page.locator('#settingsBtn').tap();page.off('download',listener);
    const buttons=await page.locator('.bar button.ibtn').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};}));
    assert.ok(buttons.every(r=>r.left>=0 && r.right<=393 && r.width>=44));
    await page.evaluate(()=>{const f=document.querySelector('#settingsTestHost');document.body.appendChild(document.querySelector('.app'));f.remove();});
  });
  await test('Circle tap prioritises slider and leaves canvas size unchanged',async()=>{
    const before=await page.locator('#canvas').boundingBox();
    await svgTap(240,240);assert.equal(await page.evaluate(()=>document.activeElement.id),'szRange');
    const after=await page.locator('#canvas').boundingBox();assert.equal(after.width,before.width);assert.equal(after.height,before.height);
    await shot('mobile-size-slider');
    await page.locator('#szInput').tap();assert.equal(await page.evaluate(()=>document.activeElement.id),'szInput');
    await page.locator('#szInput').fill('65');await page.locator('#szOk').tap();
    assert.equal((await state()).nodes['3_3'].pct,65);
  });
  await test('Touch selection reveals tangents and smoothing stays visible',async()=>{
    await load();await svgTap(150,150);
    assert.ok(await page.locator('.tan-hit.revealed').count()>0);
    assert.equal((await state()).contours[0].necks.length,0);
    const before=await page.locator('.tan-marker').first().evaluate(el=>getComputedStyle(el).stroke);assert.notEqual(before,'rgba(0, 0, 0, 0)');
    await svgTap(150,99.7);
    assert.ok((await state()).contours[0].necks.length>0);
    assert.ok(await page.locator('.tan-hit.revealed.necked').count()>0);
    assert.ok((await page.locator('.tan-hit.revealed.necked').first().getAttribute('d')).includes('A'));
    await shot('mobile-metaball');
  });
  await test('Grid dimensions, rotation and project settings undo completely',async()=>{
    await load();await page.locator('#settingsBtn').tap();
    await page.locator('#colsIn').fill('9');await page.locator('#colsIn').dispatchEvent('change');
    await page.locator('#settingsBtn').tap();
    assert.equal((await state()).cols,9);await page.locator('#undoBtn').tap();
    assert.equal((await state()).cols,7);assert.equal((await state()).contours.length,1);
    const wide=structuredClone(base);wide.cols=9;wide.defaultPct=0;wide.shapeColor='#224466';await load(wide);
    assert.equal((await state()).defaultPct,0);
    await page.locator('#settingsBtn').tap();await page.locator('#rotR').tap();await page.locator('#settingsBtn').tap();
    assert.equal((await state()).rows,9);await page.locator('#undoBtn').tap();
    assert.equal((await state()).rows,7);assert.equal((await state()).cols,9);
    await page.locator('#undoBtn').tap();assert.equal((await state()).shapeColor,base.shapeColor);
  });
  await test('Invalid project data is rejected atomically',async()=>{
    await load();const before=await state();
    for(const change of [p=>p.contours[0].id='1" onload="alert(1)',p=>p.nodes={'999_3':{pct:20}},p=>p.contours[0].tangents[0].fA='invalid',p=>p.contours[0].members=['__proto__'],p=>p.cols=-1]){
      const bad=structuredClone(base);change(bad);
      assert.equal(await page.evaluate(p=>window.__hofmann.loadProject(JSON.stringify(p)),bad),false);
      assert.deepEqual(await state(),before);
    }
  });
  await test('SVG, EPS, PNG, JPEG and project downloads work without Claude',async()=>{
    await load();
    for(const fmt of ['svg','eps','png','jpg','json']){
      await page.locator('#exportBtn').tap();
      const event=page.waitForEvent('download');await page.locator('[data-fmt="'+fmt+'"]').first().tap();
      if(fmt==='json' && await page.locator('#saveProjectDlg').count())await page.locator('#saveProjectConfirm').tap();
      const download=await event;const saved=path.join(output,download.suggestedFilename());await download.saveAs(saved);
      assert.ok(fs.statSync(saved).size>100);
      const bytes=fs.readFileSync(saved);
      if(fmt==='png') assert.equal(bytes.subarray(1,4).toString(),'PNG');
      if(fmt==='jpg') assert.equal(bytes.subarray(0,2).toString('hex'),'ffd8');
      if(fmt==='json') assert.equal(JSON.parse(bytes.toString()).app,'hofmann-trace');
    }
    await page.evaluate(()=>{const h=window.__hofmann;h.state.contours=[];h.state.nodes={'3_3':{pct:71,filled:true}};h.render();});
    await page.locator('#exportBtn').tap();const download=page.waitForEvent('download');await page.locator('[data-fmt="svg"]').tap();assert.ok(await download);
  });
  await test('Native sharing receives a JPEG during the user activation',async()=>{
    await load();
    await page.evaluate(()=>{
      window.shareCalls=[];
      Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
      Object.defineProperty(navigator,'share',{configurable:true,value:data=>{
        window.shareCalls.push({active:navigator.userActivation.isActive,type:data.files[0].type,size:data.files[0].size});return Promise.resolve();
      }});
    });
    await page.waitForFunction(()=>!document.querySelector('#shareDownload').disabled);
    await page.locator('#shareBtn').tap();
    const calls=await page.evaluate(()=>window.shareCalls);assert.equal(calls.length,1);assert.equal(calls[0].active,true);assert.equal(calls[0].type,'image/jpeg');assert.ok(calls[0].size>1000);
  });
  await test('A cold share opens a visible preparation flow with a fresh Share tap',async()=>{
    await page.evaluate(()=>{
      const toBlob=HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob=function(...args){setTimeout(()=>toBlob.apply(this,args),200);};
      const h=window.__hofmann;h.state.shapeColor='#ff6633';h.render();window.shareCalls=[];
    });
    await page.locator('#shareBtn').tap();assert.equal(await page.locator('#shareDlg').evaluate(el=>el.open),true);
    await page.waitForFunction(()=>!document.querySelector('#shareReady').disabled);
    await page.locator('#shareReady').tap();assert.equal((await page.evaluate(()=>window.shareCalls))[0].active,true);
  });
  await test('Share permission failure and unsupported sharing offer a JPEG download',async()=>{
    await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:()=>Promise.reject(new DOMException('denied','NotAllowedError'))}));
    await page.locator('#shareBtn').tap();await page.waitForFunction(()=>document.querySelector('#shareDlg').open);
    assert.ok((await page.locator('#shareStatus').innerText()).includes('Download JPEG'));
    await shot('mobile-share-fallback');
    const event=page.waitForEvent('download');await page.locator('#shareDownload').tap();const download=await event;assert.equal(download.suggestedFilename(),'hofmann-trace.jpg');
    await page.locator('#shareClose').tap();
    await page.evaluate(()=>Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false}));
    await page.locator('#shareBtn').tap();assert.ok((await page.locator('#shareStatus').innerText()).includes('unavailable'));
    await page.locator('#shareClose').tap();
  });
  await test('Cancelling the native share never downloads automatically',async()=>{
    await page.evaluate(()=>{
      Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
      Object.defineProperty(navigator,'share',{configurable:true,value:()=>Promise.reject(new DOMException('cancelled','AbortError'))});
    });
    let count=0;const onDownload=()=>count++;page.on('download',onDownload);
    await page.locator('#shareBtn').tap();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Sharing cancelled.');
    assert.equal(count,0);page.off('download',onDownload);
  });
  await test('Desktop layout, project roundtrip and zero JavaScript errors',async()=>{
    const desktop=await browser.newPage({viewport:{width:1440,height:960}});desktop.on('pageerror',e=>errors.push(e.message));
    await desktop.route('https://fonts.**',route=>route.abort());await desktop.goto(baseURL);
    assert.equal(await desktop.evaluate(p=>window.__hofmann.loadProject(JSON.stringify(p)),base),true);
    const data=await desktop.evaluate(()=>window.__hofmann.projectJson());
    assert.equal(await desktop.evaluate(data=>window.__hofmann.loadProject(data),data),true);
    await desktop.screenshot({path:path.join(output,'desktop.png')});await desktop.close();
    assert.deepEqual(errors,[]);
  });
})().catch(e=>{console.error(e);results.push({name:'harness',passed:false,error:e.stack});}).finally(async()=>{
  if(browser) await browser.close();server.close();
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
  console.log(`${results.filter(r=>r.passed).length}/${results.length} tests passed`);
  process.exitCode=results.some(r=>!r.passed)?1:0;
});
