// Uso: node scratch/cdp.js "<expresión JS a evaluar en la página>"
const expr = process.argv[2];
const list = await (await fetch('http://localhost:9333/json')).json();
const ws = new WebSocket(list.find(p => p.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
const msg = await new Promise(r => ws.onmessage = e => r(JSON.parse(e.data)));
console.log(JSON.stringify(msg.result?.result?.value ?? msg.result?.exceptionDetails ?? msg, null, 1));
ws.close();
