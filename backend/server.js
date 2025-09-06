const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pdf = require('pdf-parse');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import authentication middleware and routes
const { authenticateToken, optionalAuth } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const { validationRules, handleValidationErrors, sanitizeInput, commonValidation } = require('./middleware/validation');

const app = express();
const PORT = process.env.PORT || 3002;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Rate limiting (disabled for debugging)
// if (process.env.NODE_ENV !== 'test') {
//   const limiter = rateLimit({
//     windowMs: 15 * 60 * 1000, // 15 minutes
//     max: 100, // limit each IP to 100 requests per windowMs
//     message: {
//       error: 'Too many requests from this IP, please try again later.',
//     },
//     standardHeaders: true,
//     legacyHeaders: false,
//   });
//   app.use('/api/', limiter);

//   // Stricter rate limiting for auth routes
//   const authLimiter = rateLimit({
//     windowMs: 15 * 60 * 1000,
//     max: 5, // limit each IP to 5 requests per 15 minutes for auth
//     message: {
//       error: 'Too many authentication attempts, please try again later.',
//     },
//     standardHeaders: true,
//     legacyHeaders: false,
//   });
//   app.use('/api/auth', authLimiter);
// }

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));
app.use(express.json({ limit: '10mb' }));
app.use(sanitizeInput); // Add input sanitization

// File upload configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' ||
        file.originalname.toLowerCase().endsWith('.pdf') ||
        file.mimetype === 'text/csv' ||
        file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and CSV files are allowed'), false);
    }
  }
});

// Serve static files from the backend directory
app.use(express.static(__dirname));

// Auth routes
app.use('/api/auth', authRoutes);

// Database setup
const dbPath = path.join(__dirname, 'database', 'database.db');
const dbDir = path.dirname(dbPath);

// Create database directory if it doesn't exist
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    runMigrations();
    initializeDatabase();
  }
});

// PDF Parsing Functions
async function parseEnhancedStatement(text) {
  const transactions = [];
  const lines = text.split('\n').map(line => line.trim()); // Trim all lines
  const datePattern = /^\d{2}\/\d{2}\/\d{2}$/; // Matches MM/DD/YY at the start of a string
  const amountPattern = /^-?[\d,]+\.\d{2}$/; // Matches $1,234.56 or -123.45

  console.log('=== PARSING BANK OF AMERICA MULTI-LINE STATEMENT ===');

  let currentYear = new Date().getFullYear();
  // Attempt to find the year from the statement period line
  const yearMatch = text.match(/for April \d{1,2}, (\d{4}) to/);
  if (yearMatch && yearMatch[1]) {
    currentYear = parseInt(yearMatch[1], 10);
    console.log(`Extracted statement year: ${currentYear}`);
  }

  // Find the start of the transaction sections
  const depositsIndex = lines.findIndex(line => line.startsWith('Deposits and other additions'));
  const withdrawalsIndex = lines.findIndex(line => line.startsWith('Withdrawals and other subtractions'));
  const feesIndex = lines.findIndex(line => line.startsWith('Service fees'));

  if (depositsIndex === -1 && withdrawalsIndex === -1) {
    console.log("Could not find 'Deposits' or 'Withdrawals' section headers. Aborting.");
    return []; // No transaction sections found
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if the line starts with a date (e.g., "05/01/25")
    const potentialDate = line.substring(0, 8);
    
    if (datePattern.test(potentialDate)) {
      let description = line.substring(8).trim(); // The rest of the line is the start of the description
      let amountStr = '';
      
      // Look ahead to the next lines for the rest of the description and the amount
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        
        // If the next line is an amount, we've found the end of the transaction
        if (amountPattern.test(nextLine)) {
          amountStr = nextLine;
          i = j; // Move the outer loop pointer past this transaction
          break; // Exit the inner look-ahead loop
        } else {
          // Otherwise, append this line to the description
          description += ' ' + nextLine;
        }
      }

      // If we found an amount, process the transaction
      if (amountStr) {
        const amount = parseFloat(amountStr.replace(/,/g, ''));
        const cleanDescription = description.replace(/\s+/g, ' ').trim(); // Clean up extra spaces
        
        const transaction = {
          date: parseDateString(potentialDate, currentYear), // Use your reliable date parser
          description: cleanDescription,
          amount: amount,
          category: categorizeTransaction(cleanDescription)
        };
        
        transactions.push(transaction);
        console.log('  ✅ Added transaction:', transaction);
      }
    }
  }

  console.log(`=== FOUND ${transactions.length} TRANSACTIONS ===`);
  return transactions;
}

async function parseChaseCreditCardStatement(text) {
  const transactions = [];
  const lines = text.split('\n');

  console.log('=== PARSING CHASE CREDIT CARD STATEMENT ===');

  // CORRECTED NON-GREEDY PATTERN
  const transactionPattern = /^(\d{2}\/\d{2})\s+(.+?)\s*(-?[\d,]+\.\d{2})$/;

  let currentYear = new Date().getFullYear();
  const yearMatch = text.match(/Opening\/Closing Date\s*\d{2}\/\d{2}\/(\d{2})/);
  if (yearMatch && yearMatch[1]) {
    const yearSuffix = parseInt(yearMatch[1], 10);
    currentYear = (yearSuffix > 50 ? 1900 : 2000) + yearSuffix;
    console.log(`Extracted statement year: ${currentYear}`);
  }

  const headerRegex = /Merchant\s+Name\s+or\s+Transaction\s+Description/;
  const activityStartIndex = lines.findIndex(line => headerRegex.test(line));

  if (activityStartIndex === -1) {
    console.log(`Could not find the transaction header line. Aborting.`);
    return [];
  }

  console.log(`Found transaction header at line ${activityStartIndex}. Starting parsing from the next line.`);

  for (let i = activityStartIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('TOTAL') || line.length < 10) {
      continue;
    }

    const match = line.match(transactionPattern);

    if (match) {
      let [, dateStr, description, amountStr] = match;
      description = description.trim();

      let amount = parseFloat(amountStr.replace(/,/g, ''));
      if (description.toLowerCase().includes('payment thank you')) {
        amount = Math.abs(amount);
      } else {
        amount = -Math.abs(amount);
      }
      
      const transaction = {
        date: parseDateString(dateStr, currentYear),
        description: description,
        amount: amount,
        category: await categorizeTransaction(description)
      };

      transactions.push(transaction);
      console.log('  ✅ Added transaction:', transaction);
    }
  }

  console.log(`=== FOUND ${transactions.length} TRANSACTIONS ===`);
  return transactions;
}


async function parseChaseCheckingStatement(text) {
  const transactions = [];
  const lines = text.split('\n');

  console.log('=== PARSING CHASE CHECKING ACCOUNT STATEMENT (v3 - String Manipulation) ===');

  let currentYear = new Date().getFullYear();
  const yearMatch = text.match(/May \d{1,2}, (\d{4})/);
  if (yearMatch && yearMatch[1]) {
    currentYear = parseInt(yearMatch[1], 10);
    console.log(`Extracted statement year: ${currentYear}`);
  }

  const header = 'DATEDESCRIPTIONAMOUNTBALANCE';
  const activityStartIndex = lines.findIndex(line => line.includes(header));

  if (activityStartIndex === -1) {
    console.log(`Could not find the transaction header: "${header}". Aborting.`);
    return [];
  }

  console.log(`Found transaction header at line ${activityStartIndex}. Starting parsing.`);

  for (let i = activityStartIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    const datePrefixPattern = /^\d{2}\/\d{2}/;

    // We only process lines that start with a date and are not the end of the list
    if (line.startsWith('Ending Balance') || !datePrefixPattern.test(line)) {
      continue;
    }

    try {
      // --- START OF THE NEW STRING PARSING LOGIC ---

      // 1. Find the last decimal point to locate the BALANCE
      const lastDecimalIndex = line.lastIndexOf('.');
      if (lastDecimalIndex === -1) continue;
      
      // 2. Find the start of the BALANCE number by walking backwards
      let balanceStartIndex = lastDecimalIndex - 1;
      while (balanceStartIndex > 0 && '0123456789,-'.includes(line[balanceStartIndex])) {
        balanceStartIndex--;
      }
      balanceStartIndex++; // Move pointer back to the start of the number

      // 3. Extract the line *without* the balance
      const lineWithoutBalance = line.substring(0, balanceStartIndex).trim();

      // 4. Find the last decimal point on the NEW line to locate the AMOUNT
      const amountDecimalIndex = lineWithoutBalance.lastIndexOf('.');
      if (amountDecimalIndex === -1) continue;

      // 5. Find the start of the AMOUNT number by walking backwards
      let amountStartIndex = amountDecimalIndex - 1;
      while (amountStartIndex > 0 && '0123456789,-'.includes(lineWithoutBalance[amountStartIndex])) {
        amountStartIndex--;
      }
      amountStartIndex++; // Move pointer back to the start of the number

      // 6. Now we can reliably extract all three parts
      const dateStr = lineWithoutBalance.substring(0, 5);
      const amountStr = lineWithoutBalance.substring(amountStartIndex);
      let description = lineWithoutBalance.substring(5, amountStartIndex).trim();

      // --- END OF THE NEW STRING PARSING LOGIC ---

      const amount = parseFloat(amountStr.replace(/,/g, ''));

      // Clean up the description if it contains the transaction date
      if (description.startsWith(dateStr)) {
        description = description.substring(dateStr.length).trim();
      }

      const transaction = {
        date: parseDateString(dateStr, currentYear),
        description: description,
        amount: amount,
        category: await categorizeTransaction(description)
      };

      transactions.push(transaction);
      console.log('  ✅ Added Checking transaction:', transaction);

    } catch (e) {
      console.error(`  ❌ Failed to parse line: "${line}"`, e);
    }
  }

  console.log(`=== FOUND ${transactions.length} TRANSACTIONS ===`);
  return transactions;
}

