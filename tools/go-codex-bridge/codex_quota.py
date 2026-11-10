"""Read the local Codex account and usage limits without starting a model turn."""
import json
import math
import os
import queue
import re
import subprocess
import threading
import time


def worker_environment():
    return {key:value for key,value in os.environ.items() if not re.search(
        r"TOKEN|PASSWORD|SECRET|API_KEY|DATABASE_URL|SUPABASE|RAILWAY|^GH_|^GITHUB_|SSH_AUTH_SOCK|TRELLO|ATLASSIAN",
        key,re.I)}


def read_quota(executable, sign):
    with subprocess.Popen([executable,"-c",'model_provider="openai"',"app-server","--listen","stdio://"],
                          env=worker_environment(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                          stderr=subprocess.DEVNULL,text=True,encoding="utf-8",
                          creationflags=0x08000000 if os.name=="nt" else 0) as process:
        lines = queue.SimpleQueue()

        def read():
            try:
                for line in process.stdout:
                    lines.put(line)
            finally:
                lines.put(None)

        reader = threading.Thread(target=read,daemon=True)
        reader.start()
        deadline = time.monotonic()+18

        def request(identifier, method, params):
            process.stdin.write(json.dumps({"id":identifier,"method":method,"params":params})+"\n")
            process.stdin.flush()
            while True:
                try:
                    line = lines.get(timeout=max(0,deadline-time.monotonic()))
                except queue.Empty:
                    raise TimeoutError("App Server response timed out") from None
                if line is None:
                    raise ValueError("App Server disconnected")
                reply = json.loads(line)
                if reply.get("id")==identifier:
                    return reply["result"]

        try:
            request(1,"initialize",{"clientInfo":{"name":"go_bridge_quota","version":"1"}})
            process.stdin.write('{"method":"initialized"}\n')
            process.stdin.flush()
            account = request(2,"account/read",{"refreshToken":False}).get("account")
            if not account or account.get("type")!="chatgpt" or not account.get("email"):
                return {"state":"unauthenticated","windows":[]},None
            response = request(3,"account/rateLimits/read",{})
            bucket = (response.get("rateLimitsByLimitId") or {}).get("codex") or response["rateLimits"]
            windows = []
            for key in ("primary","secondary"):
                window = bucket.get(key)
                if window is None:
                    continue
                used = window["usedPercent"]
                minutes = window.get("windowDurationMins")
                if type(used) not in (int,float) or not math.isfinite(used) or not 0<=used<=100:
                    raise ValueError("Unknown rate limit")
                windows.append({"used_percent":used,"minutes":minutes,"resets_at":window.get("resetsAt")})
            if not windows:
                raise ValueError("No rate windows")
            limited = bucket.get("rateLimitReachedType") or any(window["used_percent"]>=100 for window in windows)
            identity = sign({"kind":"codex-chatgpt","account":account["email"].strip().casefold()})
            return {"state":"limited" if limited else "available","windows":windows},identity
        finally:
            if process.poll() is None:
                process.terminate()
            process.wait(timeout=5)
            reader.join(timeout=1)
