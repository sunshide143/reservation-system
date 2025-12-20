// api/booking.js - API สำหรับบันทึกการจอง

const { google } = require('googleapis');

// ฟังก์ชันสำหรับ authenticate กับ Google Sheets
function getGoogleAuth() {
  try {
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

// ฟังก์ชันสำหรับเช็คว่า time slot ยังว่างหรือไม่
async function checkAvailability(sheets, spreadsheetId, date, time) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Reservations!A2:B',
  });
  
  const rows = response.data.values || [];
  let count = 0;
  
  rows.forEach(row => {
    const rowDate = row[0];
    const rowTime = row[1];
    
    let formattedRowDate = '';
    if (rowDate && typeof rowDate === 'string') {
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
    
    if (formattedRowDate === date && rowTime && rowTime.trim() === time) {
      count++;
    }
  });
  
  return count < 10; // MAX_CAPACITY = 10
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
  
  // ต้องเป็น POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // อ่านข้อมูลจาก request body
    const { date, time, department, name, phone } = req.body;
    
    // Validate
    if (!date || !time || !department || !name || !phone) {
      return res.status(400).json({ 
        success: false,
        message: 'ข้อมูลไม่ครบถ้วน' 
      });
    }
    
    // Authenticate
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const spreadsheetId = '1tFnbDgcGwHwMHdJAPMdb67fZLwkLgKMfEv7v2xPy9f8';
    
    // ตรวจสอบว่า time slot ยังว่างหรือไม่
    const isAvailable = await checkAvailability(sheets, spreadsheetId, date, time);
    
    if (!isAvailable) {
      return res.status(400).json({
        success: false,
        message: 'ขออภัย ช่วงเวลานี้เต็มแล้ว กรุณาเลือกช่วงเวลาอื่น'
      });
    }
    
    // เตรียมข้อมูลสำหรับบันทึก
    const values = [[date, time, department, name, phone]];
    
    // บันทึกลง Google Sheets
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Reservations!A:E',
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
    
    return res.status(200).json({
      success: true,
      message: 'บันทึกการจองเรียบร้อยแล้ว'
    });
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาด: ' + error.message
    });
  }
};
