import React from 'react';
import {Circle20Regular,CircleHalfFill20Regular,PlayCircle20Regular,PauseCircle20Regular,CheckmarkCircle20Regular,SubtractCircle20Regular,Note20Regular,Calendar20Regular,LockClosed20Regular,Delete20Regular} from '@fluentui/react-icons';
import type {ItemPresentation,ProgressKind} from '../core/item-presentation';
const icons:Record<ProgressKind,React.ComponentType>={waiting:Circle20Regular,progress:CircleHalfFill20Regular,running:PlayCircle20Regular,'timer-paused':PauseCircle20Regular,paused:PauseCircle20Regular,blocked:LockClosed20Regular,done:CheckmarkCircle20Regular,cancelled:SubtractCircle20Regular,'handed-off':LockClosed20Regular,note:Note20Regular,event:Calendar20Regular,deleted:Delete20Regular};
export function ItemStatus({value}:{value:ItemPresentation}){
 const Icon=icons[value.kind];
 return <span className={`item-status status-${value.kind}`} title={value.reason}><Icon/><span>{value.label}</span></span>;
}
