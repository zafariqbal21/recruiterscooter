
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files with proper headers
app.use(express.static('public', {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html');
    }
  }
}));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
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

// Function to parse recruitment Excel data
function parseRecruitmentData(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON with header mapping
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (rawData.length === 0) {
      throw new Error('Excel file is empty');
    }
    
    // Get headers from first row and normalize them
    const rawHeaders = rawData[0];
    const dataRows = rawData.slice(1);
    
    // Create a mapping from normalized header names to column indices
    // Order matters - more specific matches should come first
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
    
    // Find column indices by matching header names (case-insensitive)
    rawHeaders.forEach((header, index) => {
      if (!header) return;
      
      const originalHeader = String(header).trim();
      const normalizedHeader = originalHeader.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Remove special characters
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();
      
      console.log(`Processing header "${originalHeader}" -> "${normalizedHeader}" at index ${index}`);
      
      for (const [fieldName, possibleNames] of Object.entries(expectedHeaders)) {
        // Skip if already mapped
        if (headerMapping[fieldName] !== undefined) continue;
        
        // Try exact matching first
        const exactMatch = possibleNames.some(name => {
          const normalizedName = name.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
          return normalizedHeader === normalizedName;
        });
        
        // Try partial matching for longer field names
        const partialMatch = !exactMatch && possibleNames.some(name => {
          const normalizedName = name.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
          return normalizedName.length > 3 && (
            normalizedHeader.includes(normalizedName) || 
            normalizedName.includes(normalizedHeader)
          );
        });
        
        // Try matching without spaces for compound words
        const compoundMatch = !exactMatch && !partialMatch && possibleNames.some(name => {
          const normalizedName = name.replace(/[^a-z0-9]/g, '');
          const compoundHeader = normalizedHeader.replace(/\s+/g, '');
          return compoundHeader === normalizedName || 
                 (normalizedName.length > 3 && compoundHeader.includes(normalizedName));
        });
        
        if (exactMatch || partialMatch || compoundMatch) {
          headerMapping[fieldName] = index;
          const matchType = exactMatch ? 'exact' : (partialMatch ? 'partial' : 'compound');
          console.log(`✓ Mapped "${originalHeader}" to field "${fieldName}" at index ${index} (${matchType})`);
          break;
        }
      }
    });
    
    // Debug log to help troubleshoot header mapping
    console.log('Raw Headers:', rawHeaders);
    console.log('Header Mapping:', headerMapping);
    
    // Helper function to convert Excel date serial to JS Date
    function convertExcelDate(excelDate) {
      if (!excelDate) return null;
      
      // If it's already a valid date string
      if (typeof excelDate === 'string') {
        const parsed = new Date(excelDate);
        return isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
      }
      
      // If it's an Excel serial number
      if (typeof excelDate === 'number') {
        const excelEpoch = new Date(1900, 0, 1);
        const days = excelDate - 2; // Excel has a leap year bug
        const jsDate = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
        return jsDate.toISOString().split('T')[0];
      }
      
      return null;
    }
    
    // Helper function to parse multiple CVs shared dates from a single cell
    function parseCVsSharedDates(cellValue) {
      if (!cellValue) return { dates: [], firstDate: null, lastDate: null, count: 0 };
      
      const dateStr = String(cellValue).trim();
      if (dateStr.toLowerCase() === 'na' || dateStr === '') {
        return { dates: [], firstDate: null, lastDate: null, count: 0 };
      }
      
      // Multiple date patterns to match
      const datePatterns = [
        // DD-MMM-YY format (e.g., 11-Mar-2025, 18-Mar-2025)
        /(\d{1,2}-[A-Za-z]{3}-\d{2,4})/g,
        // YYYY-MM-DD format
        /(\d{4}-\d{2}-\d{2})/g,
        // DD/MM/YYYY format
        /(\d{1,2}\/\d{1,2}\/\d{4})/g,
        // DD.MM.YY format
        /(\d{1,2}\.\d{1,2}\.\d{2,4})/g
      ];
      
      const extractedDates = [];
      const validDates = [];
      
      // Try each pattern
      for (const pattern of datePatterns) {
        const matches = dateStr.match(pattern);
        if (matches) {
          extractedDates.push(...matches);
        }
      }
      
      // Convert extracted strings to valid dates
      for (const dateStr of extractedDates) {
        let parsedDate = null;
        
        // Handle DD-MMM-YY format
        if (dateStr.match(/\d{1,2}-[A-Za-z]{3}-\d{2,4}/)) {
          const parts = dateStr.split('-');
          if (parts.length === 3) {
            const day = parseInt(parts[0]);
            const monthName = parts[1];
            let year = parseInt(parts[2]);
            
            // Convert 2-digit year to 4-digit
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
          // Try standard Date parsing for other formats
          parsedDate = new Date(dateStr);
        }
        
        // Validate the date
        if (parsedDate && !isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1900) {
          validDates.push(parsedDate);
        }
      }
      
      // Remove duplicates and sort
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
    
    // Helper function to safely get cell value
    function getCellValue(value, type = 'string') {
      // Check for various empty/null values
      if (value === undefined || 
          value === null || 
          value === '' || 
          value === 'null' || 
          value === 'NULL' ||
          (typeof value === 'string' && value.trim() === '') ||
          (typeof value === 'string' && value.trim().toLowerCase() === 'na') ||
          (typeof value === 'string' && value.trim().toLowerCase() === 'n/a') ||
          (typeof value === 'string' && value.trim() === '-') ||
          (typeof value === 'string' && value.trim() === '--')) {
        return null;
      }
      
      switch (type) {
        case 'number':
          const num = Number(value);
          return isNaN(num) || !isFinite(num) ? null : num;
        case 'date':
          const dateResult = convertExcelDate(value);
          // Additional validation for date
          if (dateResult && dateResult !== 'null' && dateResult !== '' && dateResult !== 'Invalid Date') {
            return dateResult;
          }
          return null;
        default:
          const strValue = String(value).trim();
          return (strValue === '' || strValue === 'null' || strValue === 'NULL' || strValue === '-' || strValue === '--') ? null : strValue;
      }
    }
    
    // Parse data rows using dynamic header mapping
    const parsedData = dataRows.map((row, index) => {
      // Parse CVs shared dates - handle multiple possible columns
      let cvsSharedInfo = { dates: [], firstDate: null, lastDate: null, count: 0 };
      
      // Try different CV sharing date columns
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
      
      // Get position count, default to 1 if not specified
      const positionCount = getCellValue(row[headerMapping.noOfPosition], 'number') || 1;
      
      // Get CV count - try multiple possible columns
      let cvCount = 0;
      if (headerMapping.numberOfCVs !== undefined) {
        cvCount = getCellValue(row[headerMapping.numberOfCVs], 'number') || 0;
      }
      if (cvCount === 0 && headerMapping.cvsSharedCount !== undefined) {
        cvCount = getCellValue(row[headerMapping.cvsSharedCount], 'number') || 0;
      }
      
      const record = {
        rowNumber: index + 2, // +2 because we skip header and arrays are 0-indexed
        recruiter: getCellValue(row[headerMapping.recruiter]),
        bdm: getCellValue(row[headerMapping.bdm]),
        clientName: getCellValue(row[headerMapping.clientName]),
        positionName: getCellValue(row[headerMapping.positionName]),
        noOfPosition: positionCount,
        requisitionLoggedDate: getCellValue(row[headerMapping.requisitionLoggedDate], 'date'),
        numberOfCVs: cvCount,
        positionOnHoldDate: getCellValue(row[headerMapping.positionOnHoldDate], 'date'),
        days: getCellValue(row[headerMapping.days], 'number'),
        remarks: getCellValue(row[headerMapping.remarks]),
        cvsSharedDates: cvsSharedInfo.dates,
        firstCVSharedDate: cvsSharedInfo.firstDate,
        lastCVSharedDate: cvsSharedInfo.lastDate,
        cvsSharedCount: cvsSharedInfo.count
      };
      
      // Calculate days from requisition to first CV shared
      if (record.requisitionLoggedDate && record.firstCVSharedDate) {
        try {
          const reqDate = new Date(record.requisitionLoggedDate);
          const firstCVDate = new Date(record.firstCVSharedDate);
          if (!isNaN(reqDate.getTime()) && !isNaN(firstCVDate.getTime())) {
            record.daysToFirstCV = Math.floor((firstCVDate - reqDate) / (1000 * 60 * 60 * 24));
          } else {
            record.daysToFirstCV = null;
          }
        } catch (e) {
          record.daysToFirstCV = null;
        }
      } else {
        record.daysToFirstCV = null;
      }
      
      // Debug log for first few records
      if (index < 5) {
        console.log(`\n=== Record ${index + 1} Debug ===`);
        console.log('Raw row data:', row.slice(0, 15)); // Show first 15 columns
        console.log('Header mapping:', headerMapping);
        console.log('Parsed record:', {
          recruiter: record.recruiter,
          bdm: record.bdm,
          clientName: record.clientName,
          positionName: record.positionName,
          noOfPosition: record.noOfPosition,
          requisitionLoggedDate: record.requisitionLoggedDate,
          numberOfCVs: record.numberOfCVs,
          positionOnHoldDate: record.positionOnHoldDate,
          firstCVSharedDate: record.firstCVSharedDate,
          lastCVSharedDate: record.lastCVSharedDate,
          cvsSharedCount: record.cvsSharedCount,
          daysToFirstCV: record.daysToFirstCV,
          days: record.days,
          remarks: record.remarks
        });
        console.log('=========================\n');
      }
      
      return record;
    }).filter(record => {
      // Filter out completely empty rows - but keep rows with at least one meaningful field
      return record.recruiter || record.clientName || record.positionName || 
             record.numberOfCVs > 0 || record.noOfPosition > 0;
    });
    
    // Generate summary statistics
    const summary = {
      totalRecords: parsedData.length,
      totalPositions: parsedData.reduce((sum, record) => 
        sum + (record.noOfPosition || 0), 0),
      totalCVs: parsedData.reduce((sum, record) => 
        sum + (record.numberOfCVs || 0), 0),
      uniqueRecruiters: [...new Set(parsedData
        .map(r => r.recruiter)
        .filter(r => r !== null))].length,
      uniqueClients: [...new Set(parsedData
        .map(r => r.clientName)
        .filter(r => r !== null))].length,
      positionsOnHold: parsedData.filter(r => r.positionOnHoldDate !== null).length,
      averageDays: parsedData.filter(r => r.days !== null).length > 0 
        ? Math.round(parsedData.reduce((sum, r) => sum + (r.days || 0), 0) / 
          parsedData.filter(r => r.days !== null).length) 
        : 0,
      recordsWithCVsShared: parsedData.filter(r => r.cvsSharedCount > 0).length,
      totalCVsShared: parsedData.reduce((sum, r) => sum + (r.cvsSharedCount || 0), 0),
      averageDaysToFirstCV: parsedData.filter(r => r.daysToFirstCV !== null).length > 0
        ? Math.round(parsedData.reduce((sum, r) => sum + (r.daysToFirstCV || 0), 0) / 
          parsedData.filter(r => r.daysToFirstCV !== null).length)
        : 0,
      averageCVsPerPosition: parsedData.filter(r => r.cvsSharedCount > 0).length > 0
        ? Math.round((parsedData.reduce((sum, r) => sum + (r.cvsSharedCount || 0), 0) /
          parsedData.filter(r => r.cvsSharedCount > 0).length) * 10) / 10
        : 0
    };
    
    return {
      success: true,
      data: parsedData,
      summary: summary,
      headers: rawHeaders,
      headerMapping: headerMapping,
      processedAt: new Date().toISOString()
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      data: null,
      summary: null
    };
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// File upload endpoint
app.post('/api/upload', upload.single('recruitmentData'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse recruitment data using our custom function
    const result = parseRecruitmentData(req.file.path);
    
    if (!result.success) {
      return res.status(400).json({ 
        error: 'Failed to parse recruitment data: ' + result.error 
      });
    }

    res.json({
      message: 'Recruitment data uploaded and processed successfully',
      filename: req.file.originalname,
      savedAs: req.file.filename,
      summary: result.summary,
      data: result.data,
      preview: result.data.slice(0, 5),
      processedAt: result.processedAt
    });

    // Clean up uploaded file after processing
    setTimeout(() => {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }, 5000); // Delete after 5 seconds

  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'Failed to process uploaded file' });
  }
});

