$fonts = @(
    @{ Name = "CascadiaCode"; Url = "https://github.com/microsoft/cascadia-code/releases/download/v2404.23/CascadiaCode-2404.23.zip" },
    @{ Name = "FiraCode"; Url = "https://github.com/tonsky/FiraCode/releases/download/6.2/Fira_Code_v6.2.zip" },
    @{ Name = "JetBrainsMono"; Url = "https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip" },
    @{ Name = "Monaspace"; Url = "https://github.com/githubnext/monaspace/releases/download/v1.000/monaspace-v1.000.zip" },
    @{ Name = "AnonymousPro"; Url = "https://www.fontsquirrel.com/fonts/download/anonymous-pro" }
)

$destBase = "d:\qinyining.cn Project\online-jduge\server-go\static\fonts"
$tempBase = "$env:TEMP\font_downloads"

if (-not (Test-Path $tempBase)) { New-Item -ItemType Directory -Force -Path $tempBase | Out-Null }

foreach ($font in $fonts) {
    Write-Host "Processing $($font.Name)..."
    $zipPath = "$tempBase\$($font.Name).zip"
    $extractPath = "$tempBase\$($font.Name)"
    
    try {
        Invoke-WebRequest -Uri $font.Url -OutFile $zipPath
        Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
        
        $fontDir = "$destBase\$($font.Name)"
        New-Item -ItemType Directory -Force -Path $fontDir | Out-Null
        
        # Try to find woff2, then woff, then ttf
        $files = Get-ChildItem -Path $extractPath -Recurse -Include *.woff2,*.woff,*.ttf
        
        foreach ($file in $files) {
            Copy-Item -Path $file.FullName -Destination $fontDir -Force
        }
        
        Write-Host "Installed $($font.Name)"
    } catch {
        Write-Error "Failed to install $($font.Name): $_"
    }
}

Remove-Item -Path $tempBase -Recurse -Force
