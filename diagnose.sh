#!/bin/bash
# Quick diagnostic script for bot slowness
# Run on Oracle Cloud: bash diagnose.sh

echo "🔍 Bot Performance Diagnosis"
echo "================================"
echo ""

echo "1️⃣ Checking if bot is running..."
pm2 status | grep whatsapp-bot
echo ""

echo "2️⃣ Checking recent errors..."
pm2 logs whatsapp-bot --lines 50 --nostream | grep -i "error\|timeout\|disconnect" | tail -10
echo ""

echo "3️⃣ Checking system resources..."
echo "Memory:"
free -h | grep Mem
echo ""
echo "CPU:"
top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print "CPU Usage: " 100 - $1"%"}'
echo ""

echo "4️⃣ Checking network latency..."
echo "Ping to Google:"
ping -c 3 google.com | tail -1
echo ""

echo "5️⃣ Checking WhatsApp connection..."
pm2 logs whatsapp-bot --lines 100 --nostream | grep -i "connected\|qr" | tail -5
echo ""

echo "6️⃣ Checking for dual deployment..."
echo "If you see multiple instances or 'online' status on Render, that's the problem!"
echo ""

echo "================================"
echo "✅ Diagnosis complete!"
echo ""
echo "Common fixes:"
echo "1. Stop Render deployment if still running"
echo "2. pm2 restart whatsapp-bot"
echo "3. Check logs: pm2 logs whatsapp-bot"
