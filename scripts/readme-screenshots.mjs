// Regenerate README images with synthetic data; never opens a real workspace.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { createDashboard } from '../src/server.mjs';
import { mailboxText, recordHash } from '../src/protocol.mjs';
if (!process.argv[2]) throw new Error('Pass an installed Playwright module path.');
const imported=await import(pathToFileURL(path.resolve(process.argv[2])).href),{chromium}=imported.default||imported;
const root=await mkdtemp(path.join(os.tmpdir(),'saga-readme-')),output=path.resolve('docs/screenshots');let app,browser;
// Onboarding runs against an isolated Git configuration and shows example paths instead of temporary ones.
const sandbox=await mkdtemp(path.join(os.tmpdir(),'saga-readme-setup-')),gitConfig=path.join(sandbox,'gitconfig');
await writeFile(gitConfig,'[user]\n\tname = Documentation example\n\temail = example@example.invalid\n[init]\n\tdefaultBranch = main\n');
Object.assign(process.env,{GIT_CONFIG_GLOBAL:gitConfig,GIT_CONFIG_NOSYSTEM:'1'});
async function captureOnboarding(browser){
 const appRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),home=path.join(sandbox,'home');await mkdir(home);
 const pairs=[[appRoot,'/home/you/SAGA'],[home,'/home/you']],swap=(text,forward)=>pairs.reduce((t,[real,shown])=>{const [a,b]=forward?[real,shown]:[shown,real];return t.split(JSON.stringify(a).slice(1,-1)).join(JSON.stringify(b).slice(1,-1)).split(a).join(b);},text);
 for(const folder of ['Desktop','Documents','projects/website','projects/notes'])await mkdir(path.join(home,folder),{recursive:true});execFileSync('git',['init','-q'],{cwd:path.join(home,'projects','website')});
 const previousHome={HOME:process.env.HOME,USERPROFILE:process.env.USERPROFILE};Object.assign(process.env,{HOME:home,USERPROFILE:home});
 const setup=await createDashboard(appRoot,{noSync:true});await new Promise(resolve=>setup.server.listen(0,'127.0.0.1',resolve));
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});page.on('pageerror',error=>{throw error;});
  await page.route('**/api/**',async route=>{const request=route.request(),body=request.postData();const response=await route.fetch(body?{postData:swap(body,false)}:{});await route.fulfill({response,body:swap(await response.text(),true)});});
  const shot=async(name,full=false)=>{await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.waitForTimeout(150);await page.screenshot({path:path.join(output,name+'.png'),fullPage:full});};
  await page.goto('http://127.0.0.1:'+setup.server.address().port);await page.getByText('Where is your communication repository?').waitFor();
  await page.getByRole('button',{name:'Browse…',exact:true}).click();await page.locator('#pickerList').getByText('projects',{exact:true}).click();await page.locator('#pickerList').getByText('website',{exact:true}).waitFor();
  await page.locator('[data-picker="up"]').click();await page.locator('#pickerList').getByText('Documents',{exact:true}).waitFor();
  await page.locator('#pickerNewName').fill('team-docs');await page.mouse.move(0,0);await page.screenshot({path:path.join(output,'setup-browse.png')});
  await page.getByRole('button',{name:'Select this folder',exact:true}).click();await page.getByText('This folder does not exist yet').waitFor();
  await page.locator('#setup-url').fill('https://github.com/your-org/team-docs.git');await shot('setup-repository',true);
  await page.getByRole('button',{name:'Create Git repository',exact:true}).click();await page.getByText('Create the workspace').waitFor();
  execFileSync('git',['init','-q','--bare',path.join(sandbox,'origin.git')]);execFileSync('git',['remote','add','origin',path.join(sandbox,'origin.git')],{cwd:path.join(home,'team-docs')});
  await page.getByRole('button',{name:'Check folder',exact:true}).click();await page.locator('#setting-setupAutoSync').waitFor();
  const agents=page.locator('[data-setup-agent]');await agents.first().locator('[data-agent="role"]').fill('Investigates project questions and verifies evidence.');
  await page.getByRole('button',{name:'Add agent',exact:true}).click();await agents.last().locator('[data-agent="label"]').fill('Reviewer');await agents.last().locator('[data-agent="role"]').fill('Checks changes for correctness and reproduces defects.');
  await page.locator('#setting-setupLabel').fill('Project owner');await shot('setup-workspace',true);
  await page.getByRole('button',{name:'Create workspace',exact:true}).click();await page.getByText('Your workspace is ready').waitFor();await shot('setup-ready');
  await page.close();
 }finally{await new Promise(resolve=>setup.server.close(resolve));for(const [key,value] of Object.entries(previousHome))if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
const git=(...args)=>execFileSync('git',args,{cwd:root,windowsHide:true,stdio:'pipe'});
const record=(id,from,to,kind,title,body,status='open',session=null)=>({meta:{schema:1,id,from,to,kind,status,priority:'normal',created:'2026-10-08T09:00:00Z',title,reply_to:null,...(session?{session}:{})},body});
try{
 git('init','-b','main');git('config','user.name','Documentation example');git('config','user.email','example@example.invalid');
 const config={schema:1,title:'Project workspace',identity:'operator',participants:[{id:'operator',label:'Project owner',role:'Sets project direction and resolves cross-team decisions.'},{id:'researcher',label:'Research',role:'Investigates questions and verifies evidence. Owns research findings and open evidence gaps.',reportTo:'operator'},{id:'reviewer',label:'Review',role:'Checks changes for correctness and reproduces defects. Owns independent verification requests.',reportTo:'operator'}],mailboxDirectory:'mailboxes',cleanup:'approval',refreshSeconds:0,defaultExpanded:1};
 await writeFile(path.join(root,'exchange.config.json'),JSON.stringify(config,null,2));
 const report=record('m-export-report','researcher','operator','report','CSV exports preserve formulas; date formatting remains unchanged','The exported file preserves formulas in calculated cells. Dates still use the default spreadsheet format.\n\n### Verification\nI exported a sample containing formulas, dates, and empty cells, then reopened it in a spreadsheet reader. Formula values and empty cells matched the source.\n\n[Export verification notes](repo:docs/export.md)\n\n### Remaining limit\nThe report does not establish compatibility with every spreadsheet reader.','done','190a');
 const question=record('m-date-decision','reviewer','operator','question','Should CSV exports preserve date formatting?','Dates are readable, but they lose the source display format. Should the export preserve that format, or is the default acceptable?\n\nThe answer determines which acceptance checks I should add.','waiting','47');
 const task=record('m-review-export','operator','reviewer','request','Verify formulas and dates in a sample export','Review the attached verification notes and reproduce the export.\n\n- [ ] Check formulas against the source cells.\n- [ ] Check date formatting in the exported file.\n- [ ] Report the result and remaining limits.');
 const completed=record('m-check-empty-cells','operator','reviewer','request','Verify that empty cells survive export','- [ ] Export a sample with empty cells.\n- [ ] Reopen it and compare the empty positions.','done');
 const receipt=record('m-empty-cells-receipt','reviewer','operator','receipt','Completion: Verify that empty cells survive export','The empty positions match the source after reopening the exported file. Checked a sample with three empty cells.','done','46');Object.assign(receipt.meta,{request_id:completed.meta.id,request_sha256:recordHash(completed.meta,completed.body),outcome:'completed',reply_to:completed.meta.id});
 for(const category of ['outboxes','receipts']){await mkdir(path.join(root,'mailboxes',category),{recursive:true});for(const p of config.participants){const entries=category==='receipts'?(p.id==='reviewer'?[receipt]:[]):p.id==='operator'?[task,completed]:p.id==='researcher'?[report]:[question];await writeFile(path.join(root,'mailboxes',category,p.id+'.md'),mailboxText(p.id,category,entries));}}
 await mkdir(path.join(root,'docs'));await writeFile(path.join(root,'docs','export.md'),'# Export verification\n\nThe sample contains formulas, dates, and empty cells.\n\n| Cell type | Observed result |\n| --- | --- |\n| Formula | Preserved |\n| Empty cell | Position preserved |\n| Date | Default format |\n\nThese checks cover the sample only.');git('add','.');git('commit','-m','Synthetic documentation fixtures');
 app=await createDashboard(root,{noSync:true});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,...(process.env.DASHBOARD_BROWSER_CHANNEL?{channel:process.env.DASHBOARD_BROWSER_CHANNEL}:{})});const page=await browser.newPage({viewport:{width:1440,height:1200},deviceScaleFactor:1});page.on('pageerror',error=>{throw error;});await mkdir(output,{recursive:true});
 await captureOnboarding(browser);
 await page.goto('http://127.0.0.1:'+app.server.address().port);await page.locator('.message-card').first().waitFor();
 const capture=async name=>{await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});await page.waitForFunction(()=>window.scrollY===0);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{window.scrollTo(0,0);resolve();}))));await page.screenshot({path:path.join(output,name+'.png'),fullPage:false});};
 await capture('read-report');
 await page.locator('a[data-file-path]').first().click();await page.locator('#fileContent h1').waitFor();await capture('file-preview');await page.getByRole('button',{name:'Close preview'}).click();
 await page.locator('.message-card').filter({has:page.locator('summary').filter({hasText:'CSV exports preserve formulas'})}).getByRole('button',{name:'Reply',exact:true}).click();await page.locator('[data-reply-form="m-export-report"] textarea').fill('Keep the current date format for now. Please document this limitation alongside the export checks.');await capture('reply');await page.getByRole('button',{name:'New message',exact:true}).click();
 await page.getByRole('button',{name:'Your outbox',exact:true}).click();await page.getByLabel('Recipient',{exact:true}).selectOption('reviewer');await page.getByLabel('Subject',{exact:true}).fill('Check export behavior in a second spreadsheet reader');await page.getByLabel('Message kind',{exact:true}).selectOption('request');await page.locator('#message').fill('Check the sample in another spreadsheet reader.\n\n- [ ] Verify formulas and empty cells.\n- [ ] Note any differences in date formatting.\n- [ ] Send your findings and the reader version.');await capture('send-task');
 await page.getByRole('button',{name:'Requests',exact:true}).click();await page.getByLabel('Filter status',{exact:true}).selectOption('waiting');const questionCard=page.locator('.message-card').filter({has:page.locator('summary').filter({hasText:'Should CSV exports preserve date formatting?'})});await questionCard.locator('summary').first().evaluate(e=>e.parentElement.open=true);await questionCard.getByRole('button',{name:'Reply',exact:true}).click();await questionCard.locator('textarea').fill('The default date format is acceptable for this export. Add an acceptance check that dates retain their values.');await page.evaluate(()=>{composeOpen=false;render();});await capture('answer-request');await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 await page.getByRole('button',{name:'Inbox',exact:true}).click();await page.getByLabel('Filter participant',{exact:true}).selectOption('researcher');await page.getByLabel('Filter participant',{exact:true}).selectOption('reviewer');await page.getByLabel('Filter status',{exact:true}).selectOption('waiting');await capture('filters');
 await page.getByRole('button',{name:'Completion review',exact:true}).click();await capture('completion-review');
 await page.setViewportSize({width:1440,height:2200});await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('#settingsForm').waitFor();
 const card=title=>page.locator('#settingsForm > section').filter({has:page.getByRole('heading',{name:title,exact:true})});
 await card('Workspace and participants').screenshot({path:path.join(output,'participant-directory.png')});await card('Git automation').screenshot({path:path.join(output,'git-settings.png')});
 console.log('README screenshots written to '+output);
}finally{if(browser)await browser.close();if(app)await new Promise(resolve=>app.server.close(resolve));await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:200});await rm(sandbox,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
