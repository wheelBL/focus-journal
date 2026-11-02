# 纯提醒与收件箱

`itemType: reminder` 是没有执行状态的提醒内容。它沿用事项 ID 和任意嵌套关系，使用 `reminder.at` 保存精确提醒时间；可配置 `recurrence.mode: calendar`。确认本次只更新下一次提醒时间，不新建完成记录，不启动计时。稍后提醒使用 `snoozedUntil`，原有日历基准不变。月末取当月最后一天，但后续月份仍以原锚点日计算。

`reminder.convert` 原子保存原任务的执行安排到 `reminderHistory`，清空当前不适用的计划、截止、估计、重点和审视等字段。已结束投入、身份、内容、标签和子项保留。活动或暂停计时需先结束；关闭事项需先恢复。通过 `outline.patch` 将 `itemType` 改回 `task` 时恢复原安排。转换须明确确认，既不批量转换父节点，也不改写历史完成归属。

收件箱是独立视图，范围来自原有 `inbox` 节点，隐藏容器自身。待整理数量按有效的直接子内容计算，包括笔记，避免嵌套重复计数。该数量不是待办数量。已删除、归档或不可用的收件箱不会被自动重建。

`settings.inboxReview` 默认启用、时间 09:00，按本机时区解释。只在有内容且当天尚未确认时提醒；应用在指定时间后启动可补提醒。确认当天不再提醒，五分钟稍后提醒保持独立状态，重启后保留。没有未整理内容时不弹出卡片。时间与开关在收件箱标题旁设置。

API 提供 `reminder.convert`、`recurrence.set`、`item-reminder.set/dismiss/snooze`、`inbox-review.settings/dismiss/snooze`。继续使用本机 API 的鉴权、修订号和幂等机制。备份和同步验证数据结构 21；SQLite 在升级前保存旧版本备份，密钥不属于业务数据。
