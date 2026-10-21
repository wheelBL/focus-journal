"""Small local-only JSON client, Python 3 standard library. Never prints credentials."""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    parser = argparse.ArgumentParser(description="专注记本机 API 客户端")
    parser.add_argument("--url", default=os.environ.get("FOCUS_JOURNAL_URL", "http://127.0.0.1:17642/v1"))
    sub = parser.add_subparsers(dest="mode", required=True)
    read = sub.add_parser("read")
    read.add_argument("path", help="/status, /items?focus=today, /timers, /openapi.json …")
    write = sub.add_parser("command")
    write.add_argument("type")
    write.add_argument("--payload", required=True, help="JSON 对象，或 @文件路径（UTF-8）")
    write.add_argument("--revision", required=True, help="最近读取的 revision；冲突时重新读取并核对")
    write.add_argument("--request-id", required=True, help="唯一请求键；同一操作重试复用原键")
    sync = sub.add_parser("sync", help="触发 GitCode 同步或处理冲突；返回操作地址供轮询")
    sync.add_argument("action", choices=["run", "resolve"])
    sync.add_argument("--conflict-id")
    sync.add_argument("--choice", choices=["local", "remote"])
    sync.add_argument("--revision", required=True)
    sync.add_argument("--request-id", required=True)
    args = parser.parse_args()
    base = urllib.parse.urlsplit(args.url)
    if base.scheme != "http" or base.hostname != "127.0.0.1" or not base.port or base.username or base.password or base.path.rstrip("/") != "/v1" or base.query or base.fragment:
        parser.error("连接地址必须是 http://127.0.0.1:端口/v1")
    token = os.environ.get("FOCUS_JOURNAL_TOKEN")
    if not token:
        parser.error("请先设置 FOCUS_JOURNAL_TOKEN 环境变量。")
    headers = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}
    data = None
    if args.mode == "read":
        path = urllib.parse.urlsplit(args.path)
        if not args.path.startswith("/") or args.path.startswith("//") or path.scheme or path.netloc or path.fragment:
            parser.error("读取路径必须以 / 开头，不能包含其他主机。")
        route = args.path
    elif args.mode == "command":
        raw = args.payload
        if raw.startswith("@"):
            with open(raw[1:], encoding="utf-8-sig") as file:
                raw = file.read()
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            parser.error("payload 必须是 JSON 对象。")
        data = json.dumps({"type": args.type, "payload": payload}, ensure_ascii=False).encode("utf-8")
        headers.update({"If-Match": args.revision, "Idempotency-Key": args.request_id})
        route = "/commands"
    else:
        if args.action == "resolve" and (not args.conflict_id or not args.choice):
            parser.error("解决冲突需 --conflict-id 和 --choice local/remote。")
        if args.action == "run" and (args.conflict_id or args.choice):
            parser.error("普通同步不接受冲突选项。")
        payload = {} if args.action == "run" else {"conflictId": args.conflict_id, "choice": args.choice}
        data = json.dumps(payload).encode("utf-8")
        headers.update({"If-Match": args.revision, "Idempotency-Key": args.request_id})
        route = "/sync/" + args.action
    request = urllib.request.Request(args.url.rstrip("/") + route, headers=headers, data=data)
    # Ignore environment proxies; credentials only travel to the explicit loopback endpoint.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=15) as response:
            result = json.load(response)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except urllib.error.HTTPError as error:
        try:
            result = json.load(error)
        except (ValueError, UnicodeError):
            result = {"error": {"code": "invalid_response", "message": "接口返回无效响应；未跟随重定向。"}}
        print(json.dumps({"status": error.code, **result}, ensure_ascii=False), file=sys.stderr)
        return 1
    except urllib.error.URLError:
        print("无法连接专注记；请确认应用运行且 API 已启用。写入失败时先读取核对，不要使用新请求键盲目重试。", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
