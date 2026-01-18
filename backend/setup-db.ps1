# WalletWarden Database Setup Script
# Run this to set up the Prisma schema in your PostgreSQL database

Write-Host "🔧 Setting up WalletWarden database..." -ForegroundColor Green
Write-Host ""

try {
    Write-Host "📊 Pushing schema to database..." -ForegroundColor Cyan
    & node setup-db.js
} catch {
    Write-Host "❌ Database setup failed: $_" -ForegroundColor Red
    exit 1
}
