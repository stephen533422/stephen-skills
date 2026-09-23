// CDP 擷取 Axure：連除錯 Chrome（埠 CDP_PORT，預設 9222），導頁→等渲染→截圖＋抽 iframe #mainFrame innerText。
// 用法：node cdp_shot.cjs '<JSON: [["name","url"],...]>'   或   node cdp_shot.cjs <pages.json 路徑>
// 副檔名必須是 .cjs（專案 package.json 是 "type": "module"），呼叫時一律用絕對路徑。
// 依賴：ws（以 NODE_PATH 指向專案 node_modules）
// 輸出目錄：CDP_OUT 必填，且每模組一個子目錄（共用目錄會靜默覆蓋同名頁，佐證會對到別的模組）。
const fs = require('fs');
const cdp = require('./cdp_lib.cjs');

let OUT;
try {
    OUT = cdp.outDir();
} catch (e) {
    console.error(e.message);
    process.exit(1);
}
const _arg = process.argv[2] || '[]';
// 去 BOM：Windows 上 Out-File -Encoding utf8／記事本存的 pages.json 都帶 BOM，JSON.parse 會噴看不出真因的錯。
const _raw = _arg.endsWith('.json') ? fs.readFileSync(_arg, 'utf8').replace(/^\uFEFF/, '') : _arg;
let PAGES;
try {
    PAGES = JSON.parse(_raw);
} catch (e) {
    console.error('pages 解析失敗（格式應為 [["名稱","url"],...]）：' + e.message);
    process.exit(1);
}

async function main() {
    if (!PAGES.length) throw new Error('沒有頁面可擷取——第一個參數要給 pages.json 路徑或 [["名稱","url"],...]');
    const { send, ev, close } = await cdp.connect({ viewport: { width: 1000, height: 1700 } });
    let first = true;
    for (const [name, url] of PAGES) {
        await send('Page.navigate', { url });
        // 首頁多等一點：auth 握手＋Axure JS 初始化都在這時候。
        const w = await cdp.waitRendered(ev, first ? { min: 5000, max: 20000 } : { min: 2500, max: 12000 });
        first = false;
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        let sz = 0;
        if (shot.result && shot.result.data) {
            fs.writeFileSync(OUT + name + '.png', Buffer.from(shot.result.data, 'base64'));
            sz = fs.statSync(OUT + name + '.png').size;
        }
        const t = (await ev(cdp.IFRAME_TEXT)) || '(no text)';
        const pnv = (await ev(cdp.PAGE_NAME)) || '(no name)';
        // 全文存檔，stdout 只印前段預覽——長頁面別靠 stdout 判讀
        fs.writeFileSync(OUT + name + '.txt', 'PAGE=' + pnv + '\n\n' + String(t));
        console.log(
            '=== ' + name + ' [' + pnv + '] -> png ' + sz + ' bytes, txt ' + String(t).length + ' chars, 等 ' + w.waited + 'ms' + (w.timedOut ? '(逾時)' : '') + ' ===',
        );
        if (cdp.looksLikeLogin(t)) console.log('⚠ 疑似登入頁／空畫面 → session 可能失效，到 C:\\tmp\\chrome_prof 重新登入後再跑');
        console.log(String(t).replace(/\n{2,}/g, '\n').slice(0, 500));
        console.log('');
    }
    close();
}
main().catch((e) => {
    console.error('ERROR', e.message);
    process.exit(1);
});
