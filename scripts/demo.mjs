import { mkdir, cp, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createDashboard } from '../src/server.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../.saga/demo');
const exists=await access(path.join(root,'exchange.config.json')).then(()=>true).catch(()=>false);
if(!exists){
  await mkdir(root,{recursive:true});await cp(new URL('../examples/demo/',import.meta.url),root,{recursive:true});
  const git=(...args)=>execFileSync('git',args,{cwd:root,windowsHide:true,stdio:'ignore'});
  git('init','-b','main');git('config','user.name','SAGA demo');git('config','user.email','saga-demo@example.invalid');git('add','.');git('commit','-m','demo: initial synthetic mailboxes');
}
const {server}=await createDashboard(root);
server.listen(Number(process.env.PORT||4318),'127.0.0.1',()=>console.log(`SAGA demo: http://127.0.0.1:${server.address().port}`));
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
