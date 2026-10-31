/** Device presentation preferences. Never part of journal exports or sync. */
export type ThemePreference='system'|'light'|'dark';
export type MotionPreference='system'|'full'|'reduce';
export type Appearance={theme:ThemePreference;motion:MotionPreference};
export const defaultAppearance:Appearance={theme:'system',motion:'system'};
export function parseAppearance(value:unknown):Appearance {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('外观设置无效。');
 const {theme,motion}=value as Appearance;
 if(!['system','light','dark'].includes(theme)||!['system','full','reduce'].includes(motion))throw new Error('外观设置无效。');
 return {theme,motion};
}
export interface AppearanceApi {get:()=>Promise<Appearance>;set:(value:Appearance)=>Promise<Appearance>;onChanged:(listener:(value:Appearance)=>void)=>()=>void;}
