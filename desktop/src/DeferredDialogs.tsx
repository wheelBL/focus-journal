import React from 'react';
import {deferredModule,type ModuleLoading} from './DeferredModule';
import {Modal,Button,useWorkspaceJournal,type DialogSpec} from './ui';
function DialogLoading({error,retry}:ModuleLoading){const {dialog}=useWorkspaceJournal();return <Modal title={error?'暂时无法打开':'正在打开…'} onClose={()=>dialog(null)}><p role={error?'alert':'status'}>{error?'界面加载未完成，可以重试。':'正在准备操作界面…'}</p><footer className="modal-actions"><Button onClick={()=>dialog(null)}>返回</Button>{error&&<Button primary onClick={retry}>重试打开</Button>}</footer></Modal>;}
export const DeferredDialogs=deferredModule<{spec:DialogSpec}>('操作界面',()=>import('./dialogs'),state=><DialogLoading {...state}/>);
