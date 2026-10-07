// Optional end-to-end check. Pass the path to an installed Playwright module.
import { pathToFileURL } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createDashboard } from '../src/server.mjs';
import { mailboxText } from '../src/protocol.mjs';
import { run } from '../src/cli.mjs';

if (!process.argv[2]) throw new Error('Usage: node browser-check.mjs /path/to/playwright/index.js [screenshot-directory]');
const playwright = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const { chromium } = playwright.default || playwright;
const temp = await mkdtemp(path.join(os.tmpdir(), 'exchange-browser-')), root = path.join(temp, 'root');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, stdio: 'pipe' });
let app, browser;
try {
  await mkdir(root);git('init');git('config','user.name','Test');git('config','user.email','test@example.com');
  const config={schema:1,title:'Project control room',identity:'owner',participants:[{id:'owner',label:'Project owner'},{id:'worker',label:'Research team'},{id:'auditor',label:'Review team'}],mailboxDirectory:'mailboxes',cleanup:'approval',syncSeconds:60,refreshSeconds:10,defaultExpanded:2};
  await writeFile(path.join(root,'exchange.config.json'),JSON.stringify(config));
  for(const category of ['outboxes','receipts']){await mkdir(path.join(root,'mailboxes',category),{recursive:true});for(const p of config.participants)await writeFile(path.join(root,'mailboxes',category,p.id+'.md'),mailboxText(p.id,category,[]));}
  git('add','.');git('commit','-m','initial');
  app=await createDashboard(root,{noSync:true});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,...(process.env.DASHBOARD_BROWSER_CHANNEL?{channel:process.env.DASHBOARD_BROWSER_CHANNEL}:{})});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${app.server.address().port}`);
  await page.getByRole('heading',{name:'Inbox',exact:true}).waitFor();
  await page.getByLabel('Recipient',{exact:true}).selectOption('worker');await page.getByLabel('Subject',{exact:true}).fill('Verify export');await page.getByLabel('Message body',{exact:true}).fill('- [ ] Verify formulas\n\n<script>alert("escaped")</script>');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByRole('button',{name:'Your outbox',exact:true}).click();
  await page.locator('summary').filter({hasText:'Verify export'}).waitFor();
  await page.getByRole('checkbox',{name:'Verify formulas',exact:true}).check();
  await page.waitForFunction(()=>document.querySelector('.task')?.classList.contains('done'));
  assert.equal(await page.locator('.body script').count(),0);
  await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Edit message',{exact:true}).fill('- [x] Verify formulas\n\nEvidence: exported formulas look correct.');await page.getByRole('button',{name:'Save and commit',exact:true}).click();
  await page.getByText('Evidence: exported formulas look correct.',{exact:true}).waitFor();
  const base=`http://127.0.0.1:${app.server.address().port}`,state=await(await fetch(base+'/api/state',{headers:{'X-Dashboard-Token':app.token}})).json(),id=state.messages[0].meta.id;
  const bodyFile=path.join(temp,'result.md');await writeFile(bodyFile,'Completed export verification.');
  await run(['receipt',id,'--from','worker','--body-file',bodyFile,'--root',root],()=>{});git('add','mailboxes/receipts/worker.md');git('commit','-m','completion');
  await page.getByRole('button',{name:'Completion review',exact:true}).click();
  await page.getByRole('button',{name:'Approve and clean up',exact:true}).waitFor({timeout:15000});
  if(process.argv[3]){await mkdir(process.argv[3],{recursive:true});await page.screenshot({path:path.join(process.argv[3],'completion-review.png'),fullPage:true});}
  await page.getByRole('button',{name:'Approve and clean up',exact:true}).click();await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.getByText('No completion receipts yet.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Git history',exact:true}).click();await page.getByRole('button',{name:'Before',exact:true}).first().waitFor();await page.getByRole('button',{name:'Before',exact:true}).first().click();
  await page.locator('pre:visible').filter({hasText:'Verify export'}).waitFor();
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Cleanup policy',{exact:true}).selectOption('automatic');await page.getByRole('button',{name:'Save settings',exact:true}).click();await page.getByRole('button',{name:'Confirm',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#setting-cleanup')?.value==='automatic');
  await page.getByRole('button',{name:'Participant monitoring',exact:true}).click();assert.equal(await page.locator('#compose').isVisible(),false);
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Inbox',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  if(process.argv[3])await page.screenshot({path:path.join(process.argv[3],'mobile-inbox.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('Browser checks passed: send, checkbox, edit, receipt approval, history, settings, monitoring, mobile layout, and escaped content.');
}finally{if(browser)await browser.close();if(app)await new Promise(resolve=>app.server.close(resolve));await rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
