import React, {useEffect, useState} from 'react';
import {api} from './api';
import {Button} from './ui';
import type {WindowsUpdateState} from '../core/update-types';

export function WindowsUpdateButton() {
  const bridge = api.windowsUpdates;
  const [state, setState] = useState<WindowsUpdateState>(null);
  useEffect(() => {
    if (!bridge) return;
    let received = false;
    const unsubscribe = bridge.subscribe(next => { received = true; setState(next); });
    void bridge.status().then(next => { if (!received) setState(next); }).catch(() => {});
    return () => { received = true; unsubscribe(); };
  }, [bridge]);
  if (!bridge || !state) return null;
  return <Button className="windows-update" disabled={state.downloading} title="下载并校验后保存计时、安装新版并重新打开专注记" onClick={() => void bridge.install()}>
    {state.downloading ? '正在下载更新…' : `下载并安装 ${state.version}`}
  </Button>;
}
