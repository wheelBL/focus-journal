# 专注记本机 API v1

在 Windows 版的 **设置 → AI 与本机 API** 开启。默认关闭、默认只读；需要 AI 控制计时或修改事项时，选择“允许读取和修改”并保存。地址默认为 `http://127.0.0.1:17642/v1`，可修改端口。复制访问密钥，配置到同一台电脑上运行的 AI 或脚本中。应用收起到托盘时仍可调用；退出后接口关闭。

这是本机 HTTP JSON 接口。云端 AI 服务无法直接访问你的 `127.0.0.1`；应由本机 AI 客户端或本机工具执行请求。本版没有附带 MCP 服务。

所有请求携带 `Authorization: Bearer <访问密钥>`。接口只监听 IPv4 回环地址，拒绝网页来源调用。密钥由 Windows safeStorage 加密，保存在应用数据目录的 `local-api.json`，不进入工作记录导出或 GitCode 同步。重新生成密钥立即使旧密钥失效；关闭接口立即停止接收调用。端口冲突不会关闭原来正常运行的连接。

## 先读，再写

读取响应为 `{ "revision": "...", "now": "...", "data": ... }`。`revision` 是不透明字符串，响应的 ETag 也包含该值。每次写入必须携带：

- `If-Match: <此前读取的 revision>`：若期间有界面操作、计时检查点或其他写入，返回 `412 revision_conflict`，不执行操作。重新读取并核对，不要盲目覆盖。
- `Idempotency-Key: <8–120 位唯一键>`：一次逻辑操作一个键，建议 UUID。相同请求重发会返回原结果，不重复创建事项或投入；同键不同内容返回 `409 idempotency_conflict`。

重放缓存保留本次接口运行中最近 1000 个成功操作，不跨接口重启。重启会生成新的修订前缀，旧请求的 `If-Match` 因此失效。网络结果不明时保留原请求键和修订号重试；若返回修订冲突，先查询确认原操作是否已生效。

## 查询

| 方法和路径 | 结果 |
| --- | --- |
| `GET /status` | 当前时间、本地日期、时区、版本、权限和支持的命令说明 |
| `GET /items` | 事项列表，默认未完成；只返回实际匹配项，父级路径不会冒充结果 |
| `GET /items?status=all&query=周报` | 搜索所有状态及笔记、事件；status 可选 open/done/cancelled/all |
| `GET /items?focus=today` | 今日重点；重点日期与计划开始、截止时间独立 |
| `GET /items?scopeId=<id>` | 指定事项及其后代范围 |
| `GET /items?viewId=<id>` | 使用保存视图的完整条件，包括动态日期 |
| `GET /items/<id>` | 详情、父级路径、直接子项 ID、投入、估计及复盘 |
| `POST /items/query` | 只读复杂查询，正文 `{ "filter": <保存视图中的 filter>, "offset": 0, "limit": 100 }`；不需要写入权限或修订头 |
| `GET /timers` | 所有当前计时器与休息状态 |
| `GET /sessions?taskId=<id>&from=2026-10-19&to=2026-10-20` | 投入记录；日期包含两端，跨日片段也会匹配，结果仍是完整记录 |
| `GET /tags`、`GET /views` | 标签、保存视图及其 ID |
| `GET /openapi.json` | OpenAPI 3.1 接口定义，包括所有允许命令的输入结构 |

`/items` 和 `/sessions` 支持 `offset`、`limit`（1–200，默认 100）。返回 `{ items, total, offset, limit, nextOffset }`。未指定 from/to 时不限制投入记录日期。字段 `ownEffortMs` 是本项投入，`branchEffortMs` 包含后代，不能相加当作总投入。完整筛选模型可直接取自 `/views`，与应用使用同一验证和匹配逻辑。

## 写入

统一 `POST /commands`，正文 `{ "type": "命令名", "payload": { ... } }`。一次请求原子提交一次业务命令；没有通用 SQL、导入备份、读取凭据或退出应用接口。

