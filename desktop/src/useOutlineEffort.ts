import {useContext,useMemo} from 'react';
import {activeEffortBaseline,activeEffortDeltas,overlayOutlineEffort} from '../core/outline-clock';
import type {OutlineIndex} from '../core/outline';
import type {JournalState} from '../core/types';
import {EffortClockContext} from './JournalClock';

export function useEffortDeltas(state:JournalState){
 const clock=useContext(EffortClockContext),baseline=useMemo(()=>activeEffortBaseline(state.sessions),[state]);
 return useMemo(()=>activeEffortDeltas(baseline,clock?.sessions??[]),[baseline,clock]);
}
export function useOutlineEffort(index:OutlineIndex,state:JournalState){
 const deltas=useEffortDeltas(state);
 return useMemo(()=>overlayOutlineEffort(index,deltas),[index,deltas]);
}
