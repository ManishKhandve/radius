// ============================================================
// sheets.js — Google Sheets API v4 read/write helpers
// ============================================================
// Uses a service account. Credentials JSON path comes from
// env var GOOGLE_CREDENTIALS_PATH, spreadsheet ID from SPREADSHEET_ID.
// ============================================================

const { google } = require("googleapis");
const path = require("path");

// ─── Sheet tab names (must match your Google Sheet) ──────────
// MAID CUSTOMERS has a space → must be single-quoted in A1 notation,
// otherwise Sheets returns "Unable to parse range".
const SHEET_CUSTOMERS = "'MAID CUSTOMERS'";
const SHEET_BOOKINGS  = "BOOKINGS";
const SHEET_MAIDS     = "MAIDS";
const SHEET_CLEANING_BOOKINGS = "CLEANING_CUSTOMERS";

// ─── Auth & client singleton ─────────────────────────────────
let sheetsClient = null;

/**
 * Returns an authorised Google Sheets client.
 * Creates it once, then caches.
 */
async function getClient() {
  if (sheetsClient) return sheetsClient;

  // If running on Render/Cloud with the JSON string in env variable
  if (process.env.GOOGLE_CREDENTIALS) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      sheetsClient = google.sheets({ version: "v4", auth });
      return sheetsClient;
    } catch (e) {
      console.error("[sheets] Failed to parse GOOGLE_CREDENTIALS env var:", e.message);
    }
  }

  // Fallback to local file
  const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || "./credentials.json";
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(credentialsPath),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

/**
 * Helper — spreadsheet ID from env.
 */
function sheetId() {
  return process.env.SPREADSHEET_ID;
}

// ─── ID Generators ───────────────────────────────────────────
//
// IDs stay sequential (C001, B001, …) but we only hit the Sheets API
// once per ID type on the first call (or after a TTL refresh).
// Subsequent calls increment an in-memory counter — instant.

const ID_REFRESH_MS = 30 * 60 * 1000; // 30-minute safety re-read
const counters = {
  customer: { value: null, fetchedAt: 0 },
  booking:  { value: null, fetchedAt: 0 },
};

async function readRowCount(sheetName) {
  const sheets = await getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: `${sheetName}!A:A`,
  });
  return (res.data.values || []).length;
}

async function nextId(prefix, counterKey, sheetName) {
  const c = counters[counterKey];
  const stale = c.value === null || Date.now() - c.fetchedAt > ID_REFRESH_MS;
  if (stale) {
    try {
      c.value = await readRowCount(sheetName);
      c.fetchedAt = Date.now();
    } catch (err) {
      console.error(`[sheets] readRowCount(${sheetName}) failed:`, err.message);
      // Fall back to a timestamp-based id so the booking still works
      return `${prefix}${Date.now().toString().slice(-5)}`;
    }
  }
  c.value += 1;
  return `${prefix}${String(c.value).padStart(3, "0")}`;
}

async function generateCustomerId() {
  return nextId("C", "customer", SHEET_CUSTOMERS);
}

async function generateBookingId() {
  return nextId("B", "booking", SHEET_BOOKINGS);
}

/**
 * Pre-fetch both row counts at bot startup so the FIRST customer/
 * booking ID is generated instantly instead of paying the Sheets
 * round-trip during the customer's interaction.
 */
async function warmCounters() {
  const now = Date.now();
  await Promise.all([
    readRowCount(SHEET_CUSTOMERS).then(v => {
      counters.customer.value = v;
      counters.customer.fetchedAt = now;
      console.log(`[sheets] customer counter warm — ${v} rows`);
    }).catch(e => console.warn('[sheets] customer counter warm failed:', e.message)),
    readRowCount(SHEET_BOOKINGS).then(v => {
      counters.booking.value = v;
      counters.booking.fetchedAt = now;
      console.log(`[sheets] booking counter warm — ${v} rows`);
    }).catch(e => console.warn('[sheets] booking counter warm failed:', e.message)),
  ]);
}

// ─── Append Functions ────────────────────────────────────────

/**
 * Appends a new row to the MAID CUSTOMERS sheet.
 *
 * Column layout (A → O):
 *   A Customer ID | B Name | C WhatsApp Number | D Work type
 *   E Timing Preference | F Budget | G City | H Area
 *   I Flat / address | J selected maid name | K interview date
 *   L Choosed Plan | M enquiry date | N status | O Feedback (manual)
 */
