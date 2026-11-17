$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot 'backend')
$env:MONGO_URL = 'mongodb://127.0.0.1:27019/?directConnection=true&serverSelectionTimeoutMS=5000'
$env:DB_NAME = 'boss_dental_dev'
$env:CORS_ORIGINS = 'http://127.0.0.1:3001,http://localhost:3001'
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:PYTHONUTF8 = '1'
# Per-process local secret: never written to disk or printed.
$secretBytes = New-Object byte[] 48
$randomSource = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$randomSource.GetBytes($secretBytes)
$randomSource.Dispose()
$env:JWT_SECRET = [Convert]::ToBase64String($secretBytes)
& '.\.venv\Scripts\python.exe' -m uvicorn server:app --host 127.0.0.1 --port 8001
exit $LASTEXITCODE
