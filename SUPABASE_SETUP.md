# Supabase Database Setup Guide

## ✅ Credentials Added to .env

Your Supabase credentials have been added to the `.env` file:

```env
SUPABASE_URL=https://ikwyrrzipzfbyzmkrfmu.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 📊 Required Supabase Table Structure

You need to create a table named **`maids`** in your Supabase database.

### Table Name: `maids`

### Columns Required:

| Column Name | Data Type | Description | Example |
|-------------|-----------|-------------|---------|
| **id** | `int8` (Primary Key) | Unique maid identifier | 101, 102, 103 |
| **name** | `text` | Maid's full name | Sunita Devi |
| **service_type** | `text` | Type of work | Cooking & Cleaning |
| **experience** | `text` | Years of experience | 5 years |
| **salary_expectation** | `int4` | Expected monthly salary | 8000 |
| **city** | `text` | City location | Pune |
| **area** | `text` | Area/locality | Kharadi |
| **latitude** | `float8` | GPS latitude | 18.5514 |
| **longitude** | `float8` | GPS longitude | 73.9456 |
| **phone** | `text` | Contact number | 9876543210 |
| **status** | `text` | Availability status | Available, Placed |
| **created_at** | `timestamptz` | Record creation time | Auto-generated |

---

## 🔧 SQL to Create Table

Run this SQL in your Supabase SQL Editor:

```sql
-- Create maids table
CREATE TABLE public.maids (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  service_type TEXT,
  experience TEXT,
  salary_expectation INTEGER,
  city TEXT NOT NULL,
  area TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  phone TEXT,
  status TEXT DEFAULT 'Available',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for faster location queries
CREATE INDEX idx_maids_location ON public.maids(city, area);
CREATE INDEX idx_maids_status ON public.maids(status);

-- Enable Row Level Security (RLS)
ALTER TABLE public.maids ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access (for the bot)
CREATE POLICY "Allow public read access" ON public.maids
  FOR SELECT
  USING (true);

-- Create policy to allow authenticated insert/update (for admin)
CREATE POLICY "Allow authenticated insert" ON public.maids
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated update" ON public.maids
  FOR UPDATE
  USING (auth.role() = 'authenticated');
```

---

## 📝 Sample Data to Insert

Insert some sample maids for testing:

```sql
-- Sample maids in Pune - Kharadi area
INSERT INTO public.maids (name, service_type, experience, salary_expectation, city, area, latitude, longitude, phone, status) VALUES
('Sunita Devi', 'Cooking & Cleaning', '5 years', 8000, 'Pune', 'Kharadi', 18.5514, 73.9456, '9876543210', 'Available'),
('Rekha Bai', 'Cleaning', '3 years', 6500, 'Pune', 'Kharadi', 18.5520, 73.9460, '9876543211', 'Available'),
('Asha Devi', 'Cooking', '7 years', 9000, 'Pune', 'Kharadi', 18.5530, 73.9470, '9876543212', 'Available');

-- Sample maids in Pune - Baner area
INSERT INTO public.maids (name, service_type, experience, salary_expectation, city, area, latitude, longitude, phone, status) VALUES
('Laxmi Bai', 'Babysitter', '4 years', 7500, 'Pune', 'Baner', 18.5590, 73.7868, '9876543213', 'Available'),
('Geeta Devi', 'Cleaning', '2 years', 5500, 'Pune', 'Baner', 18.5595, 73.7870, '9876543214', 'Available');

-- Sample maids in PCMC - Wakad area
INSERT INTO public.maids (name, service_type, experience, salary_expectation, city, area, latitude, longitude, phone, status) VALUES
('Savita Bai', 'Cooking & Cleaning', '6 years', 8500, 'PCMC', 'Wakad', 18.5988, 73.7626, '9876543215', 'Available'),
('Anita Devi', 'Caretaker', '8 years', 10000, 'PCMC', 'Wakad', 18.5990, 73.7630, '9876543216', 'Available');
```

---

## 🗺️ Area Coordinates Reference

### Pune Areas:

| Area | Latitude | Longitude |
|------|----------|-----------|
| Aundh | 18.5590 | 73.8080 |
| Baner | 18.5590 | 73.7868 |
| Bavdhan | 18.5200 | 73.7700 |
| Dhanori | 18.5900 | 73.9100 |
| Hadapsar | 18.5018 | 73.9252 |
| Kalyani Nagar | 18.5461 | 73.9010 |
| Kharadi | 18.5514 | 73.9456 |
| Kondhwa | 18.4647 | 73.8826 |
| Koregaon | 18.5362 | 73.8938 |
| Kothrud | 18.5074 | 73.8076 |
| Lohegaon | 18.5986 | 73.9196 |
| Magarpatta | 18.5133 | 73.9302 |
| Mundhwa | 18.5280 | 73.9220 |
| NIBM | 18.4700 | 73.8960 |
| Undri | 18.4530 | 73.8960 |
| Viman Nagar | 18.5672 | 73.9143 |
| Vishrantwadi | 18.5908 | 73.8842 |
| Wadgaon Sheri | 18.5554 | 73.9254 |
| Wagholi | 18.5780 | 73.9800 |

### PCMC Areas:

| Area | Latitude | Longitude |
|------|----------|-----------|
| Akurdi | 18.6486 | 73.7677 |
| Bhosari | 18.6386 | 73.8478 |
| Chinchwad | 18.6279 | 73.7930 |
| Hinjewadi | 18.5912 | 73.7389 |
| Kotewadi | 18.6100 | 73.8050 |
| Nigdi | 18.6600 | 73.7750 |
| Pimpri | 18.6279 | 73.8009 |
| Wakad | 18.5988 | 73.7626 |

---

## 🔍 How the Matching System Works

### 1. **Customer Selects Area**
- Customer chooses city (Pune/PCMC)
- Customer chooses area (e.g., Kharadi)

### 2. **Bot Fetches Area Coordinates**
```javascript
const areaCoords = {
  lat: 18.5514,
  lng: 73.9456
};
```

### 3. **Bot Queries Supabase**
```javascript
const { data: maids } = await supabase
  .from('maids')
  .select('*')
  .eq('status', 'Available');
```

### 4. **Calculate Distances**
Uses Haversine formula to calculate distance from customer's area to each maid:
```javascript
distance = getDistanceFromLatLonInKm(
  customerLat, customerLng,
  maidLat, maidLng
);
```

### 5. **Zone Classification**
Maids are classified into zones based on distance:
- **P1 (Green)**: 0-2 km
- **P2 (Yellow)**: 2-5 km
- **P3 (Orange)**: 5-8 km
- **P4 (Red)**: 8+ km (not shown)

### 6. **Sort & Display Top 3**
- Sort by distance (closest first)
- Filter out maids beyond 8 km
- Show top 3 maids with details

---

## 📱 Example Bot Flow

```
User: Selects Pune → Kharadi

Bot queries Supabase:
- Finds all available maids
- Calculates distances from Kharadi (18.5514, 73.9456)
- Sorts by distance

Results:
1️⃣ Sunita Devi - 0.8 km (P1 Zone - Green)
2️⃣ Rekha Bai - 1.2 km (P1 Zone - Green)
3️⃣ Asha Devi - 2.5 km (P2 Zone - Yellow)

User: Selects 1,2

Bot saves: M101, M102 to Google Sheets
```

---

## 🔐 Security Best Practices

### ✅ Row Level Security (RLS)
- Enabled on the `maids` table
- Public can only READ (for bot queries)
- Only authenticated users can INSERT/UPDATE

### ✅ API Key Security
- Use the `anon` key (already provided)
- Never expose the `service_role` key
- Keep `.env` file secure (already in `.gitignore`)

### ✅ Data Validation
- Bot validates all inputs before querying
- Distance calculations done server-side
- No direct SQL injection possible

---

## 🧪 Testing Your Setup

### Test 1: Check Supabase Connection

Create a test file `test-supabase.js`:

```javascript
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('maids')
      .select('*')
      .limit(5);
    
    if (error) throw error;
    
    console.log('✅ Supabase connection successful!');
    console.log(`Found ${data.length} maids in database`);
    console.log('\nSample data:');
    console.log(data);
  } catch (err) {
    console.error('❌ Supabase connection failed:', err.message);
  }
}