async function appendCustomer(data) {
  try {
    const sheets = await getClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId(),
      range: `${SHEET_CUSTOMERS}!A:O`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            data.customerId       || "",                                       // A
            data.name             || "",                                       // B
            data.whatsappNumber   || "",                                       // C
            data.workType         || "",                                       // D
            data.timing           || "",                                       // E
            data.budget           || "",                                       // F
            data.city             || "",                                       // G
            data.area             || "",                                       // H
            data.flat             || "",                                       // I
            data.maidChoice       || data.assignedMaidId || "",                // J
            data.interviewDate    || "",                                       // K
            data.selectedPlan     || "",                                       // L
            data.enquiryDate      || new Date().toLocaleDateString("en-IN"),   // M
            data.status           || "New Lead",                               // N
            data.feedback         || "",                                       // O
          ],
        ],
      },
    });
    console.log(`[sheets] Maid customer appended: ${data.customerId}`);
  } catch (err) {
    console.error("[sheets] appendCustomer error:", err.message);
    // Do NOT crash — flow continues even if sheet write fails
  }
}

/**
 * Appends a new row to the BOOKINGS sheet.
 *
 * Column layout (A → X):
 *   A Booking ID | B Customer Name | C Customer WhatsApp | D Maid Name
 *   E Maid ID | F Work Type | G Timing | H Start Date
 *   I Monthly Salary | J Flat | K Booking Date | L Status
 *   M Commission Paid | N Follow-up Day 1 | O Follow-up Day 2
 *   P Follow-up Day 3 | Q Monthly Check-in | R Selected Plan
 *   S City | T Area | U Language | V Payment Status
 *   W Receipt URL | X Payment Verified
 */
async function appendBooking(data) {
  try {
    const sheets = await getClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId(),
      range: `${SHEET_BOOKINGS}!A:X`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            data.bookingId          || "",                                              // A
            data.customerName       || "",                                              // B
            data.customerWhatsApp   || "",                                              // C
            data.maidName           || "",                                              // D
            data.maidId             || "",                                              // E
            data.workType           || "",                                              // F
            data.timing             || "",                                              // G
            data.startDate          || "",                                              // H
            data.monthlySalary      || "",                                              // I
            data.flat               || "",                                              // J
            data.bookingDate        || new Date().toLocaleDateString("en-IN"),          // K
            data.status             || "Payment Pending",                               // L
            data.commissionPaid     || "No",                                            // M
            "",                                                                          // N Follow-up Day 1
            "",                                                                          // O Follow-up Day 2
            "",                                                                          // P Follow-up Day 3
            "",                                                                          // Q Monthly Check-in
            data.selectedPlan       || "",                                              // R
            data.city               || "",                                              // S
            data.area               || "",                                              // T
            data.language           || "en",                                            // U
            data.paymentStatus      || "Pending",                                       // V
            data.receiptNote        || "",                                              // W
            data.paymentVerified    || "",                                              // X
          ],
        ],
      },
    });
    console.log(`[sheets] Booking appended: ${data.bookingId}`);
  } catch (err) {
    console.error("[sheets] appendBooking error:", err.message);
  }
}

/**
 * Finds a booking by ID (Column A) and updates payment status (V) and receipt note (W).
 */
async function updateBookingPayment(bookingId, receiptNote) {
  try {
    const sheets = await getClient();

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId(),
      range: `${SHEET_BOOKINGS}!A:A`,
    });

    const rows = res.data.values || [];
    let targetRow = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i] && rows[i][0] === bookingId) {
        targetRow = i + 1;
        break;
      }
    }

    if (targetRow === -1) {
      console.warn(`[sheets] Booking not found for payment update: ${bookingId}`);
      return;
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId(),
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: [
          { range: `${SHEET_BOOKINGS}!V${targetRow}`, values: [["Receipt Received"]] },
          { range: `${SHEET_BOOKINGS}!W${targetRow}`, values: [[receiptNote]] },
        ],
      },
    });

    console.log(`[sheets] Payment updated for booking: ${bookingId}`);
  } catch (err) {
    console.error("[sheets] updateBookingPayment error:", err.message);
  }
}

/**
 * Appends a new row to the CLEANING_CUSTOMERS sheet.
 *
 * Column layout (A → L):
 *   A Booking ID | B Customer Name | C WhatsApp Number | D Service Type
 *   E Details/Size | F Location | G Preferred Date | H Status
 *   I Enquiry date | J Source | K Estimated Price | L Feedback (manual)
 */
