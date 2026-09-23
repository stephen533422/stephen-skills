// 用 player 的 openNextPage() 逐頁前進擷取（免逐頁 id）。
// 用法：node cdp_seq.cjs "<起始url>" <要前進幾頁>
// 副檔名必須是 .cjs（專案 package.json 是 "type": "module"），呼叫時一律用絕對路徑。
// 輸出目錄：CDP_OUT 必填，且每模組一個子目錄（檔名是 seq_<i>_<頁名>，共用目錄跨模組必撞）。
const fs = require('fs');
const cdp = require('./cdp_lib.cjs');

let OUT;
try {
    OUT = cdp.outDir();
} catch (e) {
    console.error(e.message);
    process.exit(1);
}
const START = process.argv[2];
const STEPS = parseInt(process.argv[3] || '4', 10);

(async () => {
    if (!START) throw new Error('缺起始 url：node cdp_seq.cjs "<起始url>" <前進頁數>');
    const { send, ev, close } = await cdp.connect({ viewport: { width: 1000, height: 1900 } });
    await send('Page.navigate', { url: START });
    let w = await cdp.waitRendered(ev, { min: 5000, max: 20000 });
    let nm = await ev(cdp.PAGE_NAME);

    for (let i = 0; i <= STEPS; i++) {
        if (i > 0) {
            await ev('try{openNextPage();}catch(e){}');
            const ch = await cdp.waitPageChanged(ev, nm);
            if (ch.timedOut) console.log('⚠ 換頁後頁名仍是「' + nm + '」→ openNextPage 無效或已到最後一頁，以下擷取可能是重複頁');
            nm = ch.name;
            w = await cdp.waitRendered(ev, { min: 1500, max: 12000 });
        }
        const safe = String(nm || 'page' + i).replace(/[\\/:*?"<>|]/g, '_');
        const base = OUT + 'seq_' + i + '_' + safe;
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        let sz = 0;
        if (shot.result && shot.result.data) {
            fs.writeFileSync(base + '.png', Buffer.from(shot.result.data, 'base64'));
            sz = fs.statSync(base + '.png').size;
        }
        const txt = (await ev(cdp.IFRAME_TEXT)) || '(no text)';
        // 全文存檔，stdout 只印前段預覽——長頁面別靠 stdout 判讀
        fs.writeFileSync(base + '.txt', 'PAGE=' + nm + '\n\n' + String(txt));
        console.log(
            '=== [' + i + '] ' + nm + ' -> png ' + sz + ' bytes, txt ' + String(txt).length + ' chars, 等 ' + w.waited + 'ms' + (w.timedOut ? '(逾時)' : '') + ' ===',
        );
        if (cdp.looksLikeLogin(txt)) console.log('⚠ 疑似登入頁／空畫面 → session 可能失效，到 C:\\tmp\\chrome_prof 重新登入後再跑');
        console.log(String(txt).replace(/\n{2,}/g, '\n').slice(0, 2500));
        console.log('');
    }
    close();
})().catch((e) => {
    console.error('ERR', e.message);
    process.exit(1);
});
