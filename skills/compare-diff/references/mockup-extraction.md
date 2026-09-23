# Mockup 擷取（Axure 原型）

只有跑到含 Mockup 的階段（二／三／四）才需要讀本檔。

Axure 原型需登入，且內容是 JS 注入到 iframe `#mainFrame`（連 `#mainFrame.src` 都是 about:blank），**WebFetch / 爬蟲偽裝 / curl 全拿不到**（只有空殼）。必須用會跑 JS 的瀏覽器 + 帶登入 session。以下為實測可靠作法。

## 1. 前置（一次性）

- **登入 session 來源 = `C:\tmp\chrome_prof`**（已登入 Axure 的 Chrome profile，**請保留勿刪**；過期就在該 profile 重新登入一次）。要換位置用 `CHROME_PROFILE`。
- headless **Chrome**（本機 Edge headless 不可用，已驗證）。**路徑不寫死**——`launch-chrome.ps1` 由本機 App Paths 註冊資訊（HKLM／HKCU）再退到 PATH 解析，裝在哪都找得到；真的要指定用 `CHROME_EXE`。
- CDP 用**某個專案既有的 `ws`**：執行 node 時帶 `NODE_PATH=<該專案>/node_modules`（例 `C:/work/<專案>/node_modules`）。這包 plugin 不自帶依賴，**不要動專案的 `package.json`。**
- 不需要關使用者的主 Chrome：headless Chrome 用獨立 `--user-data-dir` 可與主 Chrome 並存（已驗證）。

### 腳本位置

腳本隨 plugin 安裝，路徑一律用 Claude Code 注入的 `CLAUDE_PLUGIN_ROOT` 組出來：

- Bash：`"$CLAUDE_PLUGIN_ROOT/skills/compare-diff/scripts/<腳本>"`
- PowerShell：`"$env:CLAUDE_PLUGIN_ROOT\skills\compare-diff\scripts\<腳本>"`

### 環境變數（腳本唯一的可調處，其餘皆自動偵測）

| 變數 | 用途 | 預設 |
|------|------|------|
| `CDP_OUT` | 擷取輸出目錄 | **必填，無預設**（見 §3） |
| `NODE_PATH` | 借某專案的 `ws` | **必填，無預設**；例 `C:/work/<專案>/node_modules` |
| `CDP_PORT` | CDP 除錯埠（`.ps1` 與三支 `.cjs` 共用） | `9222` |
| `CHROME_PROFILE` | 已登入 Axure 的 profile | `C:\tmp\chrome_prof` |
| `CHROME_EXE` | Chrome 執行檔 | 由本機註冊資訊偵測 |
| `CDP_SEND_TIMEOUT` | 單一 CDP 指令逾時（毫秒） | `30000` |

## 2. 啟動 → 探測 → 收工

```powershell
powershell -File "$env:CLAUDE_PLUGIN_ROOT\skills\compare-diff\scripts\launch-chrome.ps1"   # 印出 "CDP ready (port ...)" 才算成功
powershell -File "$env:CLAUDE_PLUGIN_ROOT\skills\compare-diff\scripts\stop-chrome.ps1"     # 收工，只砍該 profile 的程序
```

`launch-chrome.ps1` 已封裝：解析 Chrome 路徑、清 `Singleton*` 鎖檔、`--remote-allow-origins=*`（Chrome 111+ 少了它 ws 握手 403）、等待埠就緒、chrome stdout/stderr 導到本機 `%TEMP%\chrome_{out,err}.log`。

**擷取前先探測 session，不要等擷完 N 頁才從空白 PNG 發現過期**（一頁的成本換掉整批白跑）：

```bash
NODE_PATH="C:/work/<專案>/node_modules" \
  node "$CLAUDE_PLUGIN_ROOT/skills/compare-diff/scripts/cdp_eval.cjs" "<模組起始url>"
```

省略運算式時 `cdp_eval.cjs` 印 `PAGE=<頁名>`、iframe 文字前 400 字，最後給 `SESSION=OK` 或 `SESSION=FAIL`（FAIL 時 **exit 2**）。FAIL → 到 profile 重新登入 Axure 再跑。