async function appendCleaningBooking(data) {
  try {
    const sheets = await getClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId(),
      range: `${SHEET_CLEANING_BOOKINGS}!A:O`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            data.bookingId          || "",                                              // A
            data.customerName       || "",                                              // B
            data.whatsappNumber     || "",                                              // C
            data.serviceType        || "",                                              // D
            data.details            || "",                                              // E
            data.location           || "",                                              // F
            data.preferredDate      || "",                                              // G
            data.status             || "New Request",                                   // H
            data.enquiryDate        || data.bookingDate || new Date().toLocaleDateString("en-IN"), // I
            data.source             || "WhatsApp Bot",                                  // J
            data.estimatedPrice     || "",                                              // K
            data.feedback           || "",                                              // L
            data.paymentStatus      || "Pending",                                       // M
            data.receiptUrl         || "",                                              // N
            data.paymentVerified    || "",                                              // O
          ],
        ],
      },
    });
    console.log(`[sheets] Cleaning customer appended: ${data.bookingId}`);
  } catch (err) {
    console.error("[sheets] appendCleaningBooking error:", err.message);
  }
}

// ─── Update Functions ────────────────────────────────────────

/**
 * Once a maid booking is confirmed, fill the existing MAID CUSTOMERS row
 * with the details we now know — address, selected maid, interview
 * date and plan. Columns (per the new layout):
 *   I = flat (address)
 *   J = selected maid name
 *   K = interview date
 *   L = chosen plan
 */
async function updateCustomerBooking(whatsappNumber, data) {
  try {
    const sheets = await getClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId(),
      range: `${SHEET_CUSTOMERS}!C:C`,
    });
    const rows = res.data.values || [];
    let targetRow = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i] && rows[i][0] === whatsappNumber) { targetRow = i + 1; break; }
    }
    if (targetRow === -1) {
      console.warn(`[sheets] Customer not found for booking update: ${whatsappNumber}`);
      return;
    }
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId(),
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: [
          { range: `${SHEET_CUSTOMERS}!I${targetRow}`, values: [[data.flat || ""]] },
          { range: `${SHEET_CUSTOMERS}!J${targetRow}`, values: [[data.maidChoice || ""]] },
          { range: `${SHEET_CUSTOMERS}!K${targetRow}`, values: [[data.interviewDate || ""]] },
          { range: `${SHEET_CUSTOMERS}!L${targetRow}`, values: [[data.selectedPlan || ""]] },
        ],
      },
    });
    console.log(`[sheets] Customer booking details updated (row ${targetRow})`);
  } catch (err) {
    console.error("[sheets] updateCustomerBooking error:", err.message);
  }
}

/**
 * Upserts a CUSTOMERS row by WhatsApp number. If the row exists, only
 * supplied (non-empty) fields are updated. If not, a new row is appended
 * with a generated customerId. Used to save customer progress
 * incrementally — call after every state transition so a drop-off still
 * leaves a usable lead record for retargeting.
 *
 * @param {string} whatsappNumber  e.g. "919876543210"
 * @param {object} fields  any subset of {
 *   name, flat, workType, timing, budget, status, maidChoice,
 *   city, area, language, interviewDate, selectedPlan, notes
 * }
 * @returns {Promise<string|null>} customerId of the row, or null on error
 */
// Column letters for the MAID CUSTOMERS sheet (matches appendCustomer above).
const CUSTOMER_COL_MAP = {
  name:          'B',
  whatsappNumber:'C',
  workType:      'D',
  timing:        'E',
  budget:        'F',
  city:          'G',
  area:          'H',
  flat:          'I',
  maidChoice:    'J',
  interviewDate: 'K',
  selectedPlan:  'L',
  enquiryDate:   'M',
  status:        'N',
  feedback:      'O',
};

async function upsertCustomerByPhone(whatsappNumber, fields = {}) {
  if (!whatsappNumber) return null;
  try {
    const sheets = await getClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId(),
      range: `${SHEET_CUSTOMERS}!A:C`,
    });
    const rows = res.data.values || [];
    let targetRow = -1;
    let existingCustomerId = null;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      if (row[2] === whatsappNumber) {
        targetRow = i + 1;
        existingCustomerId = row[0] || null;
        break;
      }
    }

    if (targetRow === -1) {
      // No row yet — append a fresh one with whatever we know so far.
      const customerId = fields.customerId || await generateCustomerId();
      await appendCustomer({
        ...fields,
        customerId,
        whatsappNumber,
        status: fields.status || 'New Lead',
      });
      return customerId;
    }

    // Row exists — patch the columns we have new values for. Skip empty
    // values so we never overwrite a populated cell with blanks.
    const updateData = [];
    for (const [k, v] of Object.entries(fields)) {
      const col = CUSTOMER_COL_MAP[k];
      if (col && v !== undefined && v !== null && v !== '') {
        updateData.push({
          range: `${SHEET_CUSTOMERS}!${col}${targetRow}`,
          values: [[v]],
        });
      }
    }
    if (updateData.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId(),
        requestBody: { valueInputOption: 'USER_ENTERED', data: updateData },
      });
      console.log(`[sheets] Customer patched (row ${targetRow}): ${Object.keys(fields).filter(k => CUSTOMER_COL_MAP[k]).join(',')}`);
    }
    return existingCustomerId;
  } catch (err) {
    console.error('[sheets] upsertCustomerByPhone error:', err.message);
    return null;
  }
}

