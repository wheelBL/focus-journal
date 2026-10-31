import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import {JournalService} from '../core/service';
import {emptyState,type JournalState} from '../core/types';
import {seed} from '../design-prototypes/things-3/seed';

// Isolated production UI for audits. No personal database or production profile.
class Store {path='isolated UX audit';load(){return emptyState();}save(_state:JournalState){}close(){}}
const service=new JournalService(new Store(),undefined,true);seed(service);
const server=await createServer({configFile:false,root:process.cwd(),base:'./',plugins:[react(),{
 name:'audit-api',configureServer(server){server.middlewares.use('/api',async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
  try {if(req.method==='GET'&&req.url==='/snapshot')res.end(JSON.stringify(service.snapshot()));
   else if(req.method==='GET'&&req.url==='/clock')res.end(JSON.stringify(service.clockSnapshot()));
   else if(req.method==='POST'&&req.url==='/command'){let body='';for await(const chunk of req){body+=chunk;if(body.length>200000)throw Error('请求过大');}res.end(JSON.stringify(service.execute(JSON.parse(body))));}
   else {res.statusCode=404;res.end('{}');}
  }catch(error){res.statusCode=400;res.end(JSON.stringify({error:String(error)}));}
 });},transformIndexHtml(html){return html.replace("script-src 'self'","script-src 'self' 'unsafe-inline'");}
}],server:{host:'127.0.0.1',port:5187,strictPort:true,fs:{allow:[path.resolve('.')]}}});
await server.listen();server.printUrls();const tick=setInterval(()=>service.tick(),1000);
async function stop(){clearInterval(tick);service.shutdown();await server.close();process.exit(0);}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
