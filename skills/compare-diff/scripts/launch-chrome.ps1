# 啟動帶 CDP 除錯埠的 headless Chrome，沿用已登入 Axure 的 profile。
# 路徑不寫死：Chrome 位置由本機註冊資訊解析（App Paths → PATH），log 目錄取本機 TEMP。
# 可用環境變數覆寫：CHROME_EXE / CHROME_PROFILE / CDP_PORT（三支 cdp_*.cjs 也讀同一個 CDP_PORT）。
# 本檔必須存成 UTF-8 with BOM，否則 PowerShell 5.1 以 CP950 解碼會吃掉中文與字串結尾引號 → parse error。
# 兩個 Chrome 149+ 地雷已在此避開，改動前請先看 references/mockup-extraction.md：
#   1) 命令列末尾不放 about:blank 位置參數
#   2) 不用命令列 --user-agent（含空白會被拆成多個位置參數）→ UA 改在 CDP 腳本內設

function Resolve-Chrome {
    if ($env:CHROME_EXE) {
        if (Test-Path $env:CHROME_EXE) { return $env:CHROME_EXE }
        Write-Error "CHROME_EXE 指的檔案不存在：$env:CHROME_EXE"
        return $null
    }
    # 1) 安裝時寫入的 App Paths —— 不管裝在 Program Files、(x86) 還是使用者目錄都取得到
    foreach ($hive in @(
            'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
            'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe')) {
        try {
            $v = (Get-ItemProperty -Path $hive -ErrorAction Stop).'(default)'
            if ($v -and (Test-Path $v)) { return $v }
        } catch {}
    }
    # 2) PATH 上的 chrome
    try {
        $cmd = Get-Command chrome.exe -ErrorAction Stop
        if ($cmd -and $cmd.Source) { return $cmd.Source }
    } catch {}
    return $null
}

if ($env:CHROME_PROFILE) { $profileDir = $env:CHROME_PROFILE } else { $profileDir = 'C:\tmp\chrome_prof' }
if ($env:CDP_PORT) { $port = $env:CDP_PORT } else { $port = '9222' }
if ($env:TEMP) { $logDir = $env:TEMP } else { $logDir = [System.IO.Path]::GetTempPath() }

$chrome = Resolve-Chrome
if (-not $chrome) {
    Write-Error '找不到 Chrome（查過 App Paths 註冊資訊與 PATH）。用 CHROME_EXE 指定完整路徑；Edge headless 不可用，已驗證'
    exit 1
}
if (-not (Test-Path $profileDir)) {
    Write-Error "找不到已登入的 profile：$profileDir（需先在該 profile 手動登入 Axure，或用 CHROME_PROFILE 指定別的）"
    exit 1
}

try { Get-ChildItem -Path $profileDir -Filter 'Singleton*' -Force | Remove-Item -Force } catch {}

$errLog = Join-Path $logDir 'chrome_err.log'
$outLog = Join-Path $logDir 'chrome_out.log'
$chromeArgs = @(
    '--headless=new'
    '--disable-gpu'
    '--no-sandbox'
    '--no-first-run'
    '--no-default-browser-check'
    "--remote-debugging-port=$port"
    '--remote-allow-origins=*'
    "--user-data-dir=$profileDir"
)
Start-Process $chrome -ArgumentList $chromeArgs -RedirectStandardError $errLog -RedirectStandardOutput $outLog

for ($i = 0; $i -lt 15; $i++) {
    try {
        $v = Invoke-RestMethod "http://127.0.0.1:$port/json/version" -TimeoutSec 2
        Write-Output "CDP ready (port $port): $($v.Browser)"
        Write-Output "chrome=$chrome"
        exit 0
    } catch { Start-Sleep -Seconds 1 }
}
Write-Error "CDP 埠 $port 未就緒，看 $errLog（常見原因：Multiple targets are not supported → 檢查檔頭兩個地雷；或該埠已被前一次的 chrome 佔住 → 先跑 stop-chrome.ps1）"
exit 1
