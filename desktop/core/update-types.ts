export type WindowsUpdateState = { version: string; downloading: boolean } | null;
export interface WindowsUpdateBridge {
  status(): Promise<WindowsUpdateState>;
  subscribe(changed: (state: WindowsUpdateState) => void): () => void;
  install(): Promise<void>;
}
