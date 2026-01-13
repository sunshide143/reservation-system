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

// ฟังก์ชันสำหรับเช็คทั้ง availability และ duplicate พร้อมกัน
async function checkBookingStatus(sheets, spreadsheetId, date, time, phone) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Reservations!A2:E', // อ่านคอลัมน์ A-E (วันที่, เวลา, แผนก, ชื่อ, เบอร์โทร)
  });
  
  const rows = response.data.values || [];
  let slotCount = 0;
  let isDuplicate = false;
  
  rows.forEach(row => {
    const rowDate = row[0];
    const rowTime = row[1];
    const rowPhone = row[4];
    
    // แปลงวันที่ให้เป็นรูปแบบเดียวกัน
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
    
    // นับจำนวนคนในช่วงเวลานี้
    if (formattedRowDate === date && rowTime && rowTime.trim() === time) {
      slotCount++;
    }
    
    // เช็คการจองซ้ำ (เบอร์เดียวกัน + วันเดียวกัน)
    if (formattedRowDate === date && rowPhone && rowPhone.trim() === phone.trim()) {
      isDuplicate = true;
    }
  });
  
  return {
    slotCount,
    isDuplicate,
    isAvailable: slotCount < 6
  };
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
    
    // เช็คทั้ง availability และ duplicate ในครั้งเดียว (ลด race condition)
    const bookingStatus = await checkBookingStatus(sheets, spreadsheetId, date, time, phone);
    
    // ตรวจสอบการจองซ้ำ
    if (bookingStatus.isDuplicate) {
      return res.status(400).json({
        success: false,
        message: 'เบอร์โทรนี้มีการจองในวันนี้แล้ว กรุณาใช้เบอร์โทรอื่น หรือติดต่อเจ้าหน้าที่'
      });
    }
    
    // ตรวจสอบว่า time slot ยังว่างหรือไม่
    if (!bookingStatus.isAvailable) {
      return res.status(400).json({
        success: false,
        message: `ขออภัย ช่วงเวลานี้เต็มแล้ว (${bookingStatus.slotCount}/6) กรุณาเลือกช่วงเวลาอื่น`
      });
    }
    
    // Double-check ก่อนบันทึก (ป้องกัน race condition เพิ่มเติม)
    const finalCheck = await checkBookingStatus(sheets, spreadsheetId, date, time, phone);
    
    if (!finalCheck.isAvailable) {
      return res.status(400).json({
        success: false,
        message: 'ขออภัย ช่วงเวลานี้เต็มแล้ว (มีคนจองพร้อมกัน) กรุณาเลือกช่วงเวลาอื่น'
      });
    }
    
    if (finalCheck.isDuplicate) {
      return res.status(400).json({
        success: false,
        message: 'เบอร์โทรนี้มีการจองในวันนี้แล้ว'
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
    
    // Verify บันทึกสำเร็จ (optional แต่ช่วยเช็ค)
    console.log(`✅ Booking confirmed: ${date} ${time} - ${name} (${phone})`);
    
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
