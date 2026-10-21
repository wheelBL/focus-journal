import { createServer } from 'node:http';
import path from 'node:path';
import { JournalService } from '../core/service';
import { SqliteJournalStore } from '../core/store';
const service=new JournalService(new SqliteJournalStore(path.resolve(process.env.JOURNAL_PREVIEW_DATA??'qa-data/preview.sqlite')),undefined,true);
if(process.env.JOURNAL_TREE_PROTOTYPE==='1')service.seedTreeDemo();else service.seedDemo();
const server=createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
  try {
    if(req.method==='GET'&&req.url==='/api/snapshot')res.end(JSON.stringify(service.snapshot()));
    else if(req.method==='GET'&&req.url==='/api/clock')res.end(JSON.stringify(service.clockSnapshot()));
    else if(req.method==='POST'&&req.url==='/api/command'){
      let body='';for await(const chunk of req){body+=chunk;if(body.length>200000)throw new Error('请求过大。');}
      res.end(JSON.stringify(service.execute(JSON.parse(body))));
    }else if(req.url==='/api/export/json'){res.end(service.exportJson());}
    else if(req.url==='/api/export/csv'){res.setHeader('Content-Type','text/csv; charset=utf-8');res.end(service.exportCsv());}
    else {res.statusCode=404;res.end('{}');}
  } catch(e) {res.statusCode=400;res.end(JSON.stringify({error:e instanceof Error?e.message:String(e)}));}
});
server.listen(4174,'127.0.0.1',()=>console.log('Preview data service: http://127.0.0.1:4174'));
setInterval(()=>service.tick(),1000);
process.on('SIGINT',()=>{service.shutdown();server.close();process.exit(0);});