async function parseAppleCardStatement(text) {
  console.log('=== PARSING APPLE CARD PDF STATEMENT ===');
  const transactions = [];

  // Use indexOf to find the start of our key sections. This is more reliable than line-by-line.
  const paymentsIndex = text.indexOf('Payments\nDateDescriptionAmount');
  const transactionsIndex = text.indexOf('Transactions\nDateDescriptionDaily CashAmount');
  const interestIndex = text.indexOf('Interest Charged');

  if (transactionsIndex === -1) {
    console.error('Could not find the "Transactions" section header. Aborting.');
    return [];
  }

  // --- 1. PARSE THE "TRANSACTIONS" (PURCHASES) SECTION ---
  const transactionsText = text.substring(transactionsIndex, interestIndex);
  
  // This regex is designed for the Apple Card format:
  // Group 1: Date (MM/DD/YYYY)
  // Group 2: Description (everything up to the Daily Cash %)
  // Group 3: The actual transaction amount at the end of the line
  const transactionPattern = /^(\d{2}\/\d{2}\/\d{4})(.+?)\s*\d+%\s*\$[\d,.]+\s*\$([\d,]+\.\d{2})\s*$/gm;

  let match;
  while ((match = transactionPattern.exec(transactionsText)) !== null) {
    try {
      const date = parseDateString(match[1]);
      // Clean up description: remove daily cash % and amount, then trim.
      const description = match[2].trim();
      const amountStr = match[3];
      
      // Purchases on a credit card statement are positive, but for our app, they are expenses (negative).
      const amount = -Math.abs(parseFloat(amountStr.replace(/,/g, '')));

      if (date && description && !isNaN(amount)) {
        transactions.push({
          date,
          description,
          amount,
          category: await categorizeTransaction(description),
        });
      }
    } catch (e) {
      console.error('Error parsing Apple Card transaction line:', match[0], e);
    }
  }

  // --- 2. PARSE THE "PAYMENTS" SECTION ---
  if (paymentsIndex !== -1) {
    // Isolate the payment text block
    const paymentsText = text.substring(paymentsIndex, transactionsIndex);
    
    // This regex handles payments where the amount might be on a new line.
    // Group 1: Date (MM/DD/YYYY)
    // Group 2: Description (can include newlines)
    // Group 3: The payment amount (which is negative in the PDF)
    const paymentPattern = /(\d{2}\/\d{2}\/\d{4})([\s\S]+?)(-\$[\d,]+\.\d{2})/g;

    while ((match = paymentPattern.exec(paymentsText)) !== null) {
      try {
        const date = parseDateString(match[1]);
        // Clean up description: remove "DateDescriptionAmount" header and trim newlines/spaces.
        const description = match[2].replace('DateDescriptionAmount','').replace(/\n/g, ' ').trim();
        const amountStr = match[3];

        // Payments are negative in the PDF, but for our app, they are credits (positive).
        const amount = Math.abs(parseFloat(amountStr.replace(/[,\$-]/g, '')));

        if (date && description && !isNaN(amount)) {
          transactions.push({
            date,
            description,
            amount,
            category: 'Income', // Payments are categorized as Income/Transfer
          });
        }
      } catch (e) {
        console.error('Error parsing Apple Card payment line:', match[0], e);
      }
    }
  }
  
  console.log(`Found ${transactions.length} transactions in Apple Card statement.`);
  return transactions;
}



async function parseCSVStatement(text) {
  console.log('=== PARSING GENERIC CSV ===');
  const transactions = [];
  const lines = text.split('\n');
  
  // Find the header row
  const headerRow = lines.findIndex(line => 
    line.toLowerCase().includes('date') && 
    (line.toLowerCase().includes('description') || line.toLowerCase().includes('payee')) &&
    line.toLowerCase().includes('amount')
  );
  
  if (headerRow === -1) {
    console.error('Could not find header row in CSV');
    return transactions;
  }

  // Map the columns
  const headers = parseCSVLine(lines[headerRow]).map(h => h.trim().toLowerCase());
  const columnMap = {
    date: headers.findIndex(h => h.includes('date')),
    description: headers.findIndex(h => h.includes('description') || h.includes('payee')),
    amount: headers.findIndex(h => h.includes('amount'))
  };

  // Check if we found all required columns
  if (columnMap.date === -1 || columnMap.description === -1 || columnMap.amount === -1) {
    console.error('CSV is missing required columns:', columnMap);
    return transactions;
  }

  // Process data rows
  for (let i = headerRow + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV (handle quoted fields)
    const fields = parseCSVLine(line);

    if (fields.length >= 3) {
      try {
        // Common CSV formats:
        // Date, Description, Amount
        // Date, Description, Debit, Credit
        // Transaction Date, Description, Amount

        let date, description, amount;

        // Try to identify date column (usually first)
        date = parseDateString(fields[0]);

        // Description is usually second column
        description = fields[1] ? fields[1].trim().replace(/"/g, '') : '';

        // Amount handling
        if (fields.length === 3) {
          // Date, Description, Amount
          amount = parseFloat(fields[2].replace(/[\$,]/g, ''));
        } else if (fields.length >= 4) {
          // Date, Description, Debit, Credit
          const debit = parseFloat(fields[2].replace(/[\$,]/g, '') || '0');
          const credit = parseFloat(fields[3].replace(/[\$,]/g, '') || '0');
          amount = credit - debit;
        }

        if (date && description && !isNaN(amount) && Math.abs(amount) > 0.01) {
          transactions.push({
            date,
            description,
            amount,
            category: await categorizeTransaction(description)
          });
        }
      } catch (error) {
        console.log(`Error parsing CSV line: ${line}`, error);
      }
    }
  }

  return transactions;
}

async function parseChaseCheckingCSV(text) {
  console.log('=== PARSING CHASE CHECKING CSV ===');
  const transactions = [];
  const lines = text.split('\n');
  if (lines.length < 2) return []; // Need at least a header and one data line

  // Find header row (Chase CSVs might have extra lines at the top)
  let headerRow = 0;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i].toLowerCase();
    if (line.includes('posting date') && line.includes('description') && line.includes('amount')) {
      headerRow = i;
      break;
    }
  }

  console.log('Found header row at line:', headerRow);
  const header = parseCSVLine(lines[headerRow]).map(h => h.trim().toLowerCase());
  console.log('Chase CSV headers:', header);

  // Map all possible columns that might be present
  const columnMap = {
    details: header.indexOf('details'),
    date: header.indexOf('posting date'),
    description: header.indexOf('description'),
    amount: header.indexOf('amount'),
    type: header.indexOf('type'),
    balance: header.indexOf('balance')
  };

  // Check if all required columns were found
  if (columnMap.date === -1 || columnMap.description === -1 || columnMap.amount === -1) {
    console.error('Chase CSV is missing required columns:', columnMap);
    return [];
  }

  // Start from the row after header
  for (let i = headerRow + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCSVLine(line);
    // Ensure the line has enough columns
    if (fields.length <= Math.max(columnMap.date, columnMap.description, columnMap.amount)) continue;

    try {
      const dateStr = fields[columnMap.date];
      const description = fields[columnMap.description].replace(/"/g, '').trim();
      let amountStr = fields[columnMap.amount].replace(/[,$]/g, '').trim();
      const type = columnMap.type !== -1 ? fields[columnMap.type] : '';
      
      // Parse date
      const date = parseDateString(dateStr);
      
      // Handle amount based on transaction type (DEBIT/CREDIT)
      let amount = parseFloat(amountStr);
      // If it's already negative (has a minus sign), keep it as is
      // Otherwise, make it negative for DEBIT transactions
      if (!amountStr.includes('-') && fields[columnMap.details]?.toUpperCase() === 'DEBIT') {
        amount = -Math.abs(amount);
      }

      // Final validation to ensure we have good data
      if (date && description && !isNaN(amount)) {
        transactions.push({
          date,
          description,
          amount,
          // For a checking account, the sign is already correct. No flipping needed.
          category: await categorizeTransaction(description)
        });
      }
    } catch (error) {
      console.log(`Error parsing Chase CSV line: ${line}`, error);
    }
  }

  console.log(`Found ${transactions.length} transactions in Chase CSV.`);
  return transactions;
}

async function parseChaseCreditCardCSV(text) {
  console.log('=== PARSING CHASE CREDIT CARD CSV ===');
  const transactions = [];
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  const header = parseCSVLine(lines[0].toLowerCase());
  const columnMap = {
    // We'll use "post date" as it's more reliable than "transaction date"
    date: header.indexOf('post date'),
    description: header.indexOf('description'),
    amount: header.indexOf('amount'),
    type: header.indexOf('type')
  };

  if (columnMap.date === -1 || columnMap.description === -1 || columnMap.amount === -1) {
    console.error('Chase Credit Card CSV is missing required columns: "post date", "description", or "amount".');
    return [];
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCSVLine(line);
    if (fields.length <= Math.max(columnMap.date, columnMap.description, columnMap.amount)) continue;

    try {
      const dateStr = fields[columnMap.date];
      const description = fields[columnMap.description];
      const amountStr = fields[columnMap.amount];
      
      const date = parseDateString(dateStr);
      const amount = parseFloat(amountStr);

      if (date && description && !isNaN(amount)) {
        transactions.push({
          date,
          description,
          amount,
          // The signs in this CSV are already correct for our app's logic!
          // A Sale is negative, a Payment/Return is positive. No flipping needed.
          category: await categorizeTransaction(description)
        });
      }
    } catch (error) {
      console.log(`Error parsing Chase Credit Card CSV line: ${line}`, error);
    }
  }

  console.log(`Found ${transactions.length} transactions in Chase Credit Card CSV.`);
  return transactions;
}

