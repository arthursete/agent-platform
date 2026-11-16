// The whole chat page, as one string. No framework and no build step:
// a form, a list of messages, and one fetch() call.
export const PAGE = /* html */ `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent platform</title>
<style>
  :root { color-scheme: light dark; --line: #8884; --accent: #1d6b57; }
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 720px; margin: 0 auto; padding: 16px; display: grid; gap: 12px; min-height: 100dvh; grid-template-rows: auto 1fr auto; box-sizing: border-box; }
  h1 { font-size: 18px; margin: 0; }
  #log { display: grid; gap: 10px; align-content: start; overflow-y: auto; }
  .msg { padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .user { justify-self: end; background: var(--accent); color: #fff; border-color: transparent; }
  .error { border-color: #c33; }
  .tools { font: 12px ui-monospace, monospace; opacity: .75; margin-top: 6px; }
  form { display: flex; gap: 8px; }
  input { flex: 1; font: inherit; padding: 10px; border: 1px solid var(--line); border-radius: 8px; min-width: 0; }
  button { font: inherit; padding: 10px 16px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
</style>
<h1>IT agent · Kestrel Freight (simulated)</h1>
<div id="log" aria-live="polite"></div>
<form id="form">
  <input id="box" autocomplete="off" placeholder="Try: which devices are non-compliant?" aria-label="Message" required>
  <button id="send">Send</button>
</form>
<script>
  const log = document.getElementById("log"), form = document.getElementById("form");
  const box = document.getElementById("box"), send = document.getElementById("send");
  let conversationId = null;

  function add(kind, text, tools) {
    const el = document.createElement("div");
    el.className = "msg " + kind;
    el.textContent = text; // textContent, never innerHTML: replies are untrusted
    if (tools && tools.length) {
      const t = document.createElement("div");
      t.className = "tools";
      t.textContent = tools.map((c) => (c.blocked ? "BLOCKED " : c.failed ? "failed " : "") + c.name + " " + JSON.stringify(c.input)).join("\\n");
      el.append(t);
    }
    log.append(el);
    el.scrollIntoView({ block: "end" });
    return el;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = box.value.trim();
    if (!message) return;
    add("user", message);
    box.value = "";
    send.disabled = true;
    const waiting = add("agent", "Working…");
    try {
      const res = await fetch("/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, conversationId }) });
      const data = await res.json();
      waiting.remove();
      if (!res.ok) add("agent error", data.error || "Something went wrong.");
      else { conversationId = data.conversationId; add("agent", data.reply, data.toolCalls); }
    } catch {
      waiting.remove();
      add("agent error", "Could not reach the server.");
    }
    send.disabled = false;
    box.focus();
  });
</script>
</html>`;