| type | payload 示例 |
| --- | --- |
| `item.create` | `{"title":"写周报","description":"总结本周进展","tagNames":["工作"],"dueAt":"2026-10-23"}` |
| `item.create` | `{"title":"参考资料","itemType":"note","parentId":"父项ID"}` |
| `item.create` | `{"title":"团队交流","itemType":"event","eventAt":"2026-10-21T14:00:00+08:00","eventEnd":"2026-10-21T15:00:00+08:00"}` |
| `outline.patch` | `{"id":"事项ID","field":"description","value":"补充说明"}` |
| `outline.move` | `{"id":"事项ID","targetId":"父项ID","position":"inside"}` |
| `item.focus` | `{"id":"事项ID"}`（今天）；`{"id":"事项ID","date":null}`（取消） |
| `tag.attach` / `tag.detach` | `{"id":"事项ID","name":"标签"}` / `{"id":"事项ID","tagId":"标签ID"}` |
| `task.status` | `{"id":"事项ID","status":"done"}`，也支持 open/cancelled |
| `item.change` | `{"id":"事项ID","action":"pause"}`，也支持 resume/delete/restore |
| `item-reminder.set` | `{"id":"事项ID","at":"2026-10-21T13:50:00+08:00"}`；at:null 取消 |
| `event.save` | `{"id":"事件ID","at":"2026-10-22T10:00:00+08:00","end":"2026-10-22T11:00:00+08:00"}` |
| `focus.start` | `{"taskId":"事项ID","targetMinutes":25}` |
| `focus.start-unassigned` | `{}` |
| `focus.pause` / `focus.resume` | `{"sessionId":"计时记录ID"}` |
| `focus.stop` | `{"sessionId":"计时记录ID","rest":true}`；complete:true 显式完成事项 |
| `session.assign` | `{"id":"已结束的未关联记录ID","taskId":"事项ID"}`，或省略 taskId、传 title 新建 |
| `session.manual` | `{"taskId":"事项ID","date":"2026-10-19","minutes":30,"summary":"完成初稿"}` |
| `session.summary` | `{"id":"投入记录ID","summary":"已梳理主要问题","remainingMinutes":20}` |
| `estimate.add` | `{"taskId":"事项ID","remainingMinutes":30,"reason":"增加验证步骤"}` |
| `review.save` | `{"taskId":"事项ID","outcome":"完成初稿","reason":"资料查找超时","adjustment":"下次先列提纲"}` |
| `break.start` / `break.finish` / `break.continue` / `break.stop` | `{}`（开始休息可传 sessionId） |

创建时省略 parentId 使用当前有效收件箱，传 null 放到最外层。项目是事项的 `isProject` 标记，使用 `outline.patch` 设置；没有另一个项目类型。名称按正文保存，不隐式解析日期语义。笔记没有计时、截止或完成状态。

`outline.patch` 每次修改一个字段：title、description、isProject、plannedDate、dueAt、estimateMinutes、itemType（信息转为 task）。原始估计已有值或已有投入时，请通过 estimate.add 调整剩余估计。日期为 `YYYY-MM-DD`；精确时刻推荐带时区的 ISO 8601。截止 `2026-10-23` 表示 **10 月 23 日零点之前完成，不含当天**。

父项完成时若存在未完成子项，需要显式传 `children:"done"` 或 `children:"cancelled"`；整支删除需 `confirmBranch:true`。删除进入回收站，可恢复。移动、完成和删除同样保留原始身份与投入；这些行为可能影响相关计时器，AI 应先读取事项及计时状态再决定。复盘、估计、手动投入均复用应用规则。

投入可传 start/end 精确区间；日期与 minutes 仍需提供，实际时长按区间计算。校正已有记录需传 id，保留原记录审计；同事项重叠或未来投入会被拒绝。计时到达目标只提醒，不自动停止；并行计时返回专注提示，不偷偷结束其他事项。

写入结果 `data` 包含 createdItemIds、changedItemIds、createdSessionIds、changedSessionIds 和 notices；可据此读取详情。成功的 API 操作在数据目录的 `local-api.audit.jsonl` 记录时间、请求键、命令名和变更 ID，不记录请求正文或密钥。

## 同步数据

复用应用现有的 GitCode 整份日志同步。在设置中配置仓库和访问令牌一次；API 不读取或修改凭据。查询只需只读权限，触发同步和处理冲突需允许修改，并携带相同的 If-Match / Idempotency-Key 保护头。