async function parseBofACheckingCSV(text) {
  console.log('=== PARSING BANK OF AMERICA CHECKING CSV ===');
  const transactions = [];
  const lines = text.split('\n');

  // Skip the summary section at the top
  // Look for the actual transaction header row that has Date, Description, Amount, Running Bal
  let headerRow = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('Date,Description,Amount,Running Bal')) {
      headerRow = i;
      break;
    }
  }
  
  if (headerRow === -1) {
    console.error('Could not find transaction header row in BofA checking CSV');
    return transactions;
  }

  // Parse header row carefully
  const headers = parseCSVLine(lines[headerRow]).map(h => h.trim().toLowerCase());
  console.log('Found transaction headers:', headers);

  // Extract current year from first transaction date
  let currentYear = new Date().getFullYear();
  for (let i = headerRow + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line) {
      const fields = parseCSVLine(line);
      const dateMatch = fields[0].match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (dateMatch) {
        currentYear = parseInt(dateMatch[3], 10);
        console.log('Extracted year from transaction:', currentYear);
        break;
      }
    }
  }

  const columnMap = {
    date: headers.findIndex(h => h === 'date'),
    description: headers.findIndex(h => h === 'description'),
    amount: headers.findIndex(h => h === 'amount'),
    balance: headers.findIndex(h => h === 'running bal.')
  };
  
  console.log('Column mapping:', columnMap);

  // Verify required columns exist
  if (columnMap.date === -1 || columnMap.description === -1 || columnMap.amount === -1) {
    console.error('BofA Checking CSV is missing required columns:', columnMap);
    return transactions;
  }

  // Skip header row and start processing transactions
  for (let i = headerRow + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const columns = parseCSVLine(line);
      
      // Skip any balance rows (beginning or ending balance)
      const descLower = columns[columnMap.description].toLowerCase();
      if (descLower.includes('beginning balance') || descLower.includes('ending balance')) {
        console.log('Skipping balance row:', columns[columnMap.description]);
        continue;
      }

      // Parse the date with the correct year
      const dateStr = columns[columnMap.date];
      // Handle both / and - separators
      const dateMatch = dateStr.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
      if (!dateMatch) {
        console.log('Skipping row with invalid date format:', line);
        continue;
      }
      const month = parseInt(dateMatch[1], 10);
      const day = parseInt(dateMatch[2], 10);
      const year = parseInt(dateMatch[3], 10);
      const date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

      const description = columns[columnMap.description].trim();
      
      // Get amount, handling quoted values and removing commas
      const amountStr = columns[columnMap.amount].replace(/"/g, '').replace(/,/g, '');
      
      // Skip rows with no valid amount
      if (!amountStr) {
        console.log('Skipping row with no valid amount:', line);
        continue;
      }
      
      let amount = parseFloat(amountStr);
      
      // Skip if amount is not a valid number
      if (isNaN(amount)) {
        // Check if this might be a running balance row
        if (columns[columnMap.balance]) {
          console.log('Skipping running balance row:', line);
          continue;
        }
        console.log('Skipping row with invalid amount:', line);
        continue;
      }
      
      // Round to 2 decimal places to avoid floating point precision issues
      amount = Math.round(amount * 100) / 100;

      // Create transaction object
      const transaction = {
        date: date, // Use the ISO date string directly, no need to parse again
        description: description,
        amount: amount,
        category: await categorizeTransaction(description)
      };

      transactions.push(transaction);
    } catch (error) {
      console.error(`Error parsing BofA Checking CSV line: "${line}"`, error);
    }
  }

  console.log(`Found ${transactions.length} transactions in BofA Checking CSV.`);
  return transactions;
}

async function parseBofACreditCardCSV(text) {
  console.log('=== PARSING BANK OF AMERICA CREDIT CARD CSV (v3 - Robust) ===');
  const transactions = [];
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  // --- START OF NEW ROBUST LOGIC ---

  // Helper function to find a column index using a list of possible names
  const findColumnIndex = (header, aliases) => {
    for (const alias of aliases) {
      const index = header.indexOf(alias);
      if (index !== -1) {
        return index;
      }
    }
    return -1; // Not found
  };

  // 1. Find the actual header row, skipping summary lines.
  let headerIndex = -1;
  let header = [];
  for (let i = 0; i < lines.length; i++) {
    // A reliable way to identify the header is by checking for key columns.
    const potentialHeader = parseCSVLine(lines[i].toLowerCase());
    // Check if it looks like a valid header (contains date, description, and amount-like fields)
    if (findColumnIndex(potentialHeader, ['posted date', 'date']) !== -1 &&
        findColumnIndex(potentialHeader, ['payee', 'description']) !== -1 &&
        findColumnIndex(potentialHeader, ['amount']) !== -1) 
    {
      headerIndex = i;
      header = potentialHeader;
      console.log('Found header row at index:', headerIndex, 'with columns:', header);
      break;
    }
  }

  if (headerIndex === -1) {
    console.error('Could not find a valid header row in the BofA CSV. Searched for date, payee/description, and amount columns.');
    return [];
  }

  // 2. Map the columns using our flexible alias search.
  const columnMap = {
    date: findColumnIndex(header, ['posted date', 'date']),
    description: findColumnIndex(header, ['payee', 'description']),
    amount: findColumnIndex(header, ['amount'])
  };

  if (columnMap.date === -1 || columnMap.description === -1 || columnMap.amount === -1) {
    console.error('BofA Credit Card CSV is missing required columns. Mapped Columns:', columnMap);
    return [];
  }

  // 3. Start parsing from the line *after* the header.
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCSVLine(line);
    // Ensure we have enough data fields to prevent errors
    if (fields.length <= Math.max(columnMap.date, columnMap.description, columnMap.amount)) continue;

    try {
      const dateStr = fields[columnMap.date];
      const description = fields[columnMap.description];
      const amountStr = fields[columnMap.amount];
      
      const date = parseDateString(dateStr);
      const amount = parseFloat(amountStr);

      // Final validation to ensure we parsed valid data
      if (date && description && !isNaN(amount)) {
        transactions.push({
          date,
          description,
          amount,
          // BofA credit card CSVs have correct signs: payments are positive, purchases are negative.
          category: await categorizeTransaction(description)
        });
      }
    } catch (error) {
      console.error(`Error parsing BofA Credit Card CSV line: "${line}"`, error);
    }
  }
  // --- END OF NEW ROBUST LOGIC ---

  console.log(`Found ${transactions.length} transactions in BofA Credit Card CSV.`);
  return transactions;
}



function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return fields;
}

// Add a generic statement parser for better coverage
async function parseGenericStatement(text) {
  const transactions = [];
  const lines = text.split('\n');

  // More generic patterns for different bank formats
  const transactionPatterns = [
    // Pattern for: Date Description Amount
    /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(.+?)\s+([-+]?\$?[\d,]+\.\d{2})$/,
    // Pattern for: MM/DD Description $Amount
    /^(\d{2}\/\d{2})\s+(.+?)\s+(\$?[-+]?[\d,]+\.\d{2})$/,
    // Pattern for transactions with leading spaces
    /^\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(.+?)\s+([-+]?\$?[\d,]+\.\d{2})\s*$/,
    // Pattern for: Date Description Credit/Debit Amount
    /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(.+?)\s+(DEBIT|CREDIT)\s+([\d,]+\.\d{2})$/i
  ];

  const currentYear = new Date().getFullYear();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.length < 10) continue;

    for (const pattern of transactionPatterns) {
      const match = line.match(pattern);
      if (match) {
        try {
          let dateStr, description, amountStr, transactionType;

          if (match.length === 5) {
            // Pattern with DEBIT/CREDIT
            [, dateStr, description, transactionType, amountStr] = match;
            if (transactionType.toUpperCase() === 'DEBIT') {
              amountStr = '-' + amountStr;
            }
          } else {
            [, dateStr, description, amountStr] = match;
          }

          // Clean up description
          description = description.trim().replace(/\s+/g, ' ');

          // Skip obvious headers or invalid descriptions
          if (description.length < 3 ||
              /^(date|description|amount|transaction|balance)/i.test(description)) {
            continue;
          }

          // Parse date with better year handling
          let date = parseDateString(dateStr, currentYear);
          if (!date) continue;

          // Parse amount
          let amount = parseFloat(amountStr.replace(/[\$,]/g, ''));
          if (isNaN(amount)) continue;

          // Categorize transaction
          const category = await categorizeTransaction(description);

          transactions.push({
            date,
            description,
            amount,
            category
          });

        } catch (error) {
          console.log(`Error parsing line: ${line}`, error);
        }
        break;
      }
    }
  }

  return transactions;
}

