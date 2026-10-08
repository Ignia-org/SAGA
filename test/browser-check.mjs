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
  const config={schema:1,title:'Project control room',identity:'owner',participants:[{id:'owner',label:'Project owner'},{id:'worker',label:'Research team'},{id:'auditor',label:'Review team'}],mailboxDirectory:'mailboxes',cleanup:'approval',syncSeconds:60,refreshSeconds:120,defaultExpanded:2};
  await writeFile(path.join(root,'exchange.config.json'),JSON.stringify(config));
  for(const category of ['outboxes','receipts']){await mkdir(path.join(root,'mailboxes',category),{recursive:true});for(const p of config.participants)await writeFile(path.join(root,'mailboxes',category,p.id+'.md'),mailboxText(p.id,category,[]));}
  await mkdir(path.join(root,'docs'));await writeFile(path.join(root,'docs','guide.md'),'# Guide\n\n[Details](details.md)\n\n- [ ] Read only');await writeFile(path.join(root,'docs','details.md'),'# Details');await writeFile(path.join(root,'docs','study.pdf'),'%PDF-1.4');
  git('add','.');git('commit','-m','initial');
  const baseBranch=git('branch','--show-current').trim();git('switch','-c','incoming');
  const incoming={meta:{schema:1,id:'m-branch-inbox',from:'worker',to:'owner',kind:'report',status:'open',priority:'normal',created:new Date().toISOString(),title:'Branch report',reply_to:null},body:'A report available on another branch.'};
  await writeFile(path.join(root,'mailboxes/outboxes/worker.md'),mailboxText('worker','outboxes',[incoming]));git('add','.');git('commit','-m','branch report');git('switch',baseBranch);
  app=await createDashboard(root,{noSync:true});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,...(process.env.DASHBOARD_BROWSER_CHANNEL?{channel:process.env.DASHBOARD_BROWSER_CHANNEL}:{})});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${app.server.address().port}`);
  await page.getByRole('heading',{name:'Inbox',exact:true}).waitFor();
  await page.getByLabel('Recipient',{exact:true}).selectOption('worker');
  await page.locator('#message').fill('Unsaved draft');
  await page.evaluate(()=>{const node=document.createElement('div');node.id='file-test';node.innerHTML=renderMarkdown('[Guide](repo:docs/guide.md) [PDF](docs/study.pdf)');document.body.append(node);});
  await page.locator('#file-test').getByText('Guide',{exact:true}).click();await page.locator('#fileContent h1').filter({hasText:'Guide'}).waitFor();assert.equal(await page.locator('#fileContent input').isDisabled(),true);
  await page.locator('#fileContent').getByText('Details',{exact:true}).click();await page.locator('#fileContent h1').filter({hasText:'Details'}).waitFor();await page.getByRole('button',{name:'Close preview'}).click();assert.equal(await page.locator('#message').inputValue(),'Unsaved draft');
  const popupPromise=page.waitForEvent('popup');await page.locator('#file-test').getByText('PDF',{exact:true}).click();const popup=await popupPromise;await popup.waitForURL('**/files/pdf/**');await popup.close();await page.evaluate(()=>document.querySelector('#file-test').remove());
  assert.equal(await page.evaluate(()=>fileReference('../escape.md')===null&&fileReference('javascript:alert(1)')===null&&fileReference('../guide.md',{path:'docs/nested/details.md'}).path==='docs/guide.md'),true);
  await page.locator('#message').fill('');
  const markdown=await page.evaluate(()=>{
    const nl=String.fromCharCode(10),container=document.createElement('div');container.className='body';document.body.append(container);
    container.innerHTML=renderMarkdown(['A paragraph wrapped','for source readability.','','Second paragraph.'].join(nl));
    const paragraphs=[...container.querySelectorAll('p')].map(p=>p.innerText);
    container.innerHTML=renderMarkdown(['First  ','second','','third'+String.fromCharCode(92),'fourth'].join(nl));const hardBreaks=container.querySelectorAll('br').length;
    container.innerHTML=renderMarkdown(['~~~md','- [ ] Same','~~~','','- [ ] Same','  continuation','  - [x] Nested','1. [ ] Ordered'].join(nl),{meta:{id:'m-check'}},true);
    const taskLines=[...container.querySelectorAll('[data-line]')].map(e=>Number(e.dataset.line)),literal=container.querySelector('pre')?.innerText.trim();
    container.innerHTML=renderMarkdown(['| Item | Result |','| --- | --- |','| **Export** | *Passed* |','','<script>alert(1)</script>','','[unsafe](javascript:alert(1))'].join(nl));
    const table=container.querySelectorAll('table').length,unsafe=container.querySelectorAll('script,a[href^="javascript:"]').length;container.remove();return{paragraphs,hardBreaks,taskLines,literal,table,unsafe};
  });
  assert.deepEqual(markdown.paragraphs,['A paragraph wrapped for source readability.','Second paragraph.']);assert.equal(markdown.hardBreaks,2);assert.deepEqual(markdown.taskLines,[4,6,7]);assert.equal(markdown.literal,'- [ ] Same');assert.equal(markdown.table,1);assert.equal(markdown.unsafe,0);
  await page.getByLabel('Subject',{exact:true}).fill('Unsent draft');await page.getByLabel('Message body',{exact:true}).fill('Keep this text when switching branches.');
  await page.locator('#branchSummary').click();await page.locator('[data-switch-branch="refs/heads/incoming"]').click();await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.locator('#branch').filter({hasText:'incoming'}).waitFor();await page.waitForFunction(()=>document.querySelector('#message').value==='');await page.getByRole('button',{name:'Requests',exact:true}).click();assert.equal(await page.locator('summary').filter({hasText:'Branch report'}).count(),0);await page.getByRole('button',{name:'Inbox',exact:true}).click();
  await page.locator('[data-switch-branch="refs/heads/'+baseBranch+'"]').click();await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.locator('#branch').filter({hasText:baseBranch}).waitFor();await page.waitForFunction(()=>document.querySelector('#message').value==='Keep this text when switching branches.');await page.locator('#branchSummary').click();

  await page.getByLabel('Recipient',{exact:true}).selectOption('worker');await page.getByLabel('Subject',{exact:true}).fill('Verify export');await page.getByLabel('Message body',{exact:true}).fill('- [ ] Verify formulas\n\n<script>alert("escaped")</script>');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByRole('button',{name:'Your outbox',exact:true}).click();
  await page.locator('summary').filter({hasText:'Verify export'}).waitFor();
  const summary=page.locator('summary').filter({hasText:'Verify export'});assert.equal((await summary.textContent()).includes('Project owner'),false);assert.equal((await summary.textContent()).includes('Research team'),true);
  await page.getByLabel('Filter participant',{exact:true}).selectOption('worker');await page.getByLabel('Filter participant',{exact:true}).selectOption('auditor');assert.equal(await page.locator('#filterTags [data-filter="participant"]').count(),2);
  await page.getByLabel('Filter status',{exact:true}).selectOption('open');await page.getByLabel('Filter status',{exact:true}).selectOption('blocked');assert.equal(await page.locator('#filterTags [data-filter="status"]').count(),2);
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await page.getByLabel('Subject',{exact:true}).fill('Follow-up draft');await page.getByLabel('Message body',{exact:true}).fill('Review the export alongside the request.\n\n- [ ] Check the remaining edge cases');
  await page.getByRole('button',{name:'Float composer',exact:true}).click();assert.equal(await page.locator('#compose').evaluate(e=>getComputedStyle(e).position),'fixed');assert.equal(await page.locator('#columns').evaluate(e=>e.classList.contains('wide')),true);assert.equal(await page.locator('#detachCompose svg').count(),1);const feedBox=await page.locator('#feed').boundingBox(),columnsBox=await page.locator('#columns').boundingBox();assert.ok(Math.abs(feedBox.width-columnsBox.width)<2);
  const handle=await page.locator('#composeHandle h3').boundingBox();await page.mouse.move(handle.x+20,handle.y+10);await page.mouse.down();await page.mouse.move(handle.x-200,handle.y+40);await page.mouse.up();assert.ok(await page.locator('#compose').evaluate(e=>parseFloat(e.style.left)<window.innerWidth-660));
  if(process.argv[3]){await mkdir(process.argv[3],{recursive:true});await page.screenshot({path:path.join(process.argv[3],'floating-composer.png'),fullPage:true});}
  await page.getByRole('button',{name:'Dock composer',exact:true}).click();assert.match(await page.getByLabel('Message body',{exact:true}).inputValue(),/remaining edge cases/);
  const refreshBox=await page.locator('#refreshButton').boundingBox(),pushBox=await page.locator('#pushHeader').boundingBox();assert.ok(Math.abs(refreshBox.y-pushBox.y)<2);
  if(process.argv[3]){await mkdir(process.argv[3],{recursive:true});await page.screenshot({path:path.join(process.argv[3],'compact-outbox.png'),fullPage:true});}

  await page.getByRole('button',{name:'Requests',exact:true}).click();await page.locator('summary').filter({hasText:'Verify export'}).waitFor();await page.getByRole('button',{name:'Your outbox',exact:true}).click();
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
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Discover branches automatically',{exact:true}).check();await page.getByLabel('Branch refresh interval (minutes)',{exact:true}).fill('7');await page.getByLabel('Git synchronization interval (minutes)',{exact:true}).fill('3');await page.getByLabel('Cleanup policy',{exact:true}).selectOption('automatic');await page.getByRole('button',{name:'Save settings',exact:true}).click();await page.getByRole('button',{name:'Confirm',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#setting-cleanup')?.value==='automatic');assert.equal(await page.getByLabel('Branch refresh interval (minutes)',{exact:true}).inputValue(),'7');assert.equal(await page.getByLabel('Git synchronization interval (minutes)',{exact:true}).inputValue(),'3');
  await page.getByRole('button',{name:'Participant monitoring',exact:true}).click();assert.equal(await page.locator('#compose').isVisible(),false);
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Inbox',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  if(process.argv[3])await page.screenshot({path:path.join(process.argv[3],'mobile-inbox.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('Browser checks passed: send, checkbox, edit, receipt approval, history, settings, monitoring, mobile layout, and escaped content.');
}finally{if(browser)await browser.close();if(app)await new Promise(resolve=>app.server.close(resolve));await rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
