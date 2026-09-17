const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');const read=n=>fs.readFileSync(path.join(root,'src',n),'utf8');
const worker=read('worker-host.js').replace('/* ENGINE */',read('geometry.js')+'\n'+read('layout.js')+'\n'+read('local-geometry.js')+'\n'+read('engine.js')+'\n'+read('boolean.js'));
new vm.Script(worker,{filename:'geometry-worker.js'});
const modules=['state','geometry','layout','local-geometry','history','render','engine','boolean','worker-client','viewport','paint','reference','node-add','node-editor','quick-tools','controls','export','project-save','storage','share','pwa','boot'];
const app='(function(){\nvar WORKER_SOURCE = '+JSON.stringify(worker)+';\n'+modules.map(n=>read(n+'.js')).join('\n')+'\n})();';
new vm.Script(app,{filename:'app.js'});
const html=read('template.html').replace('<!-- STYLES -->',read('styles.css')).replace('<!-- APP -->',app.replace(/<\/script/gi,'<\\/script'));
const siteHtml=html.replace('</head>','<link rel="manifest" href="./manifest.webmanifest"><link rel="icon" href="./icon.svg"></head>');
fs.writeFileSync(path.join(root,'hofmann-trace.html'),html);
fs.writeFileSync(path.join(root,'index.html'),siteHtml);
fs.mkdirSync(path.join(root,'site'),{recursive:true});
fs.writeFileSync(path.join(root,'site/index.html'),siteHtml);
fs.mkdirSync(path.join(root,'public'),{recursive:true});
fs.writeFileSync(path.join(root,'public/index.html'),siteHtml);
for(const f of ['manifest.webmanifest','sw.js','icon.svg','icon-192.png','icon-512.png']){
  if(fs.existsSync(path.join(root,'src',f))){
    fs.copyFileSync(path.join(root,'src',f),path.join(root,f));
    fs.copyFileSync(path.join(root,'src',f),path.join(root,'site',f));
    fs.copyFileSync(path.join(root,'src',f),path.join(root,'public',f));
  }
}
console.log('Built standalone HTML and installable site.');