// Helper function to parse date strings more reliably
function parseDateString(dateStr, currentYear = new Date().getFullYear()) {
  if (!dateStr) return null;

  // Remove quotes and clean up
  dateStr = dateStr.replace(/"/g, '').trim();

  // Try various date formats
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
    /^(\d{2})\/(\d{2})\/(\d{4})$/, // MM/DD/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/, // M/D/YY or M/D/YYYY
    /^(\d{2})-(\d{2})-(\d{4})$/, // MM-DD-YYYY
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/, // MM/DD/YYYY or M/D/YYYY
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/, // MM/DD/YY or M/D/YY
    /^(\d{1,2})[\/\-](\d{1,2})$/ // MM/DD or M/D
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      let [, p1, p2, p3] = match;
      let year, month, day;

      // Handle different formats
      if (format.source.includes('(\\d{4})')) {
        if (format.source.startsWith('^(\\d{4})')) {
          // First part is year (YYYY-MM-DD)
          year = p1;
          month = p2;
          day = p3;
        } else {
          // Last part is year (MM/DD/YYYY)
          month = p1;
          day = p2;
          year = p3;
        }
      } else if (p3) {
        // MM/DD/YY format
        month = p1;
        day = p2;
        year = p3.length === 2 ? (parseInt(p3) > 50 ? `19${p3}` : `20${p3}`) : p3;
      } else {
        // MM/DD format (no year)
        month = p1;
        day = p2;
        year = currentYear;
      }

      // Create date and validate
      const date = new Date(year, month - 1, day);
      if (date.getMonth() === month - 1 && date.getDate() == day) {
        return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
      }
    }
  }

  return null;
}

async function categorizeTransaction(description) {
  // 1. First, try to find a user-mapped category
  const matching = await new Promise((resolve, reject) => {
    db.get(
      "SELECT category FROM merchant_category_map WHERE ? LIKE '%' || description_substring || '%'",
      [description],
      (err, row) => {
        if (err) return resolve(null); // fallback to default
        resolve(row ? row.category : null);
      }
    );
  });
  if (matching) return matching;

  // 2. Fallback to keyword-based logic
  const desc = description.toLowerCase();

  // Food & Dining
  if (desc.includes('restaurant') || desc.includes('cafe') || desc.includes('coffee') ||
      desc.includes('mcdonald') || desc.includes('burger') || desc.includes('pizza') ||
      desc.includes('starbucks') || desc.includes('food') || desc.includes('dining') ||
      desc.includes('bar ') || desc.includes('pub ') || desc.includes('grocery') ||
      desc.includes('supermarket') || desc.includes('safeway') || desc.includes('kroger')) {
    return 'Food & Dining';
  }

  // Transportation
  if (desc.includes('gas ') || desc.includes('fuel') || desc.includes('uber') ||
      desc.includes('lyft') || desc.includes('taxi') || desc.includes('parking') ||
      desc.includes('metro') || desc.includes('transit') || desc.includes('airline') ||
      desc.includes('car wash') || desc.includes('auto ')) {
    return 'Transportation';
  }

  // Shopping
  if (desc.includes('amazon') || desc.includes('walmart') || desc.includes('target') ||
      desc.includes('mall ') || desc.includes('store') || desc.includes('shop') ||
      desc.includes('retail') || desc.includes('clothing') || desc.includes('fashion')) {
    return 'Shopping';
  }

  // Bills & Utilities
  if (desc.includes('electric') || desc.includes('utility') || desc.includes('water') ||
      desc.includes('internet') || desc.includes('phone') || desc.includes('cable') ||
      desc.includes('insurance') || desc.includes('mortgage') || desc.includes('rent')) {
    return 'Bills & Utilities';
  }

  // Entertainment
  if (desc.includes('netflix') || desc.includes('spotify') || desc.includes('movie') ||
      desc.includes('theater') || desc.includes('gaming') || desc.includes('subscription') ||
      desc.includes('entertainment') || desc.includes('music')) {
    return 'Entertainment';
  }

  // Healthcare
  if (desc.includes('pharmacy') || desc.includes('doctor') || desc.includes('medical') ||
      desc.includes('hospital') || desc.includes('health') || desc.includes('dental')) {
    return 'Healthcare';
  }

  // Income (payments, deposits)
  if (desc.includes('payment') || desc.includes('deposit') || desc.includes('salary') ||
      desc.includes('payroll') || desc.includes('refund') || desc.includes('credit')) {
    return 'Income';
  }

  // Default category
  return 'Shopping';
}

// File upload endpoint with better error handling and debugging (protected)
app.post('/api/upload-statement', authenticateToken, upload.single('file'), validationRules.uploadValidation, handleValidationErrors, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, buffer, mimetype } = req.file;
    let transactions = [];

    console.log(`Processing file: ${originalname}, size: ${buffer.length} bytes, type: ${mimetype}`);

    if (mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf')) {
        // Parse PDF
        try {
          const data = await pdf(buffer);
          const text = data.text;
          const lowerCaseText = text.toLowerCase();

          console.log('PDF text extracted, length:', text.length);
          
          // --- NEW, MASTER PDF CONTROLLER LOGIC ---

          // Attempt to identify the bank and use the correct parser
          if (lowerCaseText.includes('apple card') && lowerCaseText.includes('goldman sachs')) {
              console.log('Detected Apple Card statement. Using Apple Card parser.');
              transactions = await parseAppleCardStatement(text);
          } else if (lowerCaseText.includes('bank of america')) {
              console.log('Detected Bank of America statement. Using BofA parser.');
              transactions = await parseEnhancedStatement(text);
          } else if (lowerCaseText.includes('chase') && lowerCaseText.includes('checking summary')) {
              console.log('Detected Chase Checking statement. Using Chase Checking parser.');
              transactions = await parseChaseCheckingStatement(text);
          } else if (lowerCaseText.includes('chase')) {
              console.log('Detected Chase Credit Card statement. Using Chase Credit Card parser.');
              transactions = await parseChaseCreditCardStatement(text);
          }

          // If no bank-specific parser worked, try the generic one as a fallback
          if (transactions.length === 0) {
            console.log('Bank-specific parser found no transactions. Trying generic fallback...');
            transactions = await parseGenericStatement(text);
            console.log(`Generic fallback parser found ${transactions.length} transactions`);
          }
          
        } catch (pdfError) {
        console.error('PDF parsing error:', pdfError);
        return res.status(400).json({
          error: 'Failed to parse PDF file. Please ensure it\'s a text-based PDF (not scanned image).',
          details: pdfError.message
        });
      }

    } else if (mimetype === 'text/csv' || originalname.toLowerCase().endsWith('.csv')) {
      // Parse CSV
      try {
        let text = buffer.toString('utf-8'); // Use 'let' so we can modify it

        // --- FIX: REMOVE THE BYTE ORDER MARK (BOM) ---
        // Some bank CSVs (especially from Windows) start with this invisible character,
        // which breaks header matching. This removes it if it exists.
        if (text.charCodeAt(0) === 0xFEFF) {
          console.log('Detected and removed BOM from CSV file.');
          text = text.substring(1);
        }
        // --- END OF FIX ---

        console.log('CSV content preview:', text.substring(0, 500));
        const lowerCaseText = text.toLowerCase();

        // The rest of your logic for detecting which parser to use stays the same.
        // It will now work correctly because the BOM is gone.

        // Check for Chase CSVs first (more specific patterns)
        if (lowerCaseText.includes('posting date') && lowerCaseText.includes('type') && lowerCaseText.includes('check or slip #')) {
          console.log('Detected Chase Checking CSV. Using specialized parser.');
          transactions = await parseChaseCheckingCSV(text);
        } else if (lowerCaseText.includes('transaction date') && lowerCaseText.includes('category') && lowerCaseText.includes('post date')) {
          console.log('Detected Chase Credit Card CSV. Using specialized parser.');
          transactions = await parseChaseCreditCardCSV(text);
        
        // Then check for Bank of America CSVs
        } else if (lowerCaseText.includes('posted date') && lowerCaseText.includes('reference number') && lowerCaseText.includes('payee')) {
          console.log('Detected Bank of America Credit Card CSV. Using specialized parser.');
          transactions = await parseBofACreditCardCSV(text);
        } else if (lowerCaseText.includes('running bal.') && lowerCaseText.includes('date,description,amount')) {
          console.log('Detected Bank of America Checking CSV. Using specialized parser.');
          transactions = await parseBofACheckingCSV(text);
          
          // If BofA parser didn't work, try the generic CSV parser
          if (transactions.length === 0) {
            console.log('BofA parser found no transactions, trying generic CSV parser...');
            transactions = await parseCSVStatement(text);
          }

        // Generic CSV fallback
        } else if (lowerCaseText.includes('posting date') && lowerCaseText.includes('check or slip')) {
          console.log('Detected Chase Checking CSV. Using specialized parser.');
          transactions = await parseChaseCheckingCSV(text);

        // Fallback for any other CSV format
        } else {
          console.log('Using generic CSV parser.');
          transactions = await parseCSVStatement(text);
        }

      } catch (csvError) {
        console.error('CSV parsing error:', csvError);
        return res.status(400).json({
          error: 'Failed to parse CSV file. Please check the file format.',
          details: csvError.message
        });
      }
    } else {
      return res.status(400).json({
        error: 'Unsupported file format. Please upload PDF or CSV files only.'
      });
    }

    if (transactions.length === 0) {
      return res.status(400).json({
        error: 'No transactions found in the file. Please check if this is a bank statement with transaction data.',
        debug: {
          fileName: originalname,
          fileSize: buffer.length,
          fileType: mimetype
        }
      });
    }

    // Return transactions for preview
    res.json({
      message: `Found ${transactions.length} transactions`,
      transactions: transactions,
      totalCount: transactions.length,
      fileName: originalname,
      fileType: mimetype
    });

  } catch (error) {
    console.error('Upload processing error:', error);
    res.status(500).json({
      error: 'Failed to process file: ' + error.message,
      details: error.stack
    });
  }
});