/**
 * Patch any subset of fields on a CLEANING_BOOKINGS row by bookingId.
 * Like `updateCleaningBooking` but supports more columns (customerName,
 * whatsappNumber, language, source, notes) so it can be used for
 * progressive saves as the customer moves through the flow.
 */
// Column letters for the CLEANING_CUSTOMERS sheet (matches appendCleaningBooking above).
const CLEANING_COL_MAP = {
  bookingId:      'A',
  customerName:   'B',
  whatsappNumber: 'C',
  serviceType:    'D',
  details:        'E',
  location:       'F',
  preferredDate:  'G',
  status:         'H',
  enquiryDate:    'I',
  source:         'J',
  estimatedPrice: 'K',
  feedback:       'L',
  paymentStatus:  'M',
  receiptUrl:     'N',
  paymentVerified:'O',
};

async function updateCleaningBookingFields(bookingId, fields = {}) {
  if (!bookingId) return;
  try {
    const sheets = await getClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId(),
      range: `${SHEET_CLEANING_BOOKINGS}!A:A`,
    });
    const rows = res.data.values || [];
    let row = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i] && rows[i][0] === bookingId) { row = i + 1; break; }
    }
    if (row === -1) {
      console.warn(`[sheets] Cleaning booking not found for patch: ${bookingId}`);
      return;
    }
    const data = [];
    for (const [k, v] of Object.entries(fields)) {
      const col = CLEANING_COL_MAP[k];
      if (col && v !== undefined && v !== null && v !== '') {
        data.push({ range: `${SHEET_CLEANING_BOOKINGS}!${col}${row}`, values: [[v]] });
      }
    }
    if (data.length === 0) return;
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId(),
      requestBody: { valueInputOption: 'USER_ENTERED', data },
    });
    console.log(`[sheets] Cleaning patched (row ${row}): ${Object.keys(fields).filter(k => CLEANING_COL_MAP[k]).join(',')}`);
  } catch (err) {
    console.error('[sheets] updateCleaningBookingFields error:', err.message);
  }
}

/**
 * Finds a customer row by WhatsApp number (Column C) and updates the
 * Status column (Column I).
 *
 * @param {string} whatsappNumber — e.g. "919876543210@c.us"
 * @param {string} status — new status value
 */