// Process Excel data endpoint
app.post('/api/process-excel', upload.single('recruitmentData'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No Excel file provided' });
    }

    // Use our specialized recruitment data parser
    const result = parseRecruitmentData(req.file.path);

    if (!result.success) {
      return res.status(400).json({ 
        error: 'Failed to parse recruitment data: ' + result.error 
      });
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
        positionsOnHold: result.summary.positionsOnHold,
        averageDays: result.summary.averageDays
      },
      data: result.data,
      processedAt: result.processedAt
    });

    // Clean up uploaded file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

  } catch (error) {
    console.error('Error processing Excel file:', error);
    res.status(500).json({ error: 'Failed to process Excel file' });
  }
});

// Analytics endpoint
app.get('/api/analytics', (req, res) => {
  res.json({
    message: 'Analytics endpoint - implement your recruitment metrics here',
    sampleMetrics: {
      totalApplications: 0,
      hiredCandidates: 0,
      averageTimeToHire: 0,
      topSources: [],
      departmentBreakdown: {}
    }
  });
});

// Ensure all API responses are JSON
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  
  // Ensure JSON response for API routes
  if (req.path.startsWith('/api/')) {
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
  
  // For non-API routes, serve error page or redirect
  res.status(500).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API 404 handler - must come before catch-all
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Handle client-side routing - serve index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Recruitment Analytics Dashboard running on port ${PORT}`);
  console.log(`📊 Dashboard: http://0.0.0.0:${PORT}`);
  console.log(`📁 Upload endpoint: http://0.0.0.0:${PORT}/api/upload`);
  console.log(`📈 Analytics endpoint: http://0.0.0.0:${PORT}/api/analytics`);
  console.log(`🔄 Process Excel endpoint: http://0.0.0.0:${PORT}/api/process-excel`);
});
