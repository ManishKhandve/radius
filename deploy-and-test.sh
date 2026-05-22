#!/bin/bash
# Deploy performance fixes and test

echo "🚀 Deploying Performance Fixes to Oracle Cloud"
echo "=============================================="
echo ""

# Pull latest code
echo "1️⃣ Pulling latest code from GitHub..."
git pull origin main
echo ""

# Install dependencies (if any new ones)
echo "2️⃣ Installing dependencies..."
npm install
echo ""

# Restart bot
echo "3️⃣ Restarting bot..."
pm2 restart whatsapp-bot
echo ""

# Wait for bot to stabilize
echo "4️⃣ Waiting 10 seconds for bot to stabilize..."
sleep 10
echo ""

# Show logs
echo "5️⃣ Checking bot status and logs..."
pm2 status
echo ""
echo "Recent logs:"
pm2 logs whatsapp-bot --lines 20 --nostream
echo ""

echo "=============================================="
echo "✅ Deployment complete!"
echo ""
echo "📊 Now test by sending a WhatsApp message"
echo "   Watch for [PERF] timing logs"
echo ""
echo "Expected timings:"
echo "  - handleMessage: <100ms"
echo "  - Total processing: <500ms"
echo "  - If >1000ms: Check logs for bottleneck"
echo ""
echo "To watch live logs:"
echo "  pm2 logs whatsapp-bot"
