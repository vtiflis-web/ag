const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{const [,,file,w,h,out]=process.argv;
const b=await chromium.launch();const p=await b.newPage({viewport:{width:+w,height:+h},deviceScaleFactor:1});
await p.goto('file://'+require('path').resolve(file));await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(500);
await p.screenshot({path:out,clip:{x:0,y:0,width:+w,height:+h}});await b.close();})();
