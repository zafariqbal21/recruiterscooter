
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for serverless (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.xlsx', '.xls', '.csv'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel and CSV files are allowed'), false);
    }
  }
});

// Parse recruitment data function (adapted for serverless)
function parseRecruitmentData(buffer) {
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
    
    // Header mapping logic
    const headerMapping = {};
    const expectedHeaders = {
      'positionOnHoldDate': ['position on hold date', 'on hold date', 'hold date', 'position on hold', 'onhold date', 'on-hold date'],
      'noOfPosition': ['no of position', 'number of positions', 'positions count', 'position count'],
      'requisitionLoggedDate': ['requisition logged date', 'logged date', 'req date', 'start date'],
      'numberOfCVs': ['number of cvs', 'cvs', 'cv count', 'resumes', 'number of cv'],
      'positionName': ['position name', 'position', 'job title', 'role'],
      'recruiter': ['recruiter', 'recruiter name'],
      'bdm': ['bdm', 'business development manager'],
      'clientName': ['client name', 'client', 'company name'],
      'days': ['days', 'duration', 'days taken'],
      'remarks': ['remarks', 'comments', 'notes'],
      'cvsSharedDate': ['cvs shared date', 'cv shared date', 'shared date', 'cvs date']
    };
    
    rawHeaders.forEach((header, index) => {
      if (!header) return;
      const normalizedHeader = String(header).toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
      
      for (const [fieldName, possibleNames] of Object.entries(expectedHeaders)) {
        if (headerMapping[fieldName] !== undefined) continue;
        
        const exactMatch = possibleNames.some(name => {
          const normalizedName = name.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
          return normalizedHeader === normalizedName;
        });
        
        if (exactMatch) {
          headerMapping[fieldName] = index;
          break;
        }
      }
    });
    
    // Helper function to safely get cell value
    function getCellValue(value, type = 'string') {
      if (value === undefined || value === null || value === '' || value === 'null' || 
          (typeof value === 'string' && value.trim() === '')) {
        return null;
      }
      
      switch (type) {
        case 'number':
          const num = Number(value);
          return isNaN(num) || !isFinite(num) ? null : num;
        default:
          return String(value).trim();
      }
    }
    
    // Parse data rows
    const parsedData = dataRows.map((row, index) => {
      const positionCount = getCellValue(row[headerMapping.noOfPosition], 'number') || 1;
      const cvCount = getCellValue(row[headerMapping.numberOfCVs], 'number') || 0;
      
      return {
        rowNumber: index + 2,
        recruiter: getCellValue(row[headerMapping.recruiter]),
        bdm: getCellValue(row[headerMapping.bdm]),
        clientName: getCellValue(row[headerMapping.clientName]),
        positionName: getCellValue(row[headerMapping.positionName]),
        noOfPosition: positionCount,
        requisitionLoggedDate: getCellValue(row[headerMapping.requisitionLoggedDate]),
        numberOfCVs: cvCount,
        positionOnHoldDate: getCellValue(row[headerMapping.positionOnHoldDate]),
        days: getCellValue(row[headerMapping.days], 'number'),
        remarks: getCellValue(row[headerMapping.remarks])
      };
    }).filter(record => 
      record.recruiter || record.clientName || record.positionName || 
      record.numberOfCVs > 0 || record.noOfPosition > 0
    );
    
    const summary = {
      totalRecords: parsedData.length,
      totalPositions: parsedData.reduce((sum, r) => sum + (r.noOfPosition || 0), 0),
      totalCVs: parsedData.reduce((sum, r) => sum + (r.numberOfCVs || 0), 0),
      uniqueRecruiters: [...new Set(parsedData.map(r => r.recruiter).filter(r => r))].length,
      uniqueClients: [...new Set(parsedData.map(r => r.clientName).filter(r => r))].length,
      positionsOnHold: parsedData.filter(r => r.positionOnHoldDate !== null).length
    };
    
    return { success: true, data: parsedData, summary };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Recruitment Analytics Dashboard API',
    version: '1.0.0',
    endpoints: {
      upload: 'POST /api/upload',
      processExcel: 'POST /api/process-excel',
      health: 'GET /api/health'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.post('/upload', upload.single('recruitmentData'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = parseRecruitmentData(req.file.buffer);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      message: 'Recruitment data uploaded and processed successfully',
      filename: req.file.originalname,
      summary: result.summary,
      data: result.data,
      preview: result.data.slice(0, 5),
      processedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'Failed to process uploaded file' });
  }
});

app.post('/process-excel', upload.single('recruitmentData'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No Excel file provided' });
    }

    const result = parseRecruitmentData(req.file.buffer);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      filename: req.file.originalname,
      summary: result.summary,
      analytics: {
        totalRecords: result.summary.totalRecords,
        totalPositions: result.summary.totalPositions,
        totalCVs: result.summary.totalCVs,
        uniqueRecruiters: result.summary.uniqueRecruiters,
        uniqueClients: result.summary.uniqueClients,
        positionsOnHold: result.summary.positionsOnHold
      },
      data: result.data,
      processedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error processing Excel file:', error);
    res.status(500).json({ error: 'Failed to process Excel file' });
  }
});

// Error handling
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }
  res.status(500).json({ error: error.message || 'Internal server error' });
});

module.exports = app;