async function updateCustomerStatus(whatsappNumber, status) {
  try {
    const sheets = await getClient();

    // 1. Read column C (WhatsApp Number)
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId(),
      range: `${SHEET_CUSTOMERS}!C:C`,
    });

    const rows = res.data.values || [];
    let targetRow = -1;

    for (let i = 1; i < rows.length; i++) {
      // rows[i][0] is the value in column C for that row
      if (rows[i] && rows[i][0] === whatsappNumber) {
        targetRow = i + 1; // Sheets rows are 1-indexed
        break;
      }
    }

    if (targetRow === -1) {
      console.warn(`[sheets] Customer not found for status update: ${whatsappNumber}`);
      return;
    }

    // 2. Update column N (Status) for that row
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId(),
      range: `${SHEET_CUSTOMERS}!N${targetRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[status]],
      },
    });

    console.log(`[sheets] Customer status updated → ${status} (row ${targetRow})`);
  } catch (err) {
    console.error("[sheets] updateCustomerStatus error:", err.message);
  }
}

/**
 * Find a CLEANING_BOOKINGS row by bookingId (column A) and patch only the
 * fields supplied in `updates`. Used to upgrade a 'New Lead' row to
 * 'Confirmed' (or 'Cancelled') once the customer finishes the flow.
 */
async function updateCleaningBooking(bookingId, updates = {}) {
  try {
    const sheets = await getClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId(),
      range: `${SHEET_CLEANING_BOOKINGS}!A:A`,
    });
    const rows = res.data.values || [];
    let row = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i] && rows[i][0] === bookingId) { row = i + 1; break; }
    }
    if (row === -1) { console.warn(`[sheets] Cleaning booking not found: ${bookingId}`); return; }

    const data = [];
    if (updates.details        !== undefined) data.push({ range: `${SHEET_CLEANING_BOOKINGS}!E${row}`, values: [[updates.details]] });
    if (updates.location       !== undefined) data.push({ range: `${SHEET_CLEANING_BOOKINGS}!F${row}`, values: [[updates.location]] });
    if (updates.preferredDate  !== undefined) data.push({ range: `${SHEET_CLEANING_BOOKINGS}!G${row}`, values: [[updates.preferredDate]] });
    if (updates.status         !== undefined) data.push({ range: `${SHEET_CLEANING_BOOKINGS}!H${row}`, values: [[updates.status]] });
    if (updates.estimatedPrice !== undefined) data.push({ range: `${SHEET_CLEANING_BOOKINGS}!K${row}`, values: [[updates.estimatedPrice]] });
    if (updates.paymentStatus  !== undefined) data.push({ range: `${SHEET_CLEANING_BOOKINGS}!M${row}`, values: [[updates.paymentStatus]] });
    if (updates.receiptUrl     !== undefined) data.push({ range: `${SHEET_CLEANING_BOOKINGS}!N${row}`, values: [[updates.receiptUrl]] });
    if (updates.paymentVerified!== undefined) data.push({ range: `${SHEET_CLEANING_BOOKINGS}!O${row}`, values: [[updates.paymentVerified]] });
    if (data.length === 0) return;

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId(),
      requestBody: { valueInputOption: 'USER_ENTERED', data },
    });
    console.log(`[sheets] Cleaning booking updated: ${bookingId} → ${updates.status || 'partial'}`);
  } catch (err) {
    console.error('[sheets] updateCleaningBooking error:', err.message);
  }
}

/**
 * Marks a booking payment as verified.
 *   V (Payment Status) → "Payment Verified"
 *   X (Payment Verified) → today's date as the verification timestamp
 */
async function markPaymentVerified(bookingId) {
  try {
    const sheets = await getClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId(),
      range: `${SHEET_BOOKINGS}!A:A`,
    });

    const rows = res.data.values || [];
    let targetRow = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i] && rows[i][0] === bookingId) { targetRow = i + 1; break; }
    }
    if (targetRow === -1) { console.warn(`[sheets] Booking not found for verify: ${bookingId}`); return; }

    const today = new Date().toLocaleDateString("en-IN");
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId(),
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: [
          { range: `${SHEET_BOOKINGS}!V${targetRow}`, values: [["Payment Verified"]] },
          { range: `${SHEET_BOOKINGS}!X${targetRow}`, values: [[today]] },
        ],
      },
    });
    console.log(`[sheets] Payment marked verified: ${bookingId}`);
  } catch (err) {
    console.error("[sheets] markPaymentVerified error:", err.message);
  }
}

async function markCleaningPaymentVerified(bookingId) {
  try {
    const sheets = await getClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId(),
      range: `${SHEET_CLEANING_BOOKINGS}!A:A`,
    });

    const rows = res.data.values || [];
    let targetRow = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i] && rows[i][0] === bookingId) { targetRow = i + 1; break; }
    }
    if (targetRow === -1) { console.warn(`[sheets] Cleaning booking not found for verify: ${bookingId}`); return; }

    const today = new Date().toLocaleDateString("en-IN");
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId(),
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: [
          { range: `${SHEET_CLEANING_BOOKINGS}!M${targetRow}`, values: [["Payment Verified"]] },
          { range: `${SHEET_CLEANING_BOOKINGS}!O${targetRow}`, values: [[today]] },
        ],
      },
    });
    console.log(`[sheets] Cleaning payment marked verified: ${bookingId}`);
  } catch (err) {
    console.error("[sheets] markCleaningPaymentVerified error:", err.message);
  }
}

// ─── Exports ─────────────────────────────────────────────────
module.exports = {
  appendCustomer,
  appendBooking,
  updateCustomerBooking,
  appendCleaningBooking,
  updateCleaningBooking,
  updateCleaningBookingFields,
  upsertCustomerByPhone,
  updateCustomerStatus,
  updateBookingPayment,
  markPaymentVerified,
  markCleaningPaymentVerified,
  generateCustomerId,
  generateBookingId,
  warmCounters,
};