| 方法和路径 | 用途 |
| --- | --- |
| `GET /sync/status` | 当前配置摘要、phase、lastSuccess、冲突摘要及 conflict.id |
| `POST /sync/run`，正文 `{}` | 接受一次同步请求，返回 202 和 data.operation.id / data.operationUrl |
| `GET /sync/operations/<id>` | 轮询该次操作；state 为 working 或 finished |
| `POST /sync/resolve` | 正文 `{"conflictId":"当前冲突ID","choice":"local"}` 或 choice:"remote" |

`202` 只代表已接受，不代表同步成功。操作结束后检查 `result.phase`：ok=成功，conflict=需要选择，error=失败；同时查看 result.message。极少数未能启动的操作返回 error 字符串。操作记录保留本次服务最近 200 条；服务重启或换端口后查询当前 `/sync/status`，不要盲目重试旧操作。

有运行中的计时器时返回 `409 timers_running`，不会自动暂停；先查询 `/timers`，明确暂停后重新读取修订号再同步。同步正在进行返回 `409 sync_busy`。重试同一个请求键会返回原操作编号，不重复传输。关闭 API 会停止新请求，已经接受的同步继续运行；退出应用则按现有同步逻辑取消未完成操作。

两边有修改时保持 conflict 状态，不自动覆盖。local 表示将本机整份日志上传，remote 表示载入远端整份日志；这不是字段合并。提交选择前读取最新状态和修订号，明确核对两边摘要。应用再次校验两边内容，变化则产生新冲突；载入前备份，上传保留 Git 历史，不强制推送。没有配置仓库时返回 `409 sync_not_configured`，无凭据不会自行创建仓库。

```text
python tools/journal-api.py read /sync/status
python tools/journal-api.py sync run --revision "最近读取的revision" --request-id "唯一UUID"
python tools/journal-api.py read /sync/operations/返回的操作ID
python tools/journal-api.py sync resolve --conflict-id "当前冲突ID" --choice remote --revision "最新revision" --request-id "另一个唯一UUID"
```

## PowerShell 示例

将设置中的密钥放入当前进程的 `FOCUS_JOURNAL_TOKEN` 环境变量，避免硬编码到项目文件。若修改了端口，相应修改 base。

```powershell
$base = 'http://127.0.0.1:17642/v1'
$headers = @{ Authorization = "Bearer $env:FOCUS_JOURNAL_TOKEN" }
$status = Invoke-RestMethod "$base/status" -Headers $headers
$headers['If-Match'] = $status.revision
$headers['Idempotency-Key'] = [guid]::NewGuid().ToString()
$body = @{ type='item.create'; payload=@{title='整理周报';tagNames=@('工作')} } |
    ConvertTo-Json -Depth 5
$result = Invoke-RestMethod "$base/commands" -Method Post -Headers $headers `
    -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
$result.data.createdItemIds
```

## Python 工具

便携包的 `tools/journal-api.py` 使用 Python 3 标准库，不需安装第三方包；应用本身不需要 Python。设置 `FOCUS_JOURNAL_TOKEN`，可选 `FOCUS_JOURNAL_URL`：

```text
python tools/journal-api.py read /status
python tools/journal-api.py read /items?focus=today
python tools/journal-api.py read /openapi.json
python tools/journal-api.py command item.create --payload @request.json --revision "上次读取的revision" --request-id "唯一UUID"
```

request.json 是 UTF-8 文件，例如 `{"title":"整理周报"}`。工具不会自动处理修订冲突，也不会自动换键重试。

## 错误

错误结构 `{ "error": { "code": "...", "message": "..." } }`。常见状态：400 输入错误；401 密钥错误；403 只读或网页来源；404 不存在；409 请求键冲突或同步条件未满足；412 修订冲突；413 超过 64 KiB；415 非 JSON；422 业务条件不满足；428 缺少写入保护头；500 保存失败。


0.20.0 新增投入回收站：`session.delete {id}` 删除已结束的投入，`session.restore {id}` 恢复。仍需写权限、If-Match 和 Idempotency-Key。删除返回 `removedSessionIds`，并更新事项累计投入；`GET /v1/sessions?deleted=true` 分页查询可恢复记录。恢复同一事项的重叠区间会拒绝，运行中的记录不能删除。备份与同步包含回收站，CSV 只导出有效投入。
