// api/slots.js - API สำหรับตรวจสอบ time slots ที่ว่าง

const { google } = require('googleapis');

// ฟังก์ชันสำหรับ authenticate กับ Google Sheets
function getGoogleAuth() {
  try {
    // อ่าน credentials จาก environment variable
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    return auth;
  } catch (error) {
    console.error('Auth error:', error);
    throw new Error('Failed to authenticate with Google');
  }
}

// ฟังก์ชันหลัก
module.exports = async (req, res) => {
  // ตั้งค่า CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // รับ parameters
  const { date, department } = req.query;
  
  if (!date) {
    return res.status(400).json({ error: 'Missing date parameter' });
  }
  
  try {
    // Authenticate
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Spreadsheet ID
    const spreadsheetId = '1tFnbDgcGwHwMHdJAPMdb67fZLwkLgKMfEv7v2xPy9f8';
    
    // อ่านข้อมูลจาก sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Reservations!A2:C', // อ่านคอลัมน์ A-C (วันที่, เวลา, แผนก)
    });
    
    const rows = response.data.values || [];
    
    // นับจำนวนการจองในแต่ละ time slot
    const slotCounts = {
      '09:30-10:30': 0,
      '10:30-11:30': 0,
      '13:30-14:30': 0,
      '14:30-15:30': 0
    };
    
    // Loop ผ่านข้อมูลทั้งหมด
    rows.forEach(row => {
      const rowDate = row[0];
      const rowTime = row[1];
      
      // แปลงวันที่ให้เป็นรูปแบบเดียวกัน
      let formattedRowDate = '';
      
      // ถ้าเป็น Date object
      if (rowDate && typeof rowDate === 'string') {
        // แปลงจากรูปแบบ DD/MM/YYYY หรือ YYYY-MM-DD
        if (rowDate.includes('/')) {
          const parts = rowDate.split('/');
          if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2];
            formattedRowDate = `${year}-${month}-${day}`;
          }
        } else {
          formattedRowDate = rowDate;
        }
      }
      
      // ถ้าตรงกับวันที่ที่ขอมา ให้นับ
      if (formattedRowDate === date && rowTime && slotCounts.hasOwnProperty(rowTime.trim())) {
        slotCounts[rowTime.trim()]++;
      }
    });
    
    // สร้าง response object
    const MAX_CAPACITY = 10;
    const result = {};
    
    for (let slot in slotCounts) {
      result[slot] = {
        count: slotCounts[slot],
        available: slotCounts[slot] < MAX_CAPACITY
      };
    }
    
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};