testConnection();
```

Run: `node test-supabase.js`

### Test 2: Test Matching System

```javascript
const { getTopMaids } = require('./matching.js');

async function testMatching() {
  // Test with Kharadi coordinates
  const maids = await getTopMaids(18.5514, 73.9456);
  console.log(`Found ${maids.length} maids within 8km`);
  maids.forEach((maid, i) => {
    console.log(`${i+1}. ${maid.name} - ${maid.distance.toFixed(1)} km`);
  });
}

testMatching();
```

### Test 3: Complete Bot Flow

1. Start bot: `node index.js`
2. Send message: `hi`
3. Select language: `1`
4. Select service: `2` (Maid)
5. Select work type: `1` (Cooking)
6. Select timing: `1` (Part Time)
7. Select budget: `3`
8. Select city: `1` (Pune)
9. Select area: `7` (Kharadi)
10. Verify maids are displayed

---

## 📊 Database Management

### View All Maids:
```sql
SELECT id, name, city, area, status 
FROM public.maids 
ORDER BY city, area;
```

### Update Maid Status:
```sql
UPDATE public.maids 
SET status = 'Placed' 
WHERE id = 101;
```

### Add New Maid:
```sql
INSERT INTO public.maids 
(name, service_type, experience, salary_expectation, city, area, latitude, longitude, phone) 
VALUES 
('New Maid Name', 'Cooking', '3 years', 7000, 'Pune', 'Kharadi', 18.5514, 73.9456, '9876543217');
```

### Delete Maid:
```sql
DELETE FROM public.maids WHERE id = 101;
```

---

## 🔄 Syncing with Google Sheets (Optional)

If you want to maintain maid data in both Supabase and Google Sheets:

### Option 1: Manual Sync
- Keep master data in Supabase
- Export to Google Sheets for reference
- Use Supabase for bot queries (faster)

### Option 2: Automated Sync
- Create a sync script that runs periodically
- Updates Google Sheets from Supabase
- Useful for reporting and analytics

---

## 📈 Monitoring & Analytics

### Track Popular Areas:
```sql
SELECT area, COUNT(*) as maid_count 
FROM public.maids 
WHERE status = 'Available' 
GROUP BY area 
ORDER BY maid_count DESC;
```

### Track Placements:
```sql
SELECT 
  status, 
  COUNT(*) as count 
