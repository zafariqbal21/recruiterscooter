
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

// Parse recruitment data function
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
      'positionOnHoldDate': ['position on hold date', 'on hold date', 'hold date', 'position on hold', 'onhold date', 'on-hold date', 'position hold date', 'hold_date', 'on hold', 'position_on_hold_date', 'positiononholddate'],
      'noOfPosition': ['no of position', 'number of positions', 'positions count', 'position count', 'no of positions', 'noofposition'],
      'requisitionLoggedDate': ['requisition logged date', 'logged date', 'req date', 'start date', 'requisition date', 'requisitionloggeddate', 'requisition_logged_date', 'requisitiondate'],
      'numberOfCVs': ['number of cvs', 'cvs', 'cv count', 'resumes', 'number of cv', 'cv_count', 'numberofcvs', 'number_of_cvs'],
      'positionName': ['position name', 'position', 'job title', 'role', 'position_name', 'positionname'],
      'recruiter': ['recruiter', 'recruiter name', 'recruiter_name', 'recruitername'],
      'bdm': ['bdm', 'business development manager', 'business_development_manager', 'businessdevelopmentmanager'],
      'clientName': ['client name', 'client', 'company name', 'client_name', 'company', 'clientname'],
      'days': ['days', 'duration', 'days taken', 'total_days', 'totaldays'],
      'remarks': ['remarks', 'comments', 'notes', 'remark'],
      'cvsSharedDate': ['cvs shared date', 'cv shared date', 'shared date', 'cvs date', 'cv date', 'cv_shared_date', 'cvs_shared_date', 'cvsshareddate', 'first cv shared', 'last cv shared'],
      'firstCVShared': ['first cv shared', 'first cv', 'first_cv_shared', 'firstcvshared'],
      'lastCVShared': ['last cv shared', 'last cv', 'last_cv_shared', 'lastcvshared'],
      'cvsSharedCount': ['cvs shared count', 'cv shared count', 'shared count', 'cvs_shared_count', 'cvssharedcount']
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
    
    // Helper functions
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
    
    function parseCVsSharedDates(cellValue) {
      if (!cellValue) return { dates: [], firstDate: null, lastDate: null, count: 0 };
      
      const dateStr = String(cellValue).trim();
      if (dateStr.toLowerCase() === 'na' || dateStr === '') {
        return { dates: [], firstDate: null, lastDate: null, count: 0 };
      }
      
      const datePatterns = [
        /(\d{1,2}-[A-Za-z]{3}-\d{2,4})/g,
        /(\d{4}-\d{2}-\d{2})/g,
        /(\d{1,2}\/\d{1,2}\/\d{4})/g,
        /(\d{1,2}\.\d{1,2}\.\d{2,4})/g
      ];
      
      const extractedDates = [];
      const validDates = [];
      
      for (const pattern of datePatterns) {
        const matches = dateStr.match(pattern);
        if (matches) {
          extractedDates.push(...matches);
        }
      }
      
      for (const dateStr of extractedDates) {
        let parsedDate = null;
        
        if (dateStr.match(/\d{1,2}-[A-Za-z]{3}-\d{2,4}/)) {
          const parts = dateStr.split('-');
          if (parts.length === 3) {
            const day = parseInt(parts[0]);
            const monthName = parts[1];
            let year = parseInt(parts[2]);
            
            if (year < 100) {
              year += year < 50 ? 2000 : 1900;
            }
            
            const monthMap = {
              'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
              'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
            };
            
            const month = monthMap[monthName.toLowerCase()];
            if (month !== undefined) {
              parsedDate = new Date(year, month, day);
            }
          }
        } else {
          parsedDate = new Date(dateStr);
        }
        
        if (parsedDate && !isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1900) {
          validDates.push(parsedDate);
        }
      }
      
      const uniqueDates = [...new Set(validDates.map(d => d.getTime()))]
        .map(time => new Date(time))
        .sort((a, b) => a - b);
      
      return {
        dates: uniqueDates.map(d => d.toISOString().split('T')[0]),
        firstDate: uniqueDates.length > 0 ? uniqueDates[0].toISOString().split('T')[0] : null,
        lastDate: uniqueDates.length > 0 ? uniqueDates[uniqueDates.length - 1].toISOString().split('T')[0] : null,
        count: uniqueDates.length
      };
    }
    
    // Parse data rows
    const parsedData = dataRows.map((row, index) => {
      let cvsSharedInfo = { dates: [], firstDate: null, lastDate: null, count: 0 };
      
      const cvsDateColumns = [
        headerMapping.cvsSharedDate,
        headerMapping.firstCVShared,
        headerMapping.lastCVShared
      ].filter(col => col !== undefined);
      
      if (cvsDateColumns.length > 0) {
        const allDates = [];
        cvsDateColumns.forEach(colIndex => {
          const dateInfo = parseCVsSharedDates(row[colIndex]);
          allDates.push(...dateInfo.dates);
        });
        
        if (allDates.length > 0) {
          const uniqueDates = [...new Set(allDates)].sort();
          cvsSharedInfo = {
            dates: uniqueDates,
            firstDate: uniqueDates[0],
            lastDate: uniqueDates[uniqueDates.length - 1],
            count: uniqueDates.length
          };
        }
      }
      
      const positionCount = getCellValue(row[headerMapping.noOfPosition], 'number') || 1;
      let cvCount = 0;
      if (headerMapping.numberOfCVs !== undefined) {
        cvCount = getCellValue(row[headerMapping.numberOfCVs], 'number') || 0;
      }
      if (cvCount === 0 && headerMapping.cvsSharedCount !== undefined) {
        cvCount = getCellValue(row[headerMapping.cvsSharedCount], 'number') || 0;
      }
      
      const record = {
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
        remarks: getCellValue(row[headerMapping.remarks]),
        cvsSharedDates: cvsSharedInfo.dates,
        firstCVSharedDate: cvsSharedInfo.firstDate,
        lastCVSharedDate: cvsSharedInfo.lastDate,
        cvsSharedCount: cvsSharedInfo.count
      };
      
      return record;
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
app.get('/api', (req, res) => {
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.post('/api/upload', upload.single('recruitmentData'), (req, res) => {
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

app.post('/api/process-excel', upload.single('recruitmentData'), (req, res) => {
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

// Export the Express app as a Vercel function
module.exports = app;
