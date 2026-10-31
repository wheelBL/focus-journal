import {cpSync,copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createPackage} from '@electron/asar';
import './third-party-notices.mjs';

// Official prebuilt Electron + our bundled application. No runtime npm install is needed.
const root=realpathSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
const treePrototype=process.argv.includes('--tree-prototype');
const reminderQa=process.argv.includes('--reminder-qa');
const deadlineQa=process.argv.includes('--deadline-qa');
const syncQa=process.argv.includes('--sync-qa');
const releaseQa=process.argv.includes('--release-qa');
const qa=process.argv.includes('--qa')||treePrototype||reminderQa||deadlineQa||syncQa||releaseQa;
const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
const runtime=path.join(root,'node_modules/electron/dist');
if(!existsSync(path.join(runtime,'electron.exe')))throw new Error('请先运行 node node_modules/electron/install.js');
const runtimeVersion=readFileSync(path.join(runtime,'version'),'utf8').trim();
if(runtimeVersion!==pkg.devDependencies.electron)throw new Error('Electron 运行时与锁定版本不一致。');
const output=path.join(root,'release',releaseQa?`qa-${pkg.version}`:syncQa?'sync-qa':deadlineQa?'deadline-qa':reminderQa?'reminder-qa':treePrototype?'tree-prototype':qa?'qa-win-unpacked':process.argv.includes('--versioned')?`win-${pkg.version}`:'win-unpacked');
mkdirSync(output,{recursive:true});
for(const item of readdirSync(runtime,{withFileTypes:true})){
  if(item.name==='resources')continue; // exclude Electron's default demo application
  const destination=path.join(output,item.name==='electron.exe'?'专注记.exe':item.name);
  if(item.isDirectory())cpSync(path.join(runtime,item.name),destination,{recursive:true});
  else copyFileSync(path.join(runtime,item.name),destination);
}
mkdirSync(path.join(output,'resources'),{recursive:true});
const stage=mkdtempSync(path.join(root,'release','.app-stage-'));
try{
  for(const directory of ['dist/client','dist-electron','assets'])cpSync(path.join(root,directory),path.join(stage,directory),{recursive:true});
  const main=qa?'qa-start.cjs':pkg.main;
  writeFileSync(path.join(stage,'package.json'),JSON.stringify({name:pkg.name,productName:'专注记',version:pkg.version,description:pkg.description,main},null,2));
  if(qa){
    const dataDir=path.join(root,'qa-data',releaseQa?`release-${pkg.version}`:syncQa?'sync':deadlineQa?'deadlines':reminderQa?'reminders':treePrototype?'tree-prototype':'native');
    writeFileSync(path.join(stage,'qa-start.cjs'),`process.argv.push('--demo',${treePrototype?"'--tree-prototype',":''}'--data-dir',${JSON.stringify(dataDir)});require('./dist-electron/main.cjs');\n`);
    if(process.argv.includes('--smoke')){
      copyFileSync(path.join(root,'scripts/packaged-smoke.cjs'),path.join(stage,'qa-release-smoke.cjs'));
      writeFileSync(path.join(stage,'qa-start.cjs'),`require('./qa-release-smoke.cjs')(${JSON.stringify(dataDir)},${JSON.stringify(path.join(root,`qa-evidence/release-${pkg.version}`))},${JSON.stringify(pkg.version)});\n`,{flag:'a'});
    }
    if(releaseQa)writeFileSync(path.join(stage,'qa-start.cjs'),`require('electron').app.whenReady().then(()=>{const {safeStorage}=require('electron'),fs=require('node:fs'),path=require('node:path');const sample='focus-journal-QA-synthetic-not-a-credential';try{const available=safeStorage.isEncryptionAvailable(),cipher=safeStorage.encryptString(sample),roundtrip=safeStorage.decryptString(cipher)===sample;fs.writeFileSync(path.join(${JSON.stringify(dataDir)},'vault-check.json'),JSON.stringify({available,roundtrip,cipherDiffers:!cipher.includes(Buffer.from(sample)),checkedAt:new Date().toISOString()}));}catch{fs.writeFileSync(path.join(${JSON.stringify(dataDir)},'vault-check.json'),JSON.stringify({available:false,roundtrip:false}));}});\n`,{flag:'a'});
  }
  await createPackage(stage,path.join(output,'resources/app.asar'));
  const asar=readFileSync(path.join(output,'resources/app.asar'));
  writeFileSync(path.join(output,'build-info.json'),JSON.stringify({app:pkg.version,electron:runtimeVersion,platform:'win32-x64',qa,treePrototype,asarSha256:createHash('sha256').update(asar).digest('hex'),builtAt:new Date().toISOString()},null,2));
  writeFileSync(path.join(output,'使用说明.txt'),['专注记 '+pkg.version,'','双击「专注记.exe」启动。移动应用时请保留整个文件夹，无需 Node.js。','顶部或托盘选择“先计时”，无需提前创建事项。结束后可新建或关联已有事项，也可稍后补充。今日的待补充事项保留跨日期记录，日历与投入复盘也可补充；原始起止时间、暂停片段和时长保留，不重复计入。',
  '窗口变化时页面自适应；事项采用紧凑行，日历填满剩余高度，今日执行区、重点选择与进展汇总适应窗口宽度，下方保留时间线。','日历空白处双击创建事项提醒，时间可修改；详情可改期或移除。虚线提醒不计入投入。应用运行时到点显示置顶卡片并按设置发声，退出期间错过的提醒在下次启动补提醒。','日/周日历拖选时段或右键：设置提醒、添加事件、补记投入。补记关联已有事项或一起新建，同步更新事项实际开始和累计投入；提醒与事件不计投入。点击实际时间块可校正并保留修改历史。',
  '交接给他人：事项右键或详情选择交接，填写接手人；可继续跟进并设置独立提醒。交接即关闭本人责任，退出默认待办与逾期清单，不计完成，保留本人投入，子项仅处理明确勾选的部分。已交接、待他人跟进视图可随时查看。',
  '完成归属区分本人、他人、共同完成和未注明；旧已完成记录不推断归属。回顾的活动记录可查看业务变化、轻量操作和AI使用。轻量摘要仅记录操作、入口、结果和版本，无鼠标轨迹或输入值，可暂停、清空和导出。AI文本仅保存在本机，最近保留200次，不进入日志同步。',
  '精简操作层级：事项页的“视图选项”提供保存视图、显示已完成、展开折叠和视图管理；默认筛选不重复占一行，自定义条件仍显示。',
  '详情计划开始、截止和标签直接编辑；尚未设置的提醒、重复与定期审视在“更多安排”，已有安排仍直接显示。AI 与聚焦分支在“更多操作”。',
  '设置每次显示一个分类；切换分类保留未保存的输入，离开设置页前请保存。日历操作说明可按需展开，有已删除投入时才显示恢复入口。',
  '今日先展示当前计时和接下来要做的事，旁边可选择重点并直接开始或恢复；今日进展按事项汇总投入、成果与完成情况，时间线按发生顺序保留。',
  '审视说明、推迟日期和子项选择会随事项保存在本机，切换事项或离开页面后可继续；标记已审视才写入历史，稍后审视保留未提交的说明。',
  '批量整理、专注设置、提醒、快捷键和 API 设置在保存期间锁定本次输入；失败保留原内容供重试。回顾页签支持左右方向键、Home 和 End；弹窗内快捷键不影响背后的工作区。',
  '后台每 10 秒仅保存正在计时的投入。计时器按秒更新，事项树、父级累计和投入筛选每 10 秒更新活动增量；历史记录与业务修订保持稳定。日历、回顾、设置和辅助窗口按需打开，加载失败可在原位置重试。',
  '选择今天后跨天跟随当天；主动选择历史日期则保持不动。日、周日历分别记住查看时段，改变刻度保留时间位置，“现在”返回今天并定位当前时刻。F2 改名后 Enter/Escape 返回当前行，方向键可继续操作；详情页签支持左右、Home/End。投入复盘先显示60条并可继续展开，统计始终包含全部结果。',
  '已经做了40分钟才想起计时：先开始计时，在计时卡片、事项详情或底部计时栏选择“调整开始时间”，点“40分钟前”或填写实际日期时间，再保存并继续计时。过去投入计入同一条记录，接下来再专注25分钟才提醒（跟随本次目标）；暂停不消耗目标。',
  '调整开始时间保留已有暂停片段，更新事项和父级投入、今日与日历。暂停中的计时保持暂停；单次最多调整24小时，不允许未来时间、越过第一次暂停或与同事项已有投入重叠。已结束的记录使用“校正”。升级至数据结构19前自动备份；使用交接与活动记录后，跨设备同步请使用0.29.1或更新版本。',
  '不想保留先计时的投入：结束后的补充弹窗选择“放弃这段投入”，或在待补充列表选择“放弃投入”，确认后移入已删除投入，不再计入时长。今日和日历均可恢复；原始起止时间、暂停片段和进展保留。正在休息的倒计时不受影响。',
  '“稍后补充”保留投入，已填写的进展也会保存；“放弃投入”移入可恢复的回收站；手动补记中的“取消”只丢弃未保存草稿，不创建投入。保存失败时保留表单和错误提示，可重试。',
  '事项默认隐藏已完成和已取消，笔记与事件继续显示；可勾选显示已完成或使用已完成视图。已保存视图保留原条件。',
  '日历按真实区间显示投入，短记录显示细线，可展开短记录与提醒查看名称与精确时间；只有实际重叠的记录才并排显示。',
  '日历右键或 Shift+F10 可删除投入、移除提醒或将事项/事件移入回收站。删除投入会同步扣除事项和父级时长，可从已删除投入恢复。事件的重复系列删除适用于整系列；原投入记录保留。',
  '日历支持显示类别开关、三档时间刻度和当前时间线。拖选按 15 分钟对齐，表单可精确修改，Esc 取消选区。',
  '日历颜色按事项保持一致：直接计时、手动补记、提醒和事件采用同一事项色。不同事项尽量使用不同颜色；重复系列同色。改名、移动、切换日期和类别不会换色；未关联记录为中性色，关联后使用事项色。',
  '筛选中的“父级路径”只展示层级，不计入匹配数。日期视图若包含已结束事项，可点“只看未完成”，再更新当前视图。最后一个匹配子项结束后，不符合条件的父级随之消失。编辑暂留不跨页面或重启恢复。',
  '收件箱也是普通事项，可取消项目标志、移动或放入回收站；原身份与历史保留。详情默认打开；分支显示子树完成数，状态与逾期独立。',
  '事项支持固定日历重复或完成后间隔重复，事件支持固定重复；可设置日/周/月/年、星期和结束日。事项完成后生成下一次，保留历史，跳过错过周期，不复制子项和投入；事件编辑影响系列。',
  '今日快速添加事项：Enter 保存到收件箱，不启动计时；旧想法和事件保留。保存视图在命名弹窗确认后，从常用视图打开。','事项页统一显示全部事项，项目只是标记。任意嵌套、双击改名、拖动调整层级和直接计时。','在树中右键新增同级/子事项；空白处右键新增最外层事项。Insert 同级、Ctrl+Insert 子项、Enter 保存并继续、Esc 结束。','标签自由输入，Enter 添加，不提供补全。',
  '新版采用 Things 风格的轻量导航、32像素紧凑事项树、右侧详情和今日执行页，保留全部功能与时间线。侧栏底部可快速切换跟随系统、浅色、深色；设置 → 外观与动效可调整动效，偏好在本机自动保存。',
  '外观同步应用到主窗口、快速记录、到时提醒和屏边计时签。切换不改变筛选、编辑草稿或计时；外观设置不进入日志备份和跨设备同步。默认尊重系统的减少动效设置。此版本不升级日志数据结构。',
  '默认自动排序：今日重点、逾期、今天、未来日期、无日期依次展示；暂停事项、笔记和已结束事项靠后。父项参考可执行子项的紧迫程度；同级保持稳定，编辑中不跳动。排序可随视图保存，不修改原有手动顺序。',
  '添加时 Tab 缩进、Shift+Tab 提升一级，Enter 保存继续，Ctrl+Enter 保存并结束。选中行后 Tab/Shift+Tab 调整层级，Ctrl+Enter 开始/暂停/恢复计时，Ctrl+Shift+Enter 结束本次，Space 完成/重新打开。Ctrl+/ 查看全部快捷键。',
  '快速记录统一语法：留空或 . 开头为事项，- 开头为笔记，o 开头为事件；前缀后加空格。#项目/子项 指定已有归属，%标签 自定义标签，不提供补全。',
  '例如：写周报 %工作 明天开始 周五17:00截止 周五16:00提醒 估计50分钟。保存前可修改识别预览，或把误识别片段保留为正文。带空格的路径和标签可用引号包住。',
  '事件例如：o 明天14:00-15:00 团队交流 明天13:50提醒。事件单独出现在日历，不计为实际投入；笔记没有完成、计划、估计或计时要求。笔记与事件均可转为事项，身份与内容保留。',
  'Windows 全局 Ctrl+Alt+Space 或托盘“快速记录”打开小窗口，Enter 保存并收起，Escape 收起保留草稿。设置可修改或关闭快捷键；占用时显示错误并保留原快捷键。应用需保持运行。',
  '事项详情或右键加入今日重点，行内星标和自动排序立即体现，所属分支随之提前。侧栏“今日重点”可集中查看，支持共享日期筛选与保存视图。今日清单可直接开始或恢复，保留正在计时和已完成进度。只对当天生效，不改计划、截止或历史投入；手动等指定排序保持原规则。',
  'Ctrl 单击多选，Shift 单击或 Shift+方向键从固定起点选择区间，反向可缩小；Ctrl+Space 切换当前行多选状态。Ctrl+A 全选/取消当前显示且匹配的事项，切换筛选或范围清除旧选择。“整理所选”先显示影响，再原子保存。',
  '快速记录只解析第一行。Shift+Enter 后的正文保留换行、#、% 和日期文字；紧凑预览显示正文行数，可展开修改。未修正的日期错误不会因修改名称而消失。',
  '重开应用恢复页面、日期、视图、筛选、范围、选择、折叠、滚动及详情页签；这些浏览偏好仅保存在本机。回顾中可展开项目汇总查看期间完成、推进与未记录投入。',
  '估计自动用尽时提示剩余待重估，与明确填写零不同；计时继续。投入详情区分本项累计与含子项合计。',
  '关闭详情后选择其他行不会重开，详情标签页保留；清空局部搜索恢复原折叠与滚动。“全部事项”重置临时条件和范围，常用视图恢复已保存条件。',
  '本周需完成：事项 → 筛选 → 状态选未完成 → 截止时间选截至本周末，含逾期 → 视图选项 → 保存视图。',
  '常用筛选与高级条件共用规则；支持全部/任一条件组、相对日期、固定范围、标签与投入条件。',
  '常用视图保存范围、条件和同级排序；可更新、另存、复制、重命名、删除。实际完成指已经完成的时间。',
  '多个不同事项可以同时计时；开启或恢复第二个计时器时轻提示：每次只做一件事情，更容易专注。',
  '各计时器独立暂停、恢复、结束；今日显示全部计时器，其他页面可从底部展开管理，托盘按事项操作。',
  '最小化或收至托盘后，屏边计时签显示当前事项与剩余时间。拖动左侧圆点把手可调整位置，重开后记住；点击计时签展开暂停、结束、休息和计时器切换。Escape 收起操作。',
  '隐藏计时签只收起窗口，当前计时继续；托盘“显示屏边计时签”可找回。回到主界面时自动收起。到点继续计时并显示超时；到时卡片优先显示，处理后返回计时签。休息与欢迎继续复用计时签，不会自动开始下一次。',
  '日历将并行时段并排显示。累计投入分别相加，包含重叠时间；同一事项不重复开启计时器。',
  '到时播放提示音并显示持续置顶卡片，计时继续且不抢键盘焦点。多个到时事项合并展示，可分别结束、5 分钟后再提醒或本次不再提醒。',
  '选择“结束并休息 5 分钟”：保存本次投入，开始休息倒计时。今日、提醒卡片和托盘均可操作；普通结束也提供休息入口。休息时长跟随设置。',
  '休息倒计时在所有页面顶部显示，休息不计入投入。结束后发声并显示“欢迎回来”，可继续上一事项、选择其他事项、再休息或暂不开始，不会自动开启下一轮。重开应用恢复剩余休息，错过结束时间则补发欢迎提醒。',
  '先计时的事项可休息后再补充；继续时使用关联后的事项，已完成或不可执行时改为先计时。其他计时器仍在运行时，先暂停或结束它们再休息。',
  '设置 → 到时提醒：调整声音、音量和再次响铃间隔，可试听和预览。首次响铃后最多重复 3 次，卡片持续保留。',
  '完全退出或电脑休眠会保存并暂停全部计时器，重启后自行恢复。',
  'AI 助手：在设置中填写兼容 OpenAI 的服务地址、模型和自己的 API Key。侧栏或事项详情打开，先选择范围，再生成整理、拆解与复盘建议；逐条确认后才修改记录。支持停止生成和旧建议冲突检查。密钥仅加密保存在本机，不进入备份或同步。',
  '本机控制 API：设置中启用并选择只读或允许修改，复制访问密钥交给本机 AI 客户端；默认 127.0.0.1:17642/v1。支持事项、标签、重点、计时、投入和 GitCode 同步；查看 API使用说明.md 和 tools/journal-api.py。默认关闭，密钥由 Windows 加密，退出时接口关闭。',
  'GitCode 同步：在设置中填写 HTTPS 仓库克隆地址、登录用户名和可读写仓库的访问令牌（PAT）。令牌由 Windows 加密保存，不放入日志和仓库。每台电脑需分别配置。',
  '默认使用 focus-journal 分支保存 focus-journal.json；建议使用个人私有仓库，无需安装 Git。配置后从左侧一键同步。先暂停正在计时的事项；下载后计时器保持暂停。',
  '这版按整份日志同步，适合多台电脑轮流使用：一台收工先同步，另一台先同步再工作。双方都有修改时需选择保留哪份；下载前自动备份本机，上传保留远端 Git 历史，不强制推送。',
  '连接测试不上传日志；日志载入前会校验。断网仍可在本机工作，稍后重试同步。提醒音量和其他设备偏好各自保留。',
  '更新时如旧版仍运行，请先在旧版设置中保存并退出，再启动新版，已有个人数据自动读取。','Ctrl+Z 撤销整理操作；撤销记录限本次打开期间，计时、投入记录和完成状态不回退。','计划开始：打算哪一天开始，可留空；实际开始由计时或补记产生，两者独立。','截止时间：支持“某日之前（不含当天）”或精确到分钟，也可留空。选择 10 月 23 日表示 10 月 23 日 00:00 前完成；下周一前完成归入本周视图。','只填名称即可保存或开始，估计可暂空，不要求下一步行动或预期产出。','快速新建可选择切换或并行计时；切换结束其他运行投入，不完成事项。','事项暂停影响整支执行；子项自己的暂停安排保留，恢复不会自动恢复计时。完成、取消、回收站有影响预览，状态撤销保留时间记录。','回顾 → 事项审视：在详情或右键菜单设置一次、每隔 N 天/周/月的审视。到期进入安静队列，只有点击已审视才记录。稍后仅改日期，跳过仅改变浏览位置。','审视完整子树不受工作筛选影响，父子周期独立。可明确选择子项一起审视、撤销最近标记；暂停不停止审视，完成或取消停止未来审视。','回顾 → 投入复盘：看本周完成与推进，按项目、事项、标签筛选，累计时长和去重覆盖分别计算。',qa?'这是独立测试工作区；关闭窗口会保存并退出，不留托盘。':'关闭窗口后保留在托盘，计时继续。需要完全退出时，在设置中选择“保存并退出专注记”，或使用托盘退出菜单。','升级自动保留原有数据，并在升级数据结构前创建 SQLite 备份。','设置中可备份全部数据、恢复备份、打开数据文件夹。',''].join('\r\n'));
  mkdirSync(path.join(output,'tools'),{recursive:true});
  copyFileSync(path.join(root,'tools/journal-api.py'),path.join(output,'tools/journal-api.py'));
  copyFileSync(path.join(root,'docs/local-api.md'),path.join(output,'API使用说明.md'));
  copyFileSync(path.join(root,'../THIRD_PARTY_NOTICES.txt'),path.join(output,'THIRD_PARTY_NOTICES.txt'));
  console.log(`已打包：${path.join(output,'专注记.exe')}`);
}finally{
  const resolved=realpathSync(stage);
  if(path.dirname(resolved)!==path.join(root,'release')||!path.basename(resolved).startsWith('.app-stage-'))throw new Error('拒绝清理工作区之外的路径。');
  rmSync(resolved,{recursive:true,force:true});
}