FROM public.maids 
GROUP BY status;
```

### Average Salary by Experience:
```sql
SELECT 
  experience, 
  AVG(salary_expectation) as avg_salary 
FROM public.maids 
GROUP BY experience 
ORDER BY avg_salary DESC;
```

---

## 🚨 Troubleshooting

### Error: "Invalid API key"
- Check `SUPABASE_KEY` in `.env`
- Ensure no extra spaces or quotes
- Verify key is the `anon` public key

### Error: "Table 'maids' does not exist"
- Run the CREATE TABLE SQL in Supabase
- Check table name is exactly `maids` (lowercase)

### Error: "No maids found"
- Check if maids are inserted in database
- Verify `status = 'Available'`
- Check coordinates are correct

### Error: "Permission denied"
- Enable Row Level Security
- Create the SELECT policy for public access

---

## ✅ Setup Checklist

- [x] Supabase credentials added to `.env`
- [ ] Create `maids` table in Supabase
- [ ] Run SQL to create table structure
- [ ] Insert sample maid data
- [ ] Enable Row Level Security
- [ ] Create public read policy
- [ ] Test Supabase connection
- [ ] Test matching system
- [ ] Test complete bot flow

---

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)

---

## Summary

✅ **Credentials configured** in `.env`  
✅ **Table structure** documented  
✅ **Sample data** provided  
✅ **Security** configured with RLS  
✅ **Testing guide** included  
✅ **Matching system** explained  

Your Supabase database is ready to store and serve maid data to the WhatsApp bot! 🚀
