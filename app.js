
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
      'positionOnHoldDate': ['position on hold date', 'on hold date', 'hold date', 'position on hold', 'onhold date', 'on-hold date'],
      'noOfPosition': ['no of position', 'number of positions', 'positions count'],
      'requisitionLoggedDate': ['requisition logged date', 'logged date', 'req date', 'start date'],
      'numberOfCVs': ['number of cvs', 'cvs', 'cv count', 'resumes'],
      'positionName': ['position name', 'position', 'job title', 'role'],
      'recruiter': ['recruiter', 'recruiter name'],
      'bdm': ['bdm', 'business development manager'],
      'clientName': ['client name', 'client', 'company name'],
      'days': ['days', 'duration', 'days taken'],
      'remarks': ['remarks', 'comments', 'notes']
    };
    
    // Find column indices by matching header names (case-insensitive)
    rawHeaders.forEach((header, index) => {
      if (!header) return;
      
      const normalizedHeader = String(header).toLowerCase().trim();
      
      for (const [fieldName, possibleNames] of Object.entries(expectedHeaders)) {
        // Use exact matching first, then fallback to partial matching
        const exactMatch = possibleNames.some(name => normalizedHeader === name);
        const partialMatch = !exactMatch && possibleNames.some(name => 
          normalizedHeader.includes(name) && name.length > 3 // Avoid very short partial matches
        );
        
        if (exactMatch || partialMatch) {
          headerMapping[fieldName] = index;
          console.log(`Mapped "${header}" to field "${fieldName}" at index ${index}${exactMatch ? ' (exact)' : ' (partial)'}`);
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
    
    // Helper function to safely get cell value
    function getCellValue(value, type = 'string') {
      if (value === undefined || value === null || value === '') {
        return null;
      }
      
      switch (type) {
        case 'number':
          const num = Number(value);
          return isNaN(num) ? null : num;
        case 'date':
          return convertExcelDate(value);
        default:
          return String(value).trim();
      }
    }
    
    // Parse data rows using dynamic header mapping
    const parsedData = dataRows.map((row, index) => {
      const record = {
        rowNumber: index + 2, // +2 because we skip header and arrays are 0-indexed
        recruiter: getCellValue(row[headerMapping.recruiter]),
        bdm: getCellValue(row[headerMapping.bdm]),
        clientName: getCellValue(row[headerMapping.clientName]),
        positionName: getCellValue(row[headerMapping.positionName]),
        noOfPosition: getCellValue(row[headerMapping.noOfPosition], 'number'),
        requisitionLoggedDate: getCellValue(row[headerMapping.requisitionLoggedDate], 'date'),
        numberOfCVs: getCellValue(row[headerMapping.numberOfCVs], 'number'),
        positionOnHoldDate: getCellValue(row[headerMapping.positionOnHoldDate], 'date'),
        days: getCellValue(row[headerMapping.days], 'number'),
        remarks: getCellValue(row[headerMapping.remarks])
      };
      
      return record;
    }).filter(record => {
      // Filter out completely empty rows
      return Object.values(record).some(value => 
        value !== null && value !== undefined && value !== ''
      );
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
app.post('/api/process-excel', upload.single('excelFile'), (req, res) => {
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