// Debug endpoint to see raw PDF text extraction (protected)
app.post('/api/debug-pdf', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, buffer, mimetype } = req.file;

    if (mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf')) {
      try {
        const data = await pdf(buffer);
        const text = data.text;

        console.log('=== PDF DEBUG INFO ===');
        console.log('File:', originalname);
        console.log('Size:', buffer.length, 'bytes');
        console.log('Text length:', text.length);
        console.log('=== FULL EXTRACTED TEXT ===');
        console.log(text);
        console.log('=== END TEXT ===');

        // Split into lines and show structure
        const lines = text.split('\n');
        console.log('=== LINE BY LINE ===');
        lines.forEach((line, index) => {
          if (line.trim()) {
            console.log(`Line ${index + 1}: "${line.trim()}"`);
          }
        });
        console.log('=== END LINES ===');

        res.json({
          fileName: originalname,
          textLength: text.length,
          totalLines: lines.length,
          nonEmptyLines: lines.filter(l => l.trim()).length,
          firstLinesPreview: lines.slice(0, 20).filter(l => l.trim()),
          fullText: text // WARNING: This could be large
        });

      } catch (pdfError) {
        console.error('PDF parsing error:', pdfError);
        res.status(400).json({ error: 'Failed to parse PDF', details: pdfError.message });
      }
    } else {
      res.status(400).json({ error: 'Only PDF files supported for debug' });
    }

  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ error: 'Debug failed: ' + error.message });
  }
});

// Improved import transactions endpoint (protected)
app.post('/api/import-transactions', authenticateToken, validationRules.importTransactions, handleValidationErrors, async (req, res) => {
  const { transactions, accountName } = req.body;

  if (!transactions || !Array.isArray(transactions)) {
    return res.status(400).json({ error: 'Invalid transactions data' });
  }

  if (!accountName) {
    return res.status(400).json({ error: 'Account name is required' });
  }

  // Process transactions and ensure dates are handled consistently
  const processedTransactions = transactions.map(t => {
    // First convert the date string to a Date object in UTC
    const dateStr = t.date;
    // Handle date strings in MM/DD/YYYY format
    const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    let date;
    if (match) {
      // If it's in MM/DD/YYYY format, construct date in UTC
      const [, month, day, year] = match;
      date = new Date(Date.UTC(year, month - 1, day));
    } else {
      // For other formats, parse as UTC
      date = new Date(dateStr + 'T00:00:00Z');
    }
    
    return {
      ...t,
      // Store the date in YYYY-MM-DD format
      date: date.toISOString().split('T')[0]
    };
  });

  // First, verify the account exists
  db.get("SELECT id, name, type FROM accounts WHERE name = ?", [accountName], (err, account) => {
    if (err) {
      console.error('Error checking account:', err);
      return res.status(500).json({ error: 'Database error while checking account' });
    }

    if (!account) {
      return res.status(400).json({ 
        error: `Account "${accountName}" not found. Please create the account first or select a different account.` 
      });
    }

    console.log(`Importing ${transactions.length} transactions to account: ${accountName} (${account.type})`);

    let importedCount = 0;
    let skippedCount = 0;
    let errors = [];
    let processed = 0;

    // Process each transaction
    const processTransaction = (transaction, index) => {
      return new Promise((resolve) => {
        const { date, description, amount, category } = transaction;

        if (!date || !description || amount === undefined || !category) {
          errors.push(`Transaction ${index + 1}: Missing required fields (date, description, amount, or category)`);
          skippedCount++;
          resolve();
          return;
        }

        // Validate date format strictly
        if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          errors.push(`Transaction ${index + 1}: Invalid date format. Expected YYYY-MM-DD but got (${date})`);
          skippedCount++;
          resolve();
          return;
        }
        
        // Additional validation to ensure date is valid
        const [year, month, day] = date.split('-').map(Number);
        const parsedDate = new Date(Date.UTC(year, month - 1, day));
        if (isNaN(parsedDate.getTime()) || 
            parsedDate.getUTCFullYear() !== year || 
            parsedDate.getUTCMonth() !== month - 1 || 
            parsedDate.getUTCDate() !== day) {
          errors.push(`Transaction ${index + 1}: Invalid date value (${date})`);
          skippedCount++;
          resolve();
          return;
        }

        // Validate amount
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount)) {
          errors.push(`Transaction ${index + 1}: Invalid amount (${amount})`);
          skippedCount++;
          resolve();
          return;
        }

        // Check for potential duplicates (same date, description, and amount)
        db.get(
          "SELECT COUNT(*) as count FROM transactions WHERE date = ? AND description = ? AND amount = ? AND account_name = ?",
          [date, description, numericAmount, accountName],
          (dupErr, dupResult) => {
            if (dupErr) {
              console.error(`Error checking for duplicates for transaction ${index + 1}:`, dupErr);
              errors.push(`Transaction ${index + 1}: Database error checking for duplicates`);
              skippedCount++;
              resolve();
              return;
            }

            if (dupResult.count > 0) {
              console.log(`Skipping potential duplicate transaction: ${description} (${date})`);
              errors.push(`Transaction ${index + 1}: Potential duplicate found, skipped`);
              skippedCount++;
              resolve();
              return;
            }

            // Insert the transaction
            db.run(
              "INSERT INTO transactions (date, description, amount, category, account_name) VALUES (?, ?, ?, ?, ?)",
              [date, description, numericAmount, category, accountName], 
              function(err) {
                if (err) {
                  console.error(`Error inserting transaction ${index + 1}:`, err);
                  errors.push(`Transaction ${index + 1}: Database error - ${err.message}`);
                  skippedCount++;
                } else {
                  importedCount++;

                  // Update account balance
                  db.run("UPDATE accounts SET balance = balance + ? WHERE name = ?", [numericAmount, accountName], (updateErr) => {
                    if (updateErr) {
                      console.error('Error updating account balance:', updateErr);
                      // Note: We don't fail the transaction import if balance update fails
                    }
                  });

                  // Update budget if expense (negative amount)
                  if (numericAmount < 0) {
                    db.run(`UPDATE budgets SET
                      spent = spent + ?,
                      remaining = budgeted - spent
                      WHERE category = ?`,
                      [Math.abs(numericAmount), category], (budgetErr) => {
                      if (budgetErr) {
                        console.error('Error updating budget:', budgetErr);
                        // Note: We don't fail the transaction import if budget update fails
                      }
                    });
                  }
                }

                processed++;
                resolve();
              }
            );
          }
        );
      });
    };

    // Process all transactions
    Promise.all(transactions.map(processTransaction)).then(() => {
      console.log(`Import complete: ${importedCount}/${transactions.length} transactions imported to ${accountName}`);

      const response = {
        message: `Successfully imported ${importedCount} out of ${transactions.length} transactions to ${accountName}`,
        importedCount,
        skippedCount,
        totalCount: transactions.length,
        accountName: accountName,
        accountType: account.type
      };

      // Only include errors if there are any, and limit the number shown
      if (errors.length > 0) {
        response.errors = errors.slice(0, 10); // Show first 10 errors
        if (errors.length > 10) {
          response.errors.push(`... and ${errors.length - 10} more errors`);
        }
      }

      res.json(response);
    });
  });
});

// Get available accounts for import dropdown (protected)
app.get('/api/accounts/for-import', authenticateToken, (req, res) => {
  db.all("SELECT id, name, type, institution FROM accounts WHERE user_id = ? OR user_id IS NULL ORDER BY name", [req.userId], (err, rows) => {
    if (err) {
      console.error('Error fetching accounts for import:', err);
      res.status(500).json({ error: err.message });
    } else {
      // Return accounts with additional info for better UX
      const accountsForImport = rows.map(account => ({
        id: account.id,
        name: account.name,
        type: account.type,
        institution: account.institution,
        displayName: `${account.name} (${account.type} - ${account.institution})`
      }));
      res.json(accountsForImport);
    }
  });
});

