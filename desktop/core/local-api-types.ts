export type LocalApiAccess='read'|'write';
export interface LocalApiSettings {enabled:boolean;port:number;access:LocalApiAccess}
export interface LocalApiStatus extends LocalApiSettings {running:boolean;baseUrl:string|null;hasToken:boolean;error:string|null}
export interface LocalApiBridge {
 status():Promise<LocalApiStatus>;
 configure(settings:LocalApiSettings):Promise<LocalApiStatus>;
 token():Promise<string>;
 rotateToken():Promise<string>;
}
