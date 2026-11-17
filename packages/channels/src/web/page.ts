// The whole chat page, as one string. No framework and no build step.
//
// Layout: the conversation on the left, and on the right a running record
// of every action the agent took: which system, which tool, what input,
// and whether it ran, failed, or was held for approval. On a narrow
// screen the record moves under each reply instead.
//
// Note for editing: this is a TypeScript template string, so the script
// below avoids backticks and backslashes.
export const PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kestrel Freight IT desk</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  :root {
    --paper: #eef1f4; --surface: #ffffff; --sunk: #e3e8ed; --ink: #14202b; --soft: #55636f; --line: #d3dae1;
    --slate: #2c5673; --slate-soft: #dfe9f0; --on-slate: #ffffff;
    --entra: #2c5673; --intune: #6a4c93;
    --ok: #2f7d5b; --hold: #a86a10; --hold-soft: #fbf0d9; --fail: #b3261e; --fail-soft: #fbe6e4;
    --ui: "Schibsted Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif;
    --code: "JetBrains Mono", ui-monospace, Menlo, monospace;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --paper: #0f161c; --surface: #17212a; --sunk: #1e2a34; --ink: #e6ecf1; --soft: #93a2ae; --line: #2a3843;
      --slate: #7fb2d3; --slate-soft: #1d3140; --on-slate: #0f161c;
      --entra: #7fb2d3; --intune: #b79be0;
      --ok: #6cc49b; --hold: #e5b25a; --hold-soft: #33290f; --fail: #f08d85; --fail-soft: #3a1a18;
      color-scheme: dark;
    }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.55 var(--ui); display: grid; grid-template-rows: auto 1fr; }
  button, textarea { font: inherit; color: inherit; }
  :focus-visible { outline: 2px solid var(--slate); outline-offset: 2px; }

  /* ---------- top bar ---------- */
  .bar { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid var(--line); background: var(--surface); }
  .mark { width: 30px; height: 30px; flex: none; }
  .bar h1 { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; margin: 0; line-height: 1.2; }
  .bar p { margin: 0; font-size: 13px; color: var(--soft); line-height: 1.3; }
  .bar .titles { min-width: 0; flex: 1; }
  .ghost { background: none; border: 1px solid var(--line); border-radius: 8px; padding: 7px 12px; font-size: 14px; font-weight: 500; cursor: pointer; white-space: nowrap; }
  .ghost:hover { background: var(--sunk); }

  /* ---------- two panes ---------- */
  .desk { display: grid; grid-template-columns: minmax(0, 1fr) 380px; min-height: 0; }
  .talk { display: grid; grid-template-rows: 1fr auto; min-height: 0; min-width: 0; }
  #log { overflow-y: auto; padding: 28px 20px 12px; }
  .column { max-width: 680px; margin: 0 auto; display: grid; gap: 22px; }

  /* ---------- empty state ---------- */
  .welcome h2 { font-size: clamp(28px, 4.2vw, 40px); line-height: 1.08; letter-spacing: -0.025em; font-weight: 700; margin: 6vh 0 10px; text-wrap: balance; }
  .welcome p { color: var(--soft); margin: 0 0 22px; max-width: 52ch; }
  .starters { display: grid; gap: 8px; }
  .starter { text-align: left; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; cursor: pointer; display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; align-items: center; }
  .starter:hover { border-color: var(--slate); }
  .starter b { font-weight: 600; }
  .starter span { grid-column: 1; font-size: 14px; color: var(--soft); }
  .starter i { grid-row: 1 / span 2; grid-column: 2; font-style: normal; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 99px; background: var(--sunk); color: var(--soft); }
  .starter i.held { background: var(--hold-soft); color: var(--hold); }

  /* ---------- messages ---------- */
  .turn { display: grid; gap: 6px; }
  .who { font-size: 13px; font-weight: 600; color: var(--soft); }
  .you .who { text-align: right; }
  .you .text { justify-self: end; background: var(--slate); color: var(--on-slate); padding: 10px 14px; border-radius: 14px 14px 4px 14px; max-width: 85%; }
  .text { white-space: pre-wrap; overflow-wrap: anywhere; }
  .agent .text { max-width: 68ch; }
  .problem .text { background: var(--fail-soft); color: var(--fail); padding: 10px 14px; border-radius: 10px; }
  .working { display: inline-flex; align-items: center; gap: 10px; color: var(--soft); }
  .working::before { content: ""; width: 9px; height: 9px; border-radius: 50%; background: var(--slate); animation: pulse 1.1s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .25; transform: scale(.7); } }

  /* ---------- composer ---------- */
  .composer { padding: 10px 20px 18px; }
  .composer form { max-width: 680px; margin: 0 auto; display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 8px 8px 8px 14px; }
  .composer form:focus-within { border-color: var(--slate); }
  textarea { border: 0; background: none; resize: none; padding: 7px 0; max-height: 160px; line-height: 1.45; outline: none; width: 100%; }
  textarea::placeholder { color: var(--soft); }
  .send { background: var(--slate); color: var(--on-slate); border: 0; border-radius: 9px; padding: 9px 16px; font-weight: 600; cursor: pointer; }
  .send:disabled { opacity: .45; cursor: default; }
  .hint { max-width: 680px; margin: 6px auto 0; font-size: 12px; color: var(--soft); }

  /* ---------- the record of actions ---------- */
  .record { border-left: 1px solid var(--line); background: var(--surface); display: grid; grid-template-rows: auto 1fr; min-height: 0; }
  .record header { padding: 16px 18px 12px; border-bottom: 1px solid var(--line); }
  .record h2 { font-size: 15px; font-weight: 700; margin: 0; }
  .record header p { margin: 2px 0 0; font-size: 13px; color: var(--soft); }
  #rail { overflow-y: auto; padding: 14px 18px 24px; display: grid; gap: 20px; align-content: start; }
  .none { font-size: 14px; color: var(--soft); margin: 0; }
  .batch > p { font-size: 13px; font-weight: 600; margin: 0 0 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Each action is a stop on a line, in the order it happened. */
  .stops { list-style: none; margin: 0; padding: 0; }
  .stop { position: relative; padding: 0 0 12px 22px; }
  .stop::before { content: ""; position: absolute; left: 4px; top: 13px; bottom: -5px; width: 2px; background: var(--line); }
  .stop:last-child { padding-bottom: 0; }
  .stop:last-child::before { display: none; }
  .stop::after { content: ""; position: absolute; left: 0; top: 6px; width: 10px; height: 10px; border-radius: 50%; background: var(--ok); }
  .stop.failed::after { background: var(--fail); }
  .stop.held::after { background: var(--surface); border: 2px solid var(--hold); width: 6px; height: 6px; }
  .line1 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
  .system { font-size: 12px; font-weight: 600; color: var(--entra); }
  .system.intune { color: var(--intune); }
  .action { font-weight: 600; font-size: 14px; }
  .status { font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 99px; margin-left: auto; }
  .held .status { background: var(--hold-soft); color: var(--hold); }
  .failed .status { background: var(--fail-soft); color: var(--fail); }
  .args { font: 12px/1.5 var(--code); color: var(--soft); overflow-wrap: anywhere; margin-top: 1px; }
  .why { font-size: 13px; color: var(--soft); margin-top: 4px; }

  /* Under each reply on narrow screens; hidden when the side record shows. */
  .inline { display: none; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
  .inline summary { padding: 8px 12px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .inline .stops { padding: 4px 12px 12px; }

  @media (max-width: 900px) {
    .desk { grid-template-columns: minmax(0, 1fr); }
    .record { display: none; }
    .inline { display: block; }
    .bar { padding: 10px 16px; }
    #log { padding: 20px 16px 8px; }
    .composer { padding: 8px 16px 14px; }
    .hint { display: none; }
  }
  @media (prefers-reduced-motion: reduce) { .working::before { animation: none; } }
</style>
</head>
<body>
<header class="bar">
  <svg class="mark" viewBox="0 0 30 30" aria-hidden="true">
    <rect width="30" height="30" rx="7" fill="var(--slate)"/>
    <path d="M6 19 L15 8 L24 19 L18.5 16.5 L15 22 L11.5 16.5 Z" fill="var(--on-slate)"/>
  </svg>
  <div class="titles">
    <h1>Kestrel Freight IT desk</h1>
    <p>A simulated company. Nothing here touches a real account or device.</p>
  </div>
  <button class="ghost" id="fresh" type="button">New conversation</button>
</header>

<div class="desk">
  <main class="talk">
    <div id="log" aria-live="polite">
      <div class="column" id="column">
        <section class="welcome" id="welcome">
          <h2>Ask about staff accounts and devices.</h2>
          <p>The agent looks things up in Entra and Intune, then acts. Anything that cannot be undone is held until a person approves it.</p>
          <div class="starters">
            <button class="starter" type="button" data-ask="Which devices are non-compliant, and who uses them?"><b>Find non-compliant devices</b><span>Which devices are non-compliant, and who uses them?</span><i>Looks up</i></button>
            <button class="starter" type="button" data-ask="Is Grace Lindqvist's account still active? What does she still have access to?"><b>Check someone who left</b><span>Is Grace Lindqvist's account still active?</span><i>Looks up</i></button>
            <button class="starter" type="button" data-ask="Onboard Noor Haddad as an Account Executive in Sales, reporting to the Head of Sales. Add her to the Sales group and give her a Microsoft 365 licence."><b>Onboard a new starter</b><span>Create Noor Haddad in Sales with a group and a licence.</span><i>Makes changes</i></button>
            <button class="starter" type="button" data-ask="Sam Whitlock is handing back his laptop today. Retire it."><b>Retire a laptop</b><span>Sam Whitlock is handing back his laptop today.</span><i class="held">Needs approval</i></button>
          </div>
        </section>
      </div>
    </div>
    <div class="composer">
      <form id="form">
        <textarea id="box" rows="1" placeholder="Ask the IT agent to look something up or make a change" aria-label="Message to the IT agent"></textarea>
        <button class="send" id="send">Send</button>
      </form>
      <p class="hint">Enter sends. Shift and Enter starts a new line.</p>
    </div>
  </main>

  <aside class="record" aria-label="What the agent did">
    <header>
      <h2>What the agent did</h2>
      <p id="tally">No actions yet.</p>
    </header>
    <div id="rail"><p class="none" id="none">Each lookup and change appears here, in the order it happened.</p></div>
  </aside>
</div>

<script>
  var column = document.getElementById("column"), log = document.getElementById("log");
  var form = document.getElementById("form"), box = document.getElementById("box"), send = document.getElementById("send");
  var rail = document.getElementById("rail"), tally = document.getElementById("tally");
  var conversationId = null, busy = false, counts = { ran: 0, held: 0, failed: 0 };

  // Small helper: make an element with a class and text. Text always goes in
  // through textContent, never innerHTML, because replies are untrusted.
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function addTurn(kind, who, text) {
    var w = document.getElementById("welcome");
    if (w) w.remove();
    var turn = el("div", "turn " + kind);
    turn.append(el("div", "who", who), el("div", "text", text));
    column.append(turn);
    log.scrollTop = log.scrollHeight;
    return turn;
  }

  // "intune_wipe_device" -> system "Intune", action "Wipe device"
  function describe(name) {
    var cut = name.indexOf("_");
    var system = cut > 0 ? name.slice(0, cut) : "";
    var words = (cut > 0 ? name.slice(cut + 1) : name).split("_").join(" ");
    return { system: system, label: system ? system.charAt(0).toUpperCase() + system.slice(1) : "Tool", action: words.charAt(0).toUpperCase() + words.slice(1) };
  }

  function argsText(input) {
    if (!input || typeof input !== "object") return "";
    return Object.keys(input).map(function (k) {
      var v = input[k];
      return k + ": " + (typeof v === "string" ? v : JSON.stringify(v));
    }).join("   ");
  }

  function buildStops(calls) {
    var list = el("ol", "stops");
    calls.forEach(function (c) {
      var d = describe(c.name);
      var state = c.blocked ? "held" : c.failed ? "failed" : "ran";
      var stop = el("li", "stop " + state);
      var line = el("div", "line1");
      line.append(el("span", "system " + d.system, d.label), el("span", "action", d.action));
      if (state === "held") line.append(el("span", "status", "Held for approval"));
      if (state === "failed") line.append(el("span", "status", "Failed"));
      stop.append(line);
      var args = argsText(c.input);
      if (args) stop.append(el("div", "args", args));
      if (state === "held") stop.append(el("div", "why", "Not run. This cannot be undone, so a person has to approve it first."));
      if (state === "failed" && c.detail) stop.append(el("div", "why", c.detail));
      list.append(stop);
    });
    return list;
  }

  function record(question, calls, turn) {
    if (!calls.length) return;
    calls.forEach(function (c) { counts[c.blocked ? "held" : c.failed ? "failed" : "ran"]++; });
    var parts = [counts.ran + " ran"];
    if (counts.held) parts.push(counts.held + " held for approval");
    if (counts.failed) parts.push(counts.failed + " failed");
    tally.textContent = parts.join(", ");

    // Side record (wide screens).
    var none = document.getElementById("none");
    if (none) none.remove();
    var batch = el("section", "batch");
    batch.append(el("p", null, question), buildStops(calls));
    rail.append(batch);
    rail.scrollTop = rail.scrollHeight;

    // The same record under the reply (narrow screens).
    var held = calls.filter(function (c) { return c.blocked; }).length;
    var under = el("details", "inline");
    under.open = held > 0;
    under.append(el("summary", null, calls.length + (calls.length === 1 ? " action" : " actions") + (held ? ", " + held + " held for approval" : "")), buildStops(calls));
    turn.append(under);
  }

  async function ask(message) {
    if (busy || !message) return;
    busy = true;
    send.disabled = true;
    addTurn("you", "You", message);
    var waiting = addTurn("agent", "IT agent", "");
    waiting.lastChild.append(el("span", "working", "Looking into it"));
    try {
      var res = await fetch("/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: message, conversationId: conversationId }) });
      var data = await res.json();
      waiting.remove();
      if (!res.ok) addTurn("agent problem", "IT agent", data.error || "The request failed. Try sending it again.");
      else {
        conversationId = data.conversationId;
        var turn = addTurn("agent", "IT agent", data.reply);
        record(message, data.toolCalls || [], turn);
      }
    } catch (err) {
      waiting.remove();
      addTurn("agent problem", "IT agent", "The server did not answer. Check that npm run web is still running, then send it again.");
    }
    busy = false;
    send.disabled = false;
    log.scrollTop = log.scrollHeight;
    box.focus();
  }

  function grow() { box.style.height = "auto"; box.style.height = Math.min(box.scrollHeight, 160) + "px"; }

  function submit() {
    var message = box.value.trim();
    if (!message || busy) return;
    box.value = "";
    grow();
    ask(message);
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); submit(); });
  box.addEventListener("input", grow);
  box.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
  });
  document.querySelectorAll(".starter").forEach(function (b) {
    b.addEventListener("click", function () { ask(b.dataset.ask); });
  });
  // A new conversation is a fresh page: new id, empty record. The simulated
  // company itself only resets when the server restarts.
  document.getElementById("fresh").addEventListener("click", function () { location.reload(); });
  box.focus();
</script>
</body>
</html>`;
