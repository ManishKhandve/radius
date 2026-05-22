# 🐌 Bot Slowness Troubleshooting Guide

## Why 10 Seconds Delay?

### 🔍 **Common Causes:**

## 1. ⚠️ DUAL DEPLOYMENT (Most Likely!)

**Symptom:** 6-10 second delays
**Cause:** Both Render and Oracle Cloud running simultaneously

**Check:**
```bash
# Are you still running on Render?
# Go to: https://dashboard.render.com
# Check if service is still active
```

**Fix:**
```bash
# Delete Render service immediately!
1. Render Dashboard → Your Service
2. Settings → Danger Zone → Delete Service
3. Wait 2-3 minutes
4. Restart Oracle Cloud bot
```

---

## 2. 🔄 WhatsApp Connection Issues

**Symptom:** Inconsistent delays, reconnection messages
**Cause:** Bot keeps disconnecting/reconnecting

**Check on Oracle Cloud:**
```bash
ssh ubuntu@your-oracle-ip
pm2 logs whatsapp-bot --lines 100 | grep -i "connection\|disconnect\|reconnect"
```

**Look for:**
- ❌ "Connection closed"
- ❌ "Reconnecting..."
- ❌ "QR code required"

**Fix:**
```bash
# Restart the bot
pm2 restart whatsapp-bot

# Check if it stays connected
pm2 logs whatsapp-bot --lines 50
```

---

## 3. 📊 Google Sheets API Slowness

**Symptom:** Delays when saving customer data
**Cause:** Google Sheets API rate limits or slow responses

**Check:**
Add this to your `flow.js` temporarily:
```javascript
// In finishCleaning or finishMaid functions
console.time('sheets-write');
await sheets.appendCleaningBooking(bookingData);
console.timeEnd('sheets-write');
```

**If >2 seconds:**
- Google Sheets is the bottleneck
- Consider caching or batching writes

**Fix:**
```javascript
// Option 1: Make sheets writes non-blocking
(async () => {
  try {
    await sheets.appendCleaningBooking(bookingData);
  } catch (e) {
    console.error('Sheets error:', e);
  }
})();
// Don't await - respond to user immediately
```

---

## 4. 🗄️ Supabase Query Slowness

**Symptom:** Delays when showing maid matches
**Cause:** Slow database queries

**Check:**
Add timing to `matching.js`:
```javascript
console.time('supabase-query');
const { data: maids } = await supabase.from('maids').select('*');
console.timeEnd('supabase-query');
```

**If >1 second:**
- Add database indexes
- Optimize queries

**Fix:**
```sql
-- Add indexes to Supabase
CREATE INDEX idx_maids_status ON maids(status);
CREATE INDEX idx_maids_location ON maids(latitude, longitude);
```

---

## 5. 💾 Memory/CPU Issues

**Symptom:** Bot gets slower over time
**Cause:** Memory leak or CPU overload

**Check:**
```bash
# On Oracle Cloud
pm2 monit

# Or
htop
```

**Look for:**
- ❌ RAM usage >80%
- ❌ CPU usage >90%
- ❌ Swap usage high

**Fix:**
```bash
# Restart bot
pm2 restart whatsapp-bot

# If problem persists, add memory limit
pm2 delete whatsapp-bot
pm2 start index.js --name whatsapp-bot --max-memory-restart 500M
pm2 save
```

---

## 6. 🌐 Network Latency

**Symptom:** Consistent delays
**Cause:** Slow internet on Oracle Cloud server

**Check:**
```bash
# On Oracle Cloud
ping google.com
# Should be <50ms

# Check WhatsApp servers
ping web.whatsapp.com
```

**If >200ms:**
- Network issue
- Contact Oracle support

---

## 7. 🐛 Code Bottlenecks

**Symptom:** Specific states are slow
**Cause:** Inefficient code

**Check:**
Run the performance test:
```bash
node debug-performance.js
```

**Look for:**
- Any step taking >1000ms
- Identify which state is slow

**Fix:**
- Optimize that specific code
- Remove unnecessary loops
- Cache repeated calculations

---

## 🚀 **Quick Diagnosis Steps**

### Step 1: Check Dual Deployment
```bash
# Most common cause!
# Stop Render deployment if still running
```

### Step 2: Check Bot Connection
```bash
ssh ubuntu@your-oracle-ip
pm2 logs whatsapp-bot --lines 50
```

Look for:
- ✅ "WhatsApp connected" → Good
- ❌ "Reconnecting" → Problem!

### Step 3: Test Response Time
```bash
# Send test message: "Hi"
# Time the response

# Should be: <1 second
# If 10 seconds: Continue diagnosis
```

### Step 4: Check System Resources
```bash
pm2 monit
# RAM should be <500 MB
# CPU should be <20% when idle
```

### Step 5: Check Logs for Errors
```bash
pm2 logs whatsapp-bot --lines 200 | grep -i "error\|timeout\|slow"
```

---

## 🔧 **Immediate Fixes**

### Fix 1: Restart Everything
```bash
# On Oracle Cloud
pm2 restart whatsapp-bot
pm2 logs whatsapp-bot
```

### Fix 2: Clear Sessions
```bash
# The bot stores sessions in memory
# Restart clears them
pm2 restart whatsapp-bot
```

### Fix 3: Check .env File
```bash
# Make sure credentials are correct
cat .env | grep -v "PRIVATE_KEY"
```

### Fix 4: Update Dependencies
```bash
cd ~/chatflow
npm update
pm2 restart whatsapp-bot
```

---

## 📊 **Performance Benchmarks**

### Expected Response Times:
```
Language Selection: <100ms
Main Menu: <100ms
Service Selection: <100ms
Name Input: <100ms
Google Sheets Write: 200-500ms
Supabase Query: 100-300ms
Total User Experience: <1 second
```

### If You're Seeing:
```
❌ 10 seconds: Dual deployment or connection issue
❌ 5 seconds: Google Sheets or Supabase slow
❌ 2-3 seconds: Network latency
✅ <1 second: Normal and good!
```

---

## 🎯 **Most Likely Cause**

Based on your symptoms (10 seconds), it's **99% likely**:

### **Dual Deployment Issue**
- Render still running
- Oracle Cloud also running
- WhatsApp confused between both
- Constant reconnections
- Message queue backup

### **Solution:**
```bash
1. Stop Render deployment NOW
2. Wait 3 minutes
3. Restart Oracle Cloud bot
4. Test again
5. Should be <1 second!
```

---

## 📞 **Need Help?**

Run these commands and share output:

```bash
# 1. Check if bot is running
pm2 status

# 2. Check recent logs
pm2 logs whatsapp-bot --lines 50

# 3. Check system resources
free -h
top -bn1 | head -20

# 4. Test performance
node debug-performance.js
```

---

## ✅ **After Fixing**

Your bot should respond in:
- **First message:** <500ms
- **Subsequent messages:** <200ms
- **With Google Sheets write:** <1 second
- **With Supabase query:** <500ms

If still slow after all fixes, there may be a deeper issue with:
- Oracle Cloud server location
- WhatsApp API issues
- Code optimization needed

Let me know the results! 🚀
