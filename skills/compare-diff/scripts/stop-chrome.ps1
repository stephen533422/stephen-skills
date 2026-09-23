# 只結束用擷取 profile（預設 chrome_prof）當 --user-data-dir 啟動的 headless chrome。
# 絕對不要用 Stop-Process -Name chrome，那會關掉使用者自己開的視窗。
# 本檔必須存成 UTF-8 with BOM（見 launch-chrome.ps1 同一則說明）。
# 砍父程序時子程序一起消失，後續 PID 已不存在會噴紅字，這是預期的 —— 只要最後 N > 0 就是成功。
if ($env:CHROME_PROFILE) { $profileDir = $env:CHROME_PROFILE } else { $profileDir = 'C:\tmp\chrome_prof' }
$leaf = Split-Path $profileDir -Leaf
$killed = 0
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
    Where-Object { $_.CommandLine -like "*$leaf*" } |
    ForEach-Object {
        try { Stop-Process -Id $_.ProcessId -Force; $killed++ } catch {}
    }
Write-Output "已結束 $killed 個 $leaf 程序"
