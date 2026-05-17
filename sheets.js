// ============================================================
// sheets.js — Google Sheets API v4 read/write helpers
// ============================================================
// Uses a service account. Credentials JSON path comes from
// env var GOOGLE_CREDENTIALS_PATH, spreadsheet ID from SPREADSHEET_ID.
// ============================================================

const { google } = require("googleapis");
const path = require("path");

// ─── Sheet tab names (must match your Google Sheet) ──────────
const SHEET_CUSTOMERS = "CUSTOMERS";
const SHEET_BOOKINGS  = "BOOKINGS";
const SHEET_MAIDS     = "MAIDS";
const SHEET_CLEANING_BOOKINGS = "CLEANING_BOOKINGS";

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

/**
 * Generates next Customer ID (C001, C002, …) based on existing rows.
 */
async function generateCustomerId() {
  try {
    const sheets = await getClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId(),
      range: `${SHEET_CUSTOMERS}!A:A`,
    });

    const rows = res.data.values || [];
    // Subtract 1 for the header row
    const nextNum = rows.length; // rows includes header, so length = last index + 1
    return `C${String(nextNum).padStart(3, "0")}`;
  } catch (err) {
    console.error("[sheets] generateCustomerId error:", err.message);
    // Fallback — timestamp-based
    return `C${Date.now().toString().slice(-5)}`;
  }
}

/**
 * Generates next Booking ID (B001, B002, …) based on existing rows.
 */
async function generateBookingId() {
  try {
    const sheets = await getClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId(),
      range: `${SHEET_BOOKINGS}!A:A`,
    });

    const rows = res.data.values || [];
    const nextNum = rows.length;
    return `B${String(nextNum).padStart(3, "0")}`;
  } catch (err) {
    console.error("[sheets] generateBookingId error:", err.message);
    return `B${Date.now().toString().slice(-5)}`;
  }
}

// ─── Append Functions ────────────────────────────────────────

/**
 * Appends a new row to the CUSTOMERS sheet.
 *
 * @param {object} data
 *   { customerId, name, whatsappNumber, flat, workType, timing,
 *     budget, enquiryDate, status, assignedMaidId, source, notes,
 *     city, area, language }
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
            data.customerId       || "",
            data.name             || "",
            data.whatsappNumber   || "",
            data.flat             || "",
            data.workType         || "",
            data.timing           || "",
            data.budget           || "",
            data.enquiryDate      || new Date().toLocaleDateString("en-IN"),
            data.status           || "New Lead",
            data.assignedMaidId   || "",
            data.source           || "WhatsApp Bot",
            data.notes            || "",
            data.city             || "",
            data.area             || "",
            data.language         || "en",
          ],
        ],
      },
    });
    console.log(`[sheets] Customer appended: ${data.customerId}`);
  } catch (err) {
    console.error("[sheets] appendCustomer error:", err.message);
    // Do NOT crash — flow continues even if sheet write fails
  }
}

/**
 * Appends a new row to the BOOKINGS sheet.
 *
 * @param {object} data
 *   { bookingId, customerName, customerWhatsApp, maidName, maidId,
 *     workType, timing, startDate, monthlySalary, flat, bookingDate,
 *     status, commissionPaid, selectedPlan, city, area, language }
 */
async function appendBooking(data) {
  try {
    const sheets = await getClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId(),
      range: `${SHEET_BOOKINGS}!A:W`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            data.bookingId          || "",
            data.customerName       || "",
            data.customerWhatsApp   || "",
            data.maidName           || "",
            data.maidId             || "",
            data.workType           || "",
            data.timing             || "",
            data.startDate          || "",
            data.monthlySalary      || "",
            data.flat               || "",
            data.bookingDate        || new Date().toLocaleDateString("en-IN"),
            data.status             || "Payment Pending",
            data.commissionPaid     || "No",
            "", // Follow-up Day 1
            "", // Follow-up Day 2
            "", // Follow-up Day 3
            "", // Monthly Check-in
            data.selectedPlan       || "",
            data.city               || "",
            data.area               || "",
            data.language           || "en",
            data.paymentStatus      || "Pending",  // Column V
            data.receiptNote        || "",          // Column W
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
 * Appends a new row to the CLEANING_BOOKINGS sheet.
 *
 * @param {object} data
 *   { bookingId, customerName, whatsappNumber, serviceType, details, 
 *     location, preferredDate, bookingDate, status, source, estimatedPrice, language }
 */
async function appendCleaningBooking(data) {
  try {
    const sheets = await getClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId(),
      range: `${SHEET_CLEANING_BOOKINGS}!A:M`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            data.bookingId          || "",
            data.customerName       || "",
            data.whatsappNumber     || "",
            data.serviceType        || "",
            data.details            || "",
            data.location           || "",
            data.preferredDate      || "",
            data.bookingDate        || new Date().toLocaleDateString("en-IN"),
            data.status             || "New Request",
            data.source             || "WhatsApp Bot",
            "", // Notes
            data.estimatedPrice     || "",
            data.language           || "en",
          ],
        ],
      },
    });
    console.log(`[sheets] Cleaning Booking appended: ${data.bookingId}`);
  } catch (err) {
    console.error("[sheets] appendCleaningBooking error:", err.message);
  }
}

// ─── Update Functions ────────────────────────────────────────

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

    // 2. Update column I (Status) for that row
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId(),
      range: `${SHEET_CUSTOMERS}!I${targetRow}`,
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

// ─── Exports ─────────────────────────────────────────────────
module.exports = {
  appendCustomer,
  appendBooking,
  appendCleaningBooking,
  updateCustomerStatus,
  updateBookingPayment,
  generateCustomerId,
  generateBookingId,
};
