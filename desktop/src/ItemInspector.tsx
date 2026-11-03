import React,{useState} from 'react';
import {ItemInspectorBase,type InspectorProps} from './ItemInspectorBase';
import {RelatedDetail} from './RelatedDetail';
export type {InspectorTab} from './ItemInspectorBase';

/** Hosts related navigation without unmounting the inspector or its drafts. */
export function ItemInspector(props:InspectorProps){
 const [relatedId,setRelatedId]=useState<string|null>(null);
 return <><ItemInspectorBase {...props} hidden={!!relatedId} onRelated={props.onRelated??setRelatedId}/>{relatedId&&<RelatedDetail key={relatedId} id={relatedId} onClose={()=>setRelatedId(null)}/>}</>;
}
