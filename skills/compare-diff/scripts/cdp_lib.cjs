// 三支 cdp_*.cjs 共用的 CDP 連線／擷取工具。
// 抽出來的理由:同樣的 ws 連線、UA 覆寫、頁名擷取原本在三支各寫一份,已經漂移過
// (cdp_eval 漏了 UA 覆寫、cdp_seq 取頁名沒走 iframe)。要改連線行為只改這裡。
// 副檔名必須是 .cjs — 專案 package.json 是 "type": "module",.js 會被當 ES module 而 require() 爆掉。
// 依賴:ws(以 NODE_PATH 指向專案 node_modules)
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.CDP_PORT || '9222';
const BASE = 'http://127.0.0.1:' + PORT;
const SEND_TIMEOUT = Number(process.env.CDP_SEND_TIMEOUT || 30000);
const UA_FALLBACK = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJSON(p) {
    return new Promise((resolve, reject) => {
        http.get(BASE + p, (res) => {
            let d = '';
            res.on('data', (c) => (d += c));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(d));
                } catch (e) {
                    reject(new Error('CDP ' + p + ' 回應不是 JSON:' + d.slice(0, 200)));
                }
            });
        }).on('error', reject);
    });
}

function putJSON(p) {
    return new Promise((resolve, reject) => {
        const req = http.request(BASE + p, { method: 'PUT' }, (res) => {
            let d = '';
            res.on('data', (c) => (d += c));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(d));
                } catch (e) {
                    reject(new Error('CDP ' + p + ' 回應不是 JSON:' + d.slice(0, 200)));
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// 輸出目錄。CDP_OUT 為必填且必須每模組一個子目錄——共用一個目錄時,不同模組的同名頁
// (以及 cdp_seq 的 seq_<i>_<頁名>)會互相覆蓋,而且是靜默覆蓋,報告佐證會對到別的模組。
function outDir() {
    const v = process.env.CDP_OUT;
    if (!v) {
        throw new Error(
            'CDP_OUT 未設。擷取輸出一律每模組一個子目錄,例:CDP_OUT="' + path.join(os.tmpdir(), 're', '<模組>') + path.sep + '"',
        );
    }
    const d = v.replace(/[\\/]*$/, path.sep);
    fs.mkdirSync(d, { recursive: true });
    return d;
}

// UA 取實際跑的 Chrome 版本,只把 HeadlessChrome 換掉;寫死版號會在 Axure 做瀏覽器檢查時變成難查的問題。
async function browserUA() {
    try {
        const v = await getJSON('/json/version');
        const ua = v['User-Agent'];
        if (ua) return ua.replace('HeadlessChrome', 'Chrome');
    } catch (e) {
        /* 取不到就用 fallback */
    }
    return UA_FALLBACK;
}

const IFRAME_TEXT =
    "(function(){try{var f=document.getElementById('mainFrame')||document.querySelector('iframe');if(f&&f.contentWindow&&f.contentWindow.document.body){return f.contentWindow.document.body.innerText;}return '[NO_IFRAME] '+document.body.innerText.slice(0,200);}catch(e){return '[ERR] '+e.message;}})()";
const IFRAME_LEN =
    "(function(){try{var f=document.getElementById('mainFrame')||document.querySelector('iframe');var b=f&&f.contentWindow?f.contentWindow.document.body:null;return b?b.innerText.length:0;}catch(e){return 0;}})()";
// 頁名優先走 iframe 的 $axure(cdp_seq 原本只看 top-level,常落回 document.title,而檔名就是用它組的)。
const PAGE_NAME =
    "(function(){try{var f=document.getElementById('mainFrame');var w=f&&f.contentWindow?f.contentWindow:null;if(w&&w.$axure&&w.$axure.page&&w.$axure.page.shortName)return w.$axure.page.shortName;if(typeof $axure!=='undefined'&&$axure.page&&$axure.page.shortName)return $axure.page.shortName;return document.title||'(no axure)';}catch(e){return '[ERR] '+e.message;}})()";

// session 失效的判斷:抽到的是登入頁字樣,或文字短到不可能是原型畫面。
function looksLikeLogin(text) {
    const t = String(text || '');
    if (t.length < 40) return true;
    return /sign in|sign up|log in|forgot your password|axure cloud/i.test(t) && t.length < 1200;
}

// 連上 page target。沒有現成 target 就自己開一個(三支腳本原本只有 cdp_shot 有這層保護,
// 另兩支會炸在 undefined.webSocketDebuggerUrl,錯誤訊息完全不指向真因)。
async function connect({ viewport } = {}) {
    let targets;
    try {
        targets = await getJSON('/json');
    } catch (e) {
        throw new Error('連不上 CDP ' + BASE + ' — 先跑 launch-chrome.ps1(埠可用 CDP_PORT 覆寫)。原始錯誤:' + e.message);
    }
    let page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (!page) page = await putJSON('/json/new?about:blank');
    if (!page || !page.webSocketDebuggerUrl) throw new Error('取不到可用的 page target(' + BASE + '/json),Chrome 可能剛啟動失敗');

    const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, headers: { Origin: 'http://localhost' } });
    let id = 0;
    const pending = new Map();
    let dead = null;
    // 沒有這層時 ws 斷線／CDP 不回應會讓 send() 永遠 pending,而本流程正是叫人丟背景執行 → 無聲卡死。
    const killAll = (err) => {
        dead = err;
        for (const [, p] of pending) p.reject(err);
        pending.clear();
    };
    ws.on('message', (raw) => {
        const m = JSON.parse(raw);
        if (m.id && pending.has(m.id)) {
            const p = pending.get(m.id);
            pending.delete(m.id);
            p.resolve(m);
        }
    });
    ws.on('error', (e) => killAll(new Error('CDP ws 錯誤:' + e.message)));
    ws.on('close', () => killAll(new Error('CDP ws 已關閉(Chrome 可能已退出,看 C:\\tmp\\chrome_err.log)')));
    await new Promise((res, rej) => {
        ws.on('open', res);
        ws.on('error', rej);
    });

    const send = (method, params = {}) =>
        new Promise((resolve, reject) => {
            if (dead) return reject(dead);
            const mid = ++id;
            const timer = setTimeout(() => {
                pending.delete(mid);
                reject(new Error('CDP ' + method + ' 逾時 ' + SEND_TIMEOUT + 'ms(可用 CDP_SEND_TIMEOUT 調整)'));
            }, SEND_TIMEOUT);
            pending.set(mid, {
                resolve: (m) => {
                    clearTimeout(timer);
                    resolve(m);
                },
                reject: (e) => {
                    clearTimeout(timer);
                    reject(e);
                },
            });
            ws.send(JSON.stringify({ id: mid, method, params }));
        });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    // UA 一律在此設,不走命令列 --user-agent(含空白會被 Start-Process 拆成多個位置參數 → Chrome 149+ 的 multiple targets 秒退)。
    await send('Network.setUserAgentOverride', { userAgent: await browserUA() });
    if (viewport) await send('Emulation.setDeviceMetricsOverride', Object.assign({ deviceScaleFactor: 2, mobile: false }, viewport));

    const ev = async (expression) => {
        const r = await send('Runtime.evaluate', { expression, returnByValue: true });
        return r.result && r.result.result ? r.result.result.value : null;
    };
    return { send, ev, close: () => ws.close(), raw: () => page };
}

// 等渲染:輪詢 iframe 文字長度,連續三次相同就算穩定,取代固定 sleep(原本首頁 16s／換頁 8s 死等)。
// 逾時就回 timedOut:true 讓呼叫端照樣擷取——寧可擷到半成品也要留下佐證。
async function waitRendered(ev, { min = 4000, max = 16000, step = 1500 } = {}) {
    await sleep(min);
    let waited = min;
    let last = -1;
    let stable = 0;
    while (waited < max) {
        const len = await ev(IFRAME_LEN);
        if (len > 0 && len === last) {
            if (++stable >= 2) return { waited, len };
        } else {
            stable = 0;
        }
        last = len;
        await sleep(step);
        waited += step;
    }
    return { waited, len: last, timedOut: true };
}

// 換頁後等頁名真的變掉(openNextPage 是非同步導頁),再交給 waitRendered 等內容穩定。
// 比死等固定秒數準:頁名一變就往下走,沒變就等到上限而不是盲目相信換頁成功。
async function waitPageChanged(ev, prevName, { max = 12000, step = 1000 } = {}) {
    let waited = 0;
    while (waited < max) {
        await sleep(step);
        waited += step;
        const n = await ev(PAGE_NAME);
        if (n && n !== prevName) return { waited, name: n };
    }
    return { waited, name: prevName, timedOut: true };
}

module.exports = {
    BASE,
    PORT,
    sleep,
    getJSON,
    putJSON,
    outDir,
    browserUA,
    connect,
    waitRendered,
    waitPageChanged,
    looksLikeLogin,
    IFRAME_TEXT,
    IFRAME_LEN,
    PAGE_NAME,
};
