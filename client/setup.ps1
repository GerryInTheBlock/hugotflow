# HugotFlow app setup (Windows PowerShell). Run once inside the client folder:
#   cd client
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1
$ErrorActionPreference = "Stop"

Write-Host "1/3 Installing packages..." -ForegroundColor Cyan
npm install

Write-Host "2/3 Aligning every package to the installed Expo SDK..." -ForegroundColor Cyan
npx expo install --fix

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "3/3 Created .env - open it and paste your Supabase Project URL and anon key." -ForegroundColor Yellow
} else {
  Write-Host "3/3 .env already exists." -ForegroundColor Cyan
}

Write-Host "Done. Start the app with: npx expo start" -ForegroundColor Green
Write-Host "  press w for the web console, or scan the QR code with Expo Go on your phone." -ForegroundColor Green