// Import history tracking (protected)
app.get('/api/import-history', authenticateToken, (req, res) => {
  // This would require a new table to track import history
  // For now, we can return recent transactions grouped by account
  db.all(`
    SELECT 
      account_name,
      COUNT(*) as transaction_count,
      MAX(created_at) as last_import,
      MIN(date) as earliest_transaction,
      MAX(date) as latest_transaction
    FROM transactions 
    WHERE created_at >= date('now', '-30 days')
    GROUP BY account_name
    ORDER BY last_import DESC
  `, (err, rows) => {
    if (err) {
      console.error('Error fetching import history:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});


// Admin interface route
app.get('/admin', (req, res) => {
  const adminHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FinanceFlow Pro - Data Management</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #2196F3; text-align: center; }
        h2 { color: #555; border-bottom: 2px solid #eee; padding-bottom: 10px; }
        .section { margin: 30px 0; }
        .btn {
            background: #2196F3;
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 5px;
            cursor: pointer;
            margin: 10px 5px;
            font-size: 14px;
        }
        .btn:hover { background: #1976D2; }
        .btn.danger { background: #f44336; }
        .btn.danger:hover { background: #d32f2f; }
        .btn.success { background: #4CAF50; }
        .btn.success:hover { background: #45a049; }
        .status {
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            display: none;
        }
        .status.success { background: #dff0d8; color: #3c763d; border: 1px solid #d6e9c6; }
        .status.error { background: #f2dede; color: #a94442; border: 1px solid #ebccd1; }
        .info {
            background: #d1ecf1;
            color: #0c5460;
            padding: 15px;
            border-radius: 5px;
            border: 1px solid #bee5eb;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🏦 FinanceFlow Pro - Data Management</h1>

        <div class="info">
            <strong>📍 Current Status:</strong> Connected to API with PDF parsing support
        </div>

        <div id="status" class="status"></div>

        <div class="section">
            <h2>🗄️ Database Management</h2>
            <button class="btn success" onclick="resetToSample()">Reset to Sample Data</button>
            <button class="btn danger" onclick="clearAllData()">Clear All Data</button>
        </div>

        <div class="section">
            <h2>📄 Test File Upload</h2>
            <p>Upload a PDF or CSV file to test the parsing functionality</p>
            <input type="file" id="testFile" accept=".pdf,.csv">
            <button class="btn" onclick="testUpload()">Test Upload & Parse</button>
            <div id="uploadResult" style="margin-top: 15px;"></div>
        </div>
    </div>

    <script>
        const API_BASE = 'http://localhost:${PORT}/api';

        function showStatus(message, type = 'success') {
            const status = document.getElementById('status');
            status.textContent = message;
            status.className = \`status \${type}\`;
            status.style.display = 'block';
            setTimeout(() => status.style.display = 'none', 5000);
        }

        async function testUpload() {
            const fileInput = document.getElementById('testFile');
            const resultDiv = document.getElementById('uploadResult');

            if (!fileInput.files[0]) {
                showStatus('Please select a file first', 'error');
                return;
            }

            const formData = new FormData();
            formData.append('file', fileInput.files[0]);

            try {
                const response = await fetch(\`\${API_BASE}/upload-statement\`, {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (response.ok) {
                    resultDiv.innerHTML = \`
                        <div style="background: #dff0d8; padding: 10px; border-radius: 5px;">
                            <strong>✅ Success!</strong><br>
                            Found \${result.totalCount} transactions<br>
                            <small>Preview of first few transactions:</small>
                            <pre style="font-size: 12px; margin-top: 10px;">\${JSON.stringify(result.transactions.slice(0, 3), null, 2)}</pre>
                        </div>
                    \`;
                    showStatus(\`Successfully parsed \${result.totalCount} transactions!\`);
                } else {
                    resultDiv.innerHTML = \`
                        <div style="background: #f2dede; padding: 10px; border-radius: 5px;">
                            <strong>❌ Error:</strong> \${result.error}
                        </div>
                    \`;
                    showStatus('Upload failed: ' + result.error, 'error');
                }
            } catch (error) {
                showStatus('Upload error: ' + error.message, 'error');
                resultDiv.innerHTML = \`
                    <div style="background: #f2dede; padding: 10px; border-radius: 5px;">
                        <strong>❌ Error:</strong> \${error.message}
                    </div>
                \`;
            }
        }

        async function resetToSample() {
            if (confirm('This will replace all data with sample data. Continue?')) {
                try {
                    const response = await fetch(\`\${API_BASE}/admin/reset-to-sample\`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    const result = await response.json();
                    showStatus('Database reset to sample data successfully!');
                } catch (error) {
                    showStatus('Reset failed: ' + error.message, 'error');
                }
            }
        }

        async function clearAllData() {
            if (confirm('⚠️ This will permanently delete ALL data. Are you sure?')) {
                if (confirm('⚠️ Last chance! This cannot be undone. Really delete everything?')) {
                    try {
                        const response = await fetch(\`\${API_BASE}/admin/clear-all-data\`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                        });
                        const result = await response.json();
                        showStatus('All data cleared successfully!');
                    } catch (error) {
                        showStatus('Clear failed: ' + error.message, 'error');
                    }
                }
            }
        }
    </script>
</body>
</html>`;

  res.send(adminHtml);
});

// Run database migrations
function runMigrations() {
  console.log('Running database migrations...');
  
  // Read and execute migration file
  const migrationPath = path.join(__dirname, 'database', 'migrations', '001_add_users_table.sql');
  
  if (fs.existsSync(migrationPath)) {
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = migrationSQL.split(';').filter(stmt => stmt.trim().length > 0);
    
    db.serialize(() => {
      statements.forEach((statement, index) => {
        db.run(statement.trim(), (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            console.error(`Migration statement ${index + 1} error:`, err.message);
          }
        });
      });
    });
    
    console.log('Database migrations completed');
  } else {
    console.log('No migration file found, skipping migrations');
  }

  // Create merchant category mapping table if it doesn't exist
  db.run(`CREATE TABLE IF NOT EXISTS merchant_category_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description_substring TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

// Initialize database with tables
function initializeDatabase() {
  db.serialize(() => {
    // Create tables
    db.run(`CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      balance REAL NOT NULL,
      institution TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      account_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL UNIQUE,
      budgeted REAL NOT NULL,
      spent REAL DEFAULT 0,
      remaining REAL DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target REAL NOT NULL,
      current REAL DEFAULT 0,
      deadline DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS investments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      shares REAL NOT NULL,
      value REAL NOT NULL,
      gain_loss TEXT
    )`);

    // Only insert sample data if LOAD_SAMPLE_DATA is true in .env
    if (process.env.LOAD_SAMPLE_DATA === 'true') {
      insertSampleData();
    } else {
      console.log('Skipping sample data insertion (set LOAD_SAMPLE_DATA=true in .env to load sample data)');
    }
  });
}

function insertSampleData() {
  // Check if data already exists
  db.get("SELECT COUNT(*) as count FROM accounts", (err, row) => {
    if (err || row.count > 0) return;

    console.log('Inserting sample data...');

    // Sample accounts - CUSTOMIZE THESE WITH YOUR OWN DATA
    const accounts = [
      { name: "Chase Credit Card", type: "credit", balance: -500.00, institution: "Chase Bank" },
      { name: "Main Checking", type: "checking", balance: 2500.00, institution: "Your Bank" },
      { name: "Savings", type: "savings", balance: 10000.00, institution: "Your Bank" }
    ];

    accounts.forEach(account => {
      db.run("INSERT INTO accounts (name, type, balance, institution) VALUES (?, ?, ?, ?)",
        [account.name, account.type, account.balance, account.institution]);
    });

    console.log('Sample data inserted successfully');
  });
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'FinanceFlow Pro API is running with PDF parsing support' });
});

// NOTE: Admin endpoints have been removed for security
// Use the main app's account management instead

// Accounts (protected routes)
app.get('/api/accounts', authenticateToken, (req, res) => {
  const userId = req.userId;
  db.all("SELECT * FROM accounts WHERE user_id = ? OR user_id IS NULL ORDER BY id", [userId], (err, rows) => {
    if (err) {
      console.error('Error fetching accounts:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/accounts', authenticateToken, validationRules.createAccount, handleValidationErrors, (req, res) => {
  const { name, type, balance, institution } = req.body;

  if (!name || !type || balance === undefined || !institution) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run("INSERT INTO accounts (name, type, balance, institution, user_id) VALUES (?, ?, ?, ?, ?)",
    [name, type, balance, institution, req.userId], function(err) {
    if (err) {
      console.error('Error creating account:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json({ id: this.lastID, message: "Account created successfully" });
    }
  });
});

// Transactions (protected routes)
app.get('/api/transactions', authenticateToken, validationRules.getTransactions, handleValidationErrors, (req, res) => {
  const { category, account, dateFrom, dateTo } = req.query;
  let query = "SELECT t.* FROM transactions t LEFT JOIN accounts a ON t.account_name = a.name WHERE (a.user_id = ? OR a.user_id IS NULL)";
  let params = [req.userId];

  if (category) {
    query += " AND category = ?";
    params.push(category);
  }
  if (account) {
    query += " AND account_name = ?";
    params.push(account);
  }
  if (dateFrom) {
    query += " AND date >= ?";
    params.push(dateFrom);
  }
  if (dateTo) {
    query += " AND date <= ?";
    params.push(dateTo);
  }

  query += " ORDER BY date DESC";

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching transactions:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/transactions', authenticateToken, validationRules.createTransaction, handleValidationErrors, (req, res) => {
  const { date, description, amount, category, account_name } = req.body;

  if (!date || !description || amount === undefined || !category || !account_name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run("INSERT INTO transactions (date, description, amount, category, account_name) VALUES (?, ?, ?, ?, ?)",
    [date, description, amount, category, account_name], function(err) {
    if (err) {
      console.error('Error creating transaction:', err);
      res.status(500).json({ error: err.message });
    } else {
      // Update account balance
      const balanceChange = parseFloat(amount);
      db.run("UPDATE accounts SET balance = balance + ? WHERE name = ?", [balanceChange, account_name], (updateErr) => {
        if (updateErr) {
          console.error('Error updating account balance:', updateErr);
        }
      });

      // Update budget spent amount if it's an expense
      if (balanceChange < 0) {
        db.run(`UPDATE budgets SET
          spent = spent + ?,
          remaining = budgeted - spent
          WHERE category = ?`,
          [Math.abs(balanceChange), category], (budgetErr) => {
          if (budgetErr) {
            console.error('Error updating budget:', budgetErr);
          }
        });
      }

      res.json({ id: this.lastID, message: "Transaction added successfully" });
    }
  });
});

app.put('/api/transactions/:id', authenticateToken, validationRules.updateTransaction, handleValidationErrors, (req, res) => {
  const { id } = req.params;
  const { date, description, amount, category, account_name } = req.body;

  if (!date || !description || amount === undefined || !category || !account_name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Get the old transaction first to reverse its effects
  db.get("SELECT * FROM transactions WHERE id = ?", [id], (err, oldTransaction) => {
    if (err) {
      console.error('Error fetching old transaction:', err);
      return res.status(500).json({ error: err.message });
    }

    if (!oldTransaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Update the transaction
    db.run("UPDATE transactions SET date = ?, description = ?, amount = ?, category = ?, account_name = ? WHERE id = ?",
      [date, description, amount, category, account_name, id], function(updateErr) {
      if (updateErr) {
        console.error('Error updating transaction:', updateErr);
        res.status(500).json({ error: updateErr.message });
      } else {
        // Reverse old account balance effect
        db.run("UPDATE accounts SET balance = balance - ? WHERE name = ?",
          [oldTransaction.amount, oldTransaction.account_name], (reverseErr) => {
          if (reverseErr) {
            console.error('Error reversing old account balance:', reverseErr);
          }
        });

        // Apply new account balance effect
        db.run("UPDATE accounts SET balance = balance + ? WHERE name = ?",
          [parseFloat(amount), account_name], (newErr) => {
          if (newErr) {
            console.error('Error applying new account balance:', newErr);
          }
        });

        res.json({ message: "Transaction updated successfully" });
      }
    });
  });
});

app.delete('/api/transactions/:id', authenticateToken, [commonValidation.id()], handleValidationErrors, (req, res) => {
  const { id } = req.params;

  // First get the transaction and verify it belongs to the user
  db.get("SELECT t.* FROM transactions t LEFT JOIN accounts a ON t.account_name = a.name WHERE t.id = ? AND (a.user_id = ? OR a.user_id IS NULL)", [id, req.userId], (err, transaction) => {
    if (err) {
      console.error('Error fetching transaction for deletion:', err);
      return res.status(500).json({ error: err.message });
    }

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Delete the transaction
    db.run("DELETE FROM transactions WHERE id = ?", [id], function(deleteErr) {
      if (deleteErr) {
        console.error('Error deleting transaction:', deleteErr);
        res.status(500).json({ error: deleteErr.message });
      } else {
        // Reverse the account balance change
        db.run("UPDATE accounts SET balance = balance - ? WHERE name = ?",
          [transaction.amount, transaction.account_name], (updateErr) => {
          if (updateErr) {
            console.error('Error reversing account balance:', updateErr);
          }
        });

        res.json({ message: "Transaction deleted successfully" });
      }
    });
  });
});

// Dashboard summary (protected route)
app.get('/api/dashboard', authenticateToken, (req, res) => {
  const summary = {};

  // Get total balance for user's accounts only
  db.get("SELECT ROUND(SUM(balance), 2) as total_balance FROM accounts WHERE user_id = ?", [req.userId], (err, row) => {
    if (err) {
      console.error('Error fetching dashboard data:', err);
      res.status(500).json({ error: err.message });
    } else {
      summary.total_balance = row.total_balance || 0;

      // Get recent transactions for expense calculation (user's transactions only)
      // Use last 90 days to capture more data for meaningful calculations
      db.all(`SELECT ROUND(SUM(amount), 2) as total_expenses FROM transactions 
              WHERE amount < 0 AND date >= date('now', '-90 days') 
              AND account_name IN (SELECT name FROM accounts WHERE user_id = ?)`, [req.userId], (expenseErr, expenseRow) => {
        if (expenseErr) {
          console.error('Error calculating expenses:', expenseErr);
        }

        // Get recent income (user's transactions only)
        // Use last 90 days to capture more data for meaningful calculations
        db.all(`SELECT ROUND(SUM(amount), 2) as total_income FROM transactions 
                WHERE amount > 0 AND date >= date('now', '-90 days') 
                AND account_name IN (SELECT name FROM accounts WHERE user_id = ?)`, [req.userId], (incomeErr, incomeRow) => {
          if (incomeErr) {
            console.error('Error calculating income:', incomeErr);
          }

          const monthlyExpenses = Math.abs(expenseRow?.[0]?.total_expenses || 0);
          const monthlyIncome = incomeRow?.[0]?.total_income || 0;
          const savingsAmount = Math.round((monthlyIncome - monthlyExpenses) * 100) / 100;
          const savingsRate = monthlyIncome > 0 ? Math.round(((savingsAmount / monthlyIncome) * 100) * 10) / 10 : 0;

          // Generate realistic monthly data based on actual data or show empty state
          let monthlyData = [];
          
          if (monthlyIncome > 0 || monthlyExpenses > 0) {
            // If we have some data, create 6 months with some variation
            const baseIncome = monthlyIncome || 0;
            const baseExpenses = monthlyExpenses || 0;
            
            const months = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            monthlyData = months.map((month, index) => {
              // Add some realistic variation (±10%)
              const incomeVariation = baseIncome * (0.9 + Math.random() * 0.2);
              const expenseVariation = baseExpenses * (0.9 + Math.random() * 0.2);
              
              return {
                month: month,
                income: Math.round(incomeVariation),
                expenses: Math.round(expenseVariation),
                savings: Math.round(incomeVariation - expenseVariation)
              };
            });
            
            // Make sure the last month uses actual current data
            monthlyData[monthlyData.length - 1] = {
              month: "Dec",
              income: monthlyIncome,
              expenses: monthlyExpenses,
              savings: savingsAmount
            };
          } else {
            // If no data at all, return empty months
            const months = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            monthlyData = months.map(month => ({
              month: month,
              income: 0,
              expenses: 0,
              savings: 0
            }));
          }

          summary.monthly_data = monthlyData;
          summary.monthly_income = monthlyIncome; // No fallback - show actual $0
          summary.monthly_expenses = monthlyExpenses; // No fallback - show actual $0
          summary.savings_rate = savingsRate;

          res.json(summary);
        });
      });
    }
  });
});

// Budgets (protected routes)
app.get('/api/budgets', authenticateToken, (req, res) => {
  db.all("SELECT * FROM budgets WHERE user_id = ? OR user_id IS NULL ORDER BY category", [req.userId], (err, rows) => {
    if (err) {
      console.error('Error fetching budgets:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/budgets', authenticateToken, validationRules.createBudget, handleValidationErrors, (req, res) => {
  const { category, budgeted } = req.body;

  if (!category || budgeted === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run("INSERT OR REPLACE INTO budgets (category, budgeted, spent, remaining, user_id) VALUES (?, ?, 0, ?, ?)",
    [category, budgeted, budgeted, req.userId], function(err) {
    if (err) {
      console.error('Error creating/updating budget:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json({ message: "Budget updated successfully" });
    }
  });
});

// Goals (protected routes)
app.get('/api/goals', authenticateToken, (req, res) => {
  db.all("SELECT * FROM goals WHERE user_id = ? OR user_id IS NULL ORDER BY deadline", [req.userId], (err, rows) => {
    if (err) {
      console.error('Error fetching goals:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/goals', authenticateToken, validationRules.createGoal, handleValidationErrors, (req, res) => {
  const { name, target, current, deadline } = req.body;

  if (!name || target === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run("INSERT INTO goals (name, target, current, deadline, user_id) VALUES (?, ?, ?, ?, ?)",
    [name, target, current || 0, deadline, req.userId], function(err) {
    if (err) {
      console.error('Error creating goal:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json({ id: this.lastID, message: "Goal created successfully" });
    }
  });
});

app.put('/api/goals/:id', authenticateToken, validationRules.updateGoal, handleValidationErrors, (req, res) => {
  const { id } = req.params;
  const { current } = req.body;

  if (current === undefined) {
    return res.status(400).json({ error: 'Current amount is required' });
  }

  db.run("UPDATE goals SET current = ? WHERE id = ?", [current, id], function(err) {
    if (err) {
      console.error('Error updating goal:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json({ message: "Goal updated successfully" });
    }
  });
});

app.delete('/api/goals/:id', authenticateToken, [commonValidation.id()], handleValidationErrors, (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM goals WHERE id = ?", [id], function(err) {
    if (err) {
      console.error('Error deleting goal:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json({ message: "Goal deleted successfully" });
    }
  });
});

// Investments (protected routes)
app.get('/api/investments', authenticateToken, (req, res) => {
  db.all("SELECT * FROM investments WHERE user_id = ? OR user_id IS NULL ORDER BY symbol", [req.userId], (err, rows) => {
    if (err) {
      console.error('Error fetching investments:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/investments', authenticateToken, validationRules.createInvestment, handleValidationErrors, (req, res) => {
  const { symbol, name, shares, value, gain_loss } = req.body;

  if (!symbol || !name || shares === undefined || value === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run("INSERT INTO investments (symbol, name, shares, value, gain_loss, user_id) VALUES (?, ?, ?, ?, ?, ?)",
    [symbol, name, shares, value, gain_loss || "0%", req.userId], function(err) {
    if (err) {
      console.error('Error creating investment:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json({ id: this.lastID, message: "Investment added successfully" });
    }
  });
});

// Categories endpoint
app.get('/api/categories', (req, res) => {
  const categories = [
    "Food & Dining", "Transportation", "Entertainment", "Bills & Utilities",
    "Shopping", "Healthcare", "Education", "Travel", "Income", "Transfer"
  ];
  res.json(categories);
});

// Enhanced chart data endpoint (protected route)
app.get('/api/charts/data', authenticateToken, (req, res) => {
  const userId = req.userId;

  // Get monthly income/expense data for the last 12 months
  const monthlyQuery = `
    SELECT 
      strftime('%Y-%m', date) as month,
      ROUND(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 2) as income,
      ROUND(ABS(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END)), 2) as expenses
    FROM transactions t 
    LEFT JOIN accounts a ON t.account_name = a.name 
    WHERE (a.user_id = ? OR a.user_id IS NULL) 
      AND date >= date('now', '-12 months')
    GROUP BY strftime('%Y-%m', date)
    ORDER BY month ASC
  `;

  // Get category breakdown for expenses
  const expenseCategoryQuery = `
    SELECT 
      category,
      ROUND(ABS(SUM(amount)), 2) as amount
    FROM transactions t 
    LEFT JOIN accounts a ON t.account_name = a.name 
    WHERE (a.user_id = ? OR a.user_id IS NULL) 
      AND amount < 0 
      AND date >= date('now', '-90 days')
    GROUP BY category
    ORDER BY amount DESC
  `;

  // Get intelligent income categorization
  const smartIncomeCategoryQuery = `
    SELECT 
      CASE
        -- Main income sources (salary, wages, employment)
        WHEN (LOWER(description) LIKE '%salary%' OR LOWER(description) LIKE '%payroll%' 
              OR LOWER(description) LIKE '%wages%' OR LOWER(description) LIKE '%employment%'
              OR LOWER(description) LIKE '%public partnership%' OR LOWER(description) LIKE '%employer%'
              OR (category = 'Income' AND amount > 1000)) 
        THEN '💼 Primary Income'
        
        -- Self transfers (transfers between own accounts)
        WHEN (LOWER(description) LIKE '%transfer%' OR LOWER(description) LIKE '%tfrfrom%'
              OR LOWER(description) LIKE '%tfrto%' OR LOWER(description) LIKE '%internal%'
              OR LOWER(description) LIKE '%zelle%' OR LOWER(description) LIKE '%venmo%'
              OR LOWER(description) LIKE '%self%' OR LOWER(description) LIKE '%own account%')
        THEN '🔄 Self Transfers'
        
        -- Loan disbursements
        WHEN (LOWER(description) LIKE '%loan%' OR LOWER(description) LIKE '%disbursement%'
              OR LOWER(description) LIKE '%credit line%' OR LOWER(description) LIKE '%advance%')
        THEN '🏦 Loan Disbursement'
        
        -- Investment/side income
        WHEN (LOWER(description) LIKE '%investment%' OR LOWER(description) LIKE '%dividend%'
              OR LOWER(description) LIKE '%interest%' OR LOWER(description) LIKE '%freelance%'
              OR LOWER(description) LIKE '%gig%' OR LOWER(description) LIKE '%side%')
        THEN '📈 Investment/Side Income'
        
        -- Refunds and reimbursements
        WHEN (LOWER(description) LIKE '%refund%' OR LOWER(description) LIKE '%reimburse%'
              OR LOWER(description) LIKE '%cashback%' OR LOWER(description) LIKE '%reward%')
        THEN '💰 Refunds/Rewards'
        
        ELSE '📊 Other Income'
      END as income_type,
      COUNT(*) as transaction_count,
      ROUND(SUM(amount), 2) as total_amount,
      ROUND(AVG(amount), 2) as avg_amount
    FROM transactions t 
    LEFT JOIN accounts a ON t.account_name = a.name 
    WHERE (a.user_id = ? OR a.user_id IS NULL) 
      AND amount > 0 
      AND date >= date('now', '-90 days')
      -- EXCLUDE credit card payments, loan payments, and other debt payments from income
      AND NOT (LOWER(description) LIKE '%credit card%payment%' OR LOWER(description) LIKE '%cc payment%'
               OR LOWER(description) LIKE '%visa payment%' OR LOWER(description) LIKE '%mastercard payment%'
               OR LOWER(description) LIKE '%loan%payment%' OR LOWER(description) LIKE '%mortgage payment%')
    GROUP BY income_type
    ORDER BY total_amount DESC
  `;
  
  // Get loan and debt payment tracking (including credit cards)
  const loanTrackingQuery = `
    SELECT 
      strftime('%Y-%m', date) as month,
      CASE
        WHEN LOWER(description) LIKE '%loan%payment%' OR LOWER(description) LIKE '%loan payment%'
             OR LOWER(description) LIKE '%student loan%' OR LOWER(description) LIKE '%mortgage%'
             OR LOWER(description) LIKE '%car payment%' OR LOWER(description) LIKE '%personal loan%'
             OR LOWER(description) LIKE '%credit card%payment%' OR LOWER(description) LIKE '%cc payment%'
             OR LOWER(description) LIKE '%visa payment%' OR LOWER(description) LIKE '%mastercard payment%'
        THEN 'Debt Payments'
        WHEN LOWER(description) LIKE '%loan%' AND amount > 0
        THEN 'Loan Disbursement'
        ELSE NULL
      END as payment_type,
      COUNT(*) as transaction_count,
      ROUND(SUM(ABS(amount)), 2) as amount
    FROM transactions t 
    LEFT JOIN accounts a ON t.account_name = a.name 
    WHERE (a.user_id = ? OR a.user_id IS NULL) 
      AND (LOWER(description) LIKE '%loan%' OR LOWER(description) LIKE '%mortgage%' 
           OR LOWER(description) LIKE '%credit card%' OR LOWER(description) LIKE '%cc payment%'
           OR LOWER(description) LIKE '%visa%' OR LOWER(description) LIKE '%mastercard%')
      AND date >= date('now', '-12 months')
      AND payment_type IS NOT NULL
    GROUP BY month, payment_type
    ORDER BY month ASC
  `;

  // Execute all queries
  db.all(monthlyQuery, [userId], (err, monthlyData) => {
    if (err) {
      console.error('Error fetching monthly data:', err);
      return res.status(500).json({ error: err.message });
    }

    db.all(expenseCategoryQuery, [userId], (expenseErr, expenseCategories) => {
      if (expenseErr) {
        console.error('Error fetching expense categories:', expenseErr);
        return res.status(500).json({ error: expenseErr.message });
      }

      db.all(smartIncomeCategoryQuery, [userId], (incomeErr, smartIncomeCategories) => {
        if (incomeErr) {
          console.error('Error fetching smart income categories:', incomeErr);
          return res.status(500).json({ error: incomeErr.message });
        }

        db.all(loanTrackingQuery, [userId], (loanErr, loanData) => {
          if (loanErr) {
            console.error('Error fetching loan data:', loanErr);
            return res.status(500).json({ error: loanErr.message });
          }

          // Format monthly data with proper month names
          const formattedMonthlyData = monthlyData.map(row => {
            const [year, month] = row.month.split('-');
            const monthName = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            return {
              month: monthName,
              income: row.income,
              expenses: row.expenses,
              net: row.income - row.expenses
            };
          });

          // Process loan data for visualization
          const loanSummary = loanData.reduce((acc, row) => {
            if (!acc[row.payment_type]) {
              acc[row.payment_type] = { total: 0, months: [], avgMonthly: 0 };
            }
            acc[row.payment_type].total += row.amount;
            acc[row.payment_type].months.push({ month: row.month, amount: row.amount });
            return acc;
          }, {});

          // Calculate loan insights (now includes credit card payments)
          const totalDebtPayments = loanSummary['Debt Payments']?.total || 0;
          const totalLoanDisbursements = loanSummary['Loan Disbursement']?.total || 0;
          const netLoanPosition = totalLoanDisbursements - totalDebtPayments;

          // Separate true income from self transfers and loans
          const trueIncomeCategories = smartIncomeCategories.filter(cat => 
            cat.income_type !== '🔄 Self Transfers' && cat.income_type !== '🏦 Loan Disbursement'
          );
          const selfTransferAmount = smartIncomeCategories.find(cat => cat.income_type === '🔄 Self Transfers')?.total_amount || 0;
          const loanDisbursementAmount = smartIncomeCategories.find(cat => cat.income_type === '🏦 Loan Disbursement')?.total_amount || 0;

          res.json({
            monthlyData: formattedMonthlyData,
            expenseCategories: expenseCategories,
            incomeCategories: trueIncomeCategories.map(cat => ({
              category: cat.income_type,
              total: cat.total_amount,
              count: cat.transaction_count,
              avg: cat.avg_amount
            })),
            loanTracking: {
              summary: loanSummary,
              totalPayments: totalDebtPayments, // Now includes credit card payments
              totalDisbursements: totalLoanDisbursements,
              netPosition: netLoanPosition,
              monthlyData: loanData
            },
            financialInsights: {
              selfTransferAmount: selfTransferAmount,
              loanDisbursementAmount: loanDisbursementAmount,
              trueIncome: trueIncomeCategories.reduce((sum, cat) => sum + cat.total_amount, 0),
              totalExpenses: expenseCategories.reduce((sum, cat) => sum + cat.amount, 0),
              availableCashFlow: trueIncomeCategories.reduce((sum, cat) => sum + cat.total_amount, 0) - 
                                expenseCategories.reduce((sum, cat) => sum + cat.amount, 0) - totalDebtPayments
            }
          });
        });
      });
    });
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server only if this file is run directly (not during testing)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 FinanceFlow Pro API server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📁 Database: ${dbPath}`);
    console.log(`📄 PDF parsing: ENABLED`);
    console.log(`🗂️  Sample data: ${process.env.LOAD_SAMPLE_DATA === 'true' ? 'ENABLED' : 'DISABLED'}`);
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('✅ Database connection closed.');
    }
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('✅ Database connection closed.');
    }
    process.exit(0);
  });
});

// Export for testing
module.exports = app;