> **改 `.ps1` 時務必存成 UTF-8 with BOM。** Windows PowerShell 5.1 對沒有 BOM 的檔案以 ANSI(CP950) 解碼，檔內中文會亂掉並吃掉字串結尾引號，直接 parse error（`The string is missing the terminator: "`）。存檔後用這行驗證：
> `[System.Management.Automation.Language.Parser]::ParseFile($p,[ref]$null,[ref]$errs)`

> **⚠️ Chrome 149+ 踩雷（2026/07 實測）**：新版 headless 對「多個 target」直接報 `Multiple targets are not supported in headless mode` 並秒退。兩個地雷都會觸發它，`launch-chrome.ps1` 已避開，**改該腳本時別退回去**：
> 1. **命令列末尾不要放 `about:blank` 位置參數** — CDP 腳本會自行建立 page target。
> 2. **不要用命令列 `--user-agent="..."`** — 透過 `Start-Process -ArgumentList` 傳遞時，含空白的 UA 會被拆成多個位置參數，被 Chrome 當成多個 URL。**UA 一律在 CDP 端設**（`cdp_lib.cjs` 的 `connect()` 內 `Network.setUserAgentOverride`），版號取實際跑的 Chrome，只把 `HeadlessChrome` 換成 `Chrome`。

## 3. 擷取腳本

`scripts/` 下四支，**副檔名一律 `.cjs`**：

| 腳本 | 用途 | 用法 |
|------|------|------|
| `cdp_lib.cjs` | 共用的連線／等渲染／頁名擷取，不直接執行 | — |
| `cdp_shot.cjs` | 已知 URL 清單逐頁擷取 | `node cdp_shot.cjs <pages.json>` |
| `cdp_seq.cjs` | 用 `openNextPage()` 逐頁巡覽（免 id） | `node cdp_seq.cjs "<起始url>" <前進頁數>` |
| `cdp_eval.cjs` | 單次 eval 偵錯／session 探測 | `node cdp_eval.cjs "<url>" ["<jsExpr>"]` |

> **副檔名必須是 `.cjs`，不可改回 `.js`。** 專案 `package.json` 有 `"type": "module"`，`.js` 會被當 ES module，腳本的 `require()` 立刻 `ReferenceError: require is not defined in ES module scope`。（這幾支原本放在 `C:\tmp`，那裡沒有 package.json 所以 `.js` 可以跑；搬進 repo 後就不行了。）

> **連線行為集中在 `cdp_lib.cjs`，要改就改那裡。** 這三支原本各寫一份 ws 連線，已經漂移過（`cdp_eval` 漏了 UA 覆寫、`cdp_seq` 取頁名沒走 iframe 而常落回 `document.title`，檔名就是用它組的）。

### 輸出目錄：`CDP_OUT` 必填且每模組一個

腳本**不再有共用的預設輸出目錄**——沒設 `CDP_OUT` 直接報錯退出。共用一個目錄時不同模組的同名頁（以及 `cdp_seq` 的 `seq_<i>_<頁名>`）會**靜默覆蓋**，報告佐證會對到別的模組。

```bash
CDP_OUT="C:/tmp/re/<模組>/" NODE_PATH="C:/work/<專案>/node_modules" \
  node "$CLAUDE_PLUGIN_ROOT/skills/compare-diff/scripts/cdp_shot.cjs" C:/tmp/pages.json
```

每頁產出 `<name>.png` + `<name>.txt`（開頭 `PAGE=<$axure.page.shortName>`）。**判讀一律讀 `.txt` 全文**；stdout 只印前 500／2500 字預覽，長畫面會被截掉。抽到的文字疑似登入頁或短到不合理時，該頁會多印一行 `⚠ 疑似登入頁／空畫面`。

> **一律用 `$CLAUDE_PLUGIN_ROOT` 組出的絕對路徑呼叫腳本。** Bash tool 的工作目錄會跨呼叫保留——若前一個指令 `cd` 進了 `scripts/`，下一次的相對路徑就會變成 `scripts/scripts/cdp_shot.cjs` 而 `MODULE_NOT_FOUND`。
> 擷取約 5～10 秒／頁，**用背景執行丟出去**，同時去讀 SPEC 與程式碼，不要乾等。

