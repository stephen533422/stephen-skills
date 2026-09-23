// 一次性 CDP eval：導頁→等渲染→印出指定 JS 結果。也當「開跑前的 session 探測」用。
// 用法：node cdp_eval.cjs "<url>" "<jsExpr>"     指定 JS 運算式
//       node cdp_eval.cjs "<url>"                省略運算式 → 印頁名＋iframe 文字前 400 字＋session 判定
// 副檔名必須是 .cjs（專案 package.json 是 "type": "module"），呼叫時一律用絕對路徑。
// 省略運算式的模式在 session 失效時 exit 2 —— 別等擷完 N 頁才從空白 PNG 發現。
const cdp = require('./cdp_lib.cjs');

const TARGET = process.argv[2];
const EXPR = process.argv[3];

(async () => {
    if (!TARGET) throw new Error('缺 url：node cdp_eval.cjs "<url>" ["<jsExpr>"]');
    // UA／viewport 與擷取腳本一致，否則探測結果不代表實際擷取時的畫面。
    const { send, ev, close } = await cdp.connect({ viewport: { width: 1000, height: 1700 } });
    await send('Page.navigate', { url: TARGET });
    const w = await cdp.waitRendered(ev, { min: 5000, max: 20000 });

    if (EXPR) {
        console.log(JSON.stringify(await ev(EXPR), null, 2));
        close();
        return;
    }

    const name = await ev(cdp.PAGE_NAME);
    const text = (await ev(cdp.IFRAME_TEXT)) || '(no text)';
    const bad = cdp.looksLikeLogin(text);
    console.log('PAGE=' + name + '，txt ' + String(text).length + ' chars，等 ' + w.waited + 'ms' + (w.timedOut ? '(逾時)' : ''));
    console.log(String(text).replace(/\n{2,}/g, '\n').slice(0, 400));
    console.log(bad ? '\nSESSION=FAIL 疑似登入頁／空畫面 → 到 C:\\tmp\\chrome_prof 重新登入 Axure 後再跑擷取' : '\nSESSION=OK 可以開始擷取');
    close();
    if (bad) process.exit(2);
})().catch((e) => {
    console.error('ERR', e.message);
    process.exit(1);
});
