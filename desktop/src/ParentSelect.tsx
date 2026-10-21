import React from 'react';
import type {ParentOption} from '../core/outline-options';

/** A stable option collection keeps typing in an unrelated field inexpensive. */
export const ParentSelect=React.memo(function ParentSelect({options,value,onChange,label}:{options:ParentOption[];value:string;onChange:(value:string)=>void;label:string}){
 return <select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}><option value="__root__">最外层</option>{options.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select>;
});
