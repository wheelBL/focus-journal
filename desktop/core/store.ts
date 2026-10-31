import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { emptyState, JOURNAL_SCHEMA_VERSION, type JournalState, type JournalStore, type Session } from './types';

// Each record is independently upserted. A state transition is one SQLite transaction.
export class SqliteJournalStore implements JournalStore {
  private db: DatabaseSync;
  private cached = new Map<string,string>();
  constructor(public path: string) {
    if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
    this.db=new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
    const version=(this.db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version;
    if(version>JOURNAL_SCHEMA_VERSION) throw new Error('数据来自更新版本，请使用更新版本的专注记打开。');
    if(path!==':memory:'&&version>0&&version<JOURNAL_SCHEMA_VERSION){
      const backups=join(dirname(path),'backups');mkdirSync(backups,{recursive:true});
      this.db.prepare('VACUUM INTO ?').run(join(backups,`before-schema-${version}-to-${JOURNAL_SCHEMA_VERSION}-${Date.now()}.sqlite`));
    }
    this.db.exec('CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id));');
  }
  load(): JournalState {
    const state=emptyState(); const rows=this.db.prepare('SELECT kind,id,data FROM records').all() as {kind:string;id:string;data:string}[];
    if(!rows.length) { this.save(state); return state; }
    state.projects=[];state.tasks=[];state.schemaVersion=1;
    for(const r of rows) {
      this.cached.set(`${r.kind}:${r.id}`,r.data);
      if(r.kind==='meta')state.schemaVersion=JSON.parse(r.data).schemaVersion;
      else if(r.kind==='settings') state.settings=JSON.parse(r.data);
      else if(['projects','tasks','sessions','deletedSessions','notes','estimates','reviews','audit','tags','views','moves','itemReviews','activities'].includes(r.kind)) (state[r.kind as keyof JournalState] as unknown[]).push(JSON.parse(r.data));
    }
    return state;
  }
  save(state: JournalState): void {
    const entries=new Map<string,{kind:string;id:string;data:string}>();
    for(const kind of ['projects','tasks','sessions','deletedSessions','notes','estimates','reviews','audit','tags','views','moves','itemReviews','activities'] as const)
      for(const record of state[kind]??[]) entries.set(`${kind}:${record.id}`,{kind,id:record.id,data:JSON.stringify(record)});
    entries.set('settings:settings',{kind:'settings',id:'settings',data:JSON.stringify(state.settings)});
    entries.set('meta:schema',{kind:'meta',id:'schema',data:JSON.stringify({schemaVersion:state.schemaVersion})});
    const upsert=this.db.prepare('INSERT INTO records(kind,id,data) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data');
    const remove=this.db.prepare('DELETE FROM records WHERE kind=? AND id=?');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for(const [key,r] of entries) if(this.cached.get(key)!==r.data) upsert.run(r.kind,r.id,r.data);
      for(const key of this.cached.keys()) if(!entries.has(key)) { const i=key.indexOf(':'); remove.run(key.slice(0,i),key.slice(i+1)); }
      this.db.exec(`PRAGMA user_version=${state.schemaVersion}; COMMIT`);
      this.cached=new Map([...entries].map(([k,r])=>[k,r.data]));
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
  saveSessionCheckpoint(sessions:readonly Session[]):void {
    const entries=sessions.map(session=>({id:session.id,key:`sessions:${session.id}`,data:JSON.stringify(session)}));
    if(entries.some(entry=>!this.cached.has(entry.key)))throw new Error('计时记录尚未保存，无法写入进度。');
    const changed=entries.filter(entry=>this.cached.get(entry.key)!==entry.data);
    if(!changed.length)return;
    const update=this.db.prepare("UPDATE records SET data=? WHERE kind='sessions' AND id=?");
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for(const entry of changed)if(update.run(entry.data,entry.id).changes!==1)throw new Error('计时记录已变化，进度未写入。');
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
    for(const entry of changed)this.cached.set(entry.key,entry.data);
  }
  close(): void { this.db.close(); }
}