### 等渲染是輪詢，不是死等

`cdp_lib.cjs` 的 `waitRendered()` 輪詢 iframe `innerText` 長度，**連續三次相同就往下走**（首頁 5～20s、換頁 1.5～12s 上限）；逾時會照樣擷取並在該行標 `(逾時)`，寧可留半成品佐證也不要靜默跳過。`cdp_seq.cjs` 換頁後另外用 `waitPageChanged()` 等頁名真的變掉，沒變就印 `⚠ openNextPage 無效或已到最後一頁`。**不要在 shell 另外 sleep，也不要改回固定秒數死等。**

`pages.json` 格式見 `scripts/pages.example.json`（`[["名稱","url"], ...]`）。PowerShell 傳 JSON 字串給 node 時外層引號會被吃掉，**寫成 `.json` 檔讓腳本讀檔**較穩（腳本以 `.json` 結尾自動判斷是路徑，並會去掉 Windows 慣性帶上的 BOM）。

> **iframe innerText 是關鍵** — 直接拿到精準欄位/按鈕文字，不必裁切截圖、不必 OCR。截圖留存佐證即可。

## 4. 子頁的取得（正解：`openNextPage()` 全自動巡覽）

- 同一個 prototype `id` + `p=<頁名>` 後綴**不會深連到子頁**；側欄 `span.sitemapPageName` 的 `.click()` 也**不會導頁**（兩者皆已驗證無效）。
- ✅ **正解：用 player 全域函式 `openNextPage()` / `openPreviousPage()` 逐頁前進**（即 `cdp_seq.cjs`）。當前頁名用 `$axure.page.shortName` 取得。
- 流程：導到模組主頁（`p=` 起始頁有效）→ 依側欄順序 `openNextPage()` 走訪後續同模組子頁，直到頁名跳到下一模組為止。
- 先抽側欄頁名清單可預知子頁數與名稱：

  ```js
  [].slice.call(document.querySelectorAll('span.sitemapPageName')).map(e=>e.textContent.trim())
  ```

  （例 SM060：主 → 編輯 → 編輯_隸屬群組(角色) → 新增 → 檢視；**無獨立「密碼變更」頁**，文件 §3.2 的密碼變更連結指向不存在的頁。）

## 5. 截圖歸檔

- 腳本輸出是**暫存**（`CDP_OUT` 指的地方）。
- 要留作報告佐證的，複製到 `docs/axure_capture/<模組>/`（既有 DM020 / SM130 / SM160 可參考）。歸檔後的截圖不進版控（`docs/` 被 `.gitignore` 排除）。
- 報告「比對來源」表要填的**截圖時間 = 截圖檔 mtime**：

  ```powershell
  (Get-Item 'docs\axure_capture\SM160\xxx.png').LastWriteTime.ToString('yyyy/MM/dd HH:mm:ss')
  ```

## 6. 陷阱

- 空白／極小 PNG，或 iframe 文字是登入頁字樣 = **session 失效** → 到 profile 重新登入（先用 §2 的探測確認）。
- **不要全域砍 chrome**（會關掉使用者視窗）；只用 `stop-chrome.ps1`（依 `CHROME_PROFILE` 的目錄名比對 CommandLine）。
- **`stop-chrome.ps1` 會噴 `Stop-Process : Cannot find a process with the process identifier ...` 紅字，這是預期的**：砍掉父程序時子程序一起消失，後續 PID 已不存在，而 `Stop-Process` 的非終止錯誤不會進 `catch`。只要最後印出「已結束 N 個 ... 程序」且 N > 0 就是成功，**不要去修它**。
- 連不上會直接說「連不上 CDP <位址> — 先跑 launch-chrome.ps1」；Chrome 中途掛掉會在幾秒內以 `CDP ws 已關閉` 收場（每個 CDP 指令有 `CDP_SEND_TIMEOUT` 上限）。**不會再無聲卡住**——若真的卡住就是新問題，別直接重跑。
- `C:\tmp\_authprofile` 是更早期 cookie 複本作法的遺留物，**本流程不會產生也不使用它**，可自行刪除。
- 真的卡住才退而求其次：請使用者在自己瀏覽器截圖貼上。
