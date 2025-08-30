
const multer = require('multer');
const XLSX = require('xlsx');

// Configure multer for serverless
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.xlsx', '.xls', '.csv'];
    const fileExt = file.originalname.toLowerCase().split('.').pop();
    if (allowedTypes.includes('.' + fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel and CSV files are allowed'), false);
    }
  }
});

// Parse recruitment data function (same as your existing one)
function parseRecruitmentData(buffer, filename) {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (rawData.length === 0) {
      throw new Error('Excel file is empty');
    }
    
    const rawHeaders = rawData[0];
    const dataRows = rawData.slice(1);
    
    // Same header mapping logic as your existing function
    const headerMapping = {};
    const expectedHeaders = {
      'positionOnHoldDate': ['position on hold date', 'on hold date', 'hold date'],
      'noOfPosition': ['no of position', 'number of positions', 'positions count'],
      'requisitionLoggedDate': ['requisition logged date', 'logged date', 'req date'],
      'numberOfCVs': ['number of cvs', 'cvs', 'cv count', 'resumes'],
      'positionName': ['position name', 'position', 'job title', 'role'],
      'recruiter': ['recruiter', 'recruiter name'],
      'bdm': ['bdm', 'business development manager'],
      'clientName': ['client name', 'client', 'company name'],
      'days': ['days', 'duration', 'days taken'],
      'remarks': ['remarks', 'comments', 'notes']
    };
    
    rawHeaders.forEach((header, index) => {
      if (!header) return;
      const normalizedHeader = String(header).toLowerCase().trim();
      
      for (const [fieldName, possibleNames] of Object.entries(expectedHeaders)) {
        const exactMatch = possibleNames.some(name => normalizedHeader === name);
        if (exactMatch) {
          headerMapping[fieldName] = index;
          break;
        }
      }
    });
    
    const parsedData = dataRows.map((row, index) => ({
      rowNumber: index + 2,
      recruiter: row[headerMapping.recruiter] || null,
      bdm: row[headerMapping.bdm] || null,
      clientName: row[headerMapping.clientName] || null,
      positionName: row[headerMapping.positionName] || null,
      noOfPosition: Number(row[headerMapping.noOfPosition]) || null,
      numberOfCVs: Number(row[headerMapping.numberOfCVs]) || null,
      days: Number(row[headerMapping.days]) || null,
      remarks: row[headerMapping.remarks] || null
    })).filter(record => 
      Object.values(record).some(value => value !== null && value !== undefined)
    );
    
    const summary = {
      totalRecords: parsedData.length,
      totalPositions: parsedData.reduce((sum, r) => sum + (r.noOfPosition || 0), 0),
      totalCVs: parsedData.reduce((sum, r) => sum + (r.numberOfCVs || 0), 0),
      uniqueRecruiters: [...new Set(parsedData.map(r => r.recruiter).filter(r => r))].length,
      uniqueClients: [...new Set(parsedData.map(r => r.clientName).filter(r => r))].length
    };
    
    return { success: true, data: parsedData, summary };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  upload.single('recruitmentData')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const result = parseRecruitmentData(req.file.buffer, req.file.originalname);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json({
      success: true,
      filename: req.file.originalname,
      summary: result.summary,
      data: result.data,
      processedAt: new Date().toISOString()
    });
  });
}
