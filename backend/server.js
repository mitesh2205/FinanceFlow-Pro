const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pdf = require('pdf-parse');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:8000'
}));
app.use(express.json());

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
    initializeDatabase();
  }
});

// PDF Parsing Functions
function parseEnhancedStatement(text) {
  const transactions = [];
  const lines = text.split('\n');
  
  console.log('=== PARSING ATTEMPT ===');
  console.log('Total lines to process:', lines.length);
  
  // Extended patterns for more banks
  const allPatterns = [
    // Chase patterns
    { name: 'Chase-1', pattern: /^(\d{2}\/\d{2})\s+(.+?)\s+(\$?[\d,]+\.\d{2})$/ },
    { name: 'Chase-2', pattern: /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d,]+\.\d{2})$/ },
    
    // Generic date patterns
    { name: 'Generic-1', pattern: /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.+?)\s+([-+]?\$?[\d,]+\.\d{2})$/ },
    { name: 'Generic-2', pattern: /^(\d{1,2}-\d{1,2}-\d{2,4})\s+(.+?)\s+([-+]?\$?[\d,]+\.\d{2})$/ },
    
    // Bank of America patterns
    { name: 'BofA-1', pattern: /^(\d{2}\/\d{2})\s+(.+?)\s+(-?\$[\d,]+\.\d{2})\s*$/ },
    { name: 'BofA-2', pattern: /^(\d{1,2}\/\d{1,2})\s+(.+?)\s+(\$[\d,]+\.\d{2})\s+(\$[\d,]+\.\d{2})$/ },
    
    // Wells Fargo patterns
    { name: 'Wells-1', pattern: /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(-?\$[\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/ },
    
    // Capital One patterns  
    { name: 'CapOne-1', pattern: /^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+([-+]?\$?[\d,]+\.\d{2})$/ },
    
    // Discover patterns
    { name: 'Discover-1', pattern: /^(\d{2}\/\d{2}\/\d{2})\s+(.+?)\s+(\$[\d,]+\.\d{2})$/ },
    
    // Generic with leading spaces
    { name: 'Spaces-1', pattern: /^\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.+?)\s+([-+]?\$?[\d,]+\.\d{2})\s*$/ },
    { name: 'Spaces-2', pattern: /^\s+(\d{1,2}-\d{1,2}-\d{2,4})\s+(.+?)\s+([-+]?\$?[\d,]+\.\d{2})\s*$/ },
    
    // Patterns with transaction types
    { name: 'Typed-1', pattern: /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.+?)\s+(DEBIT|CREDIT|PAYMENT|DEPOSIT)\s+([\d,]+\.\d{2})$/i },
    { name: 'Typed-2', pattern: /^(\d{1,2}-\d{1,2}-\d{2,4})\s+(.+?)\s+(DEBIT|CREDIT|PAYMENT|DEPOSIT)\s+([\d,]+\.\d{2})$/i },
    
    // Tab-separated patterns
    { name: 'Tab-1', pattern: /^(\d{1,2}\/\d{1,2}\/\d{2,4})\t(.+?)\t([-+]?\$?[\d,]+\.\d{2})$/ },
    { name: 'Tab-2', pattern: /^(\d{1,2}-\d{1,2}-\d{2,4})\t(.+?)\t([-+]?\$?[\d,]+\.\d{2})$/ },
  ];
  
  const currentYear = new Date().getFullYear();
  let patternMatches = {};
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.length < 10) continue;
    
    console.log(`Checking line ${i + 1}: "${line}"`);
    
    for (const patternObj of allPatterns) {
      const match = line.match(patternObj.pattern);
      if (match) {
        console.log(`  ✅ MATCHED pattern ${patternObj.name}:`, match);
        
        // Track pattern usage
        patternMatches[patternObj.name] = (patternMatches[patternObj.name] || 0) + 1;
        
        try {
          let dateStr, description, amountStr, transactionType;
          
          if (match.length === 5) {
            // Pattern with transaction type
            [, dateStr, description, transactionType, amountStr] = match;
            if (transactionType && transactionType.toUpperCase() === 'DEBIT') {
              amountStr = '-' + amountStr;
            }
          } else {
            [, dateStr, description, amountStr] = match;
          }
          
          // Clean description
          description = description.trim().replace(/\s+/g, ' ');
          
          // Skip headers
          if (description.length < 3 || 
              /^(date|description|amount|transaction|balance|total)/i.test(description)) {
            console.log(`  ❌ Skipped header: "${description}"`);
            continue;
          }
          
          // Parse date
          let date = parseDateString(dateStr, currentYear);
          if (!date) {
            console.log(`  ❌ Invalid date: "${dateStr}"`);
            continue;
          }
          
          // Parse amount
          let amount = parseFloat(amountStr.replace(/[\$,]/g, ''));
          if (isNaN(amount)) {
            console.log(`  ❌ Invalid amount: "${amountStr}"`);
            continue;
          }
          
          const category = categorizeTransaction(description);
          
          const transaction = {
            date,
            description,
            amount,
            category,
            pattern: patternObj.name,
            rawLine: line
          };
          
          transactions.push(transaction);
          console.log(`  ✅ Added transaction:`, transaction);
          
        } catch (error) {
          console.log(`  ❌ Error processing match:`, error.message);
        }
        break; // Stop after first match
      }
    }
  }
  
  console.log('=== PATTERN USAGE SUMMARY ===');
  console.log(patternMatches);
  console.log(`=== FOUND ${transactions.length} TRANSACTIONS ===`);
  
  return transactions;
}

function parseChaseStatement(text) {
  const transactions = [];
  const lines = text.split('\n');
  
  // Chase credit card statement patterns
  const transactionPatterns = [
    // Pattern 1: MM/DD DESCRIPTION $AMOUNT
    /^(\d{2}\/\d{2})\s+(.+?)\s+(\$?[\d,]+\.\d{2})$/,
    // Pattern 2: MM/DD/YYYY DESCRIPTION AMOUNT
    /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d,]+\.\d{2})$/,
    // Pattern 3: Date Description Amount (various formats)
    /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})$/
  ];
  
  const currentYear = new Date().getFullYear();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    for (const pattern of transactionPatterns) {
      const match = line.match(pattern);
      if (match) {
        try {
          let [, dateStr, description, amountStr] = match;
          
          // Clean up description
          description = description.trim().replace(/\s+/g, ' ');
          
          // Skip if description is too short or looks like a header
          if (description.length < 3 || 
              description.toUpperCase().includes('TRANSACTION') ||
              description.toUpperCase().includes('DESCRIPTION') ||
              description.toUpperCase().includes('AMOUNT')) {
            continue;
          }
          
          // Parse date
          let date = parseDateString(dateStr, currentYear);
          if (!date) continue;
          
          // Parse amount
          let amount = parseFloat(amountStr.replace(/[\$,]/g, ''));
          
          // For credit cards, purchases are typically negative
          if (amount > 0) {
            amount = -amount;
          }
          
          // Categorize transaction
          const category = categorizeTransaction(description);
          
          // Validate transaction
          if (date && description && !isNaN(amount) && Math.abs(amount) > 0.01) {
            transactions.push({
              date,
              description,
              amount,
              category
            });
          }
        } catch (error) {
          console.log(`Error parsing line: ${line}`, error);
        }
        break;
      }
    }
  }
  
  return transactions;
}

function parseCSVStatement(text) {
  const transactions = [];
  const lines = text.split('\n');
  
  // Skip header row and process data
  for (let i = 1; i < lines.length; i++) {
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
            category: categorizeTransaction(description)
          });
        }
      } catch (error) {
        console.log(`Error parsing CSV line: ${line}`, error);
      }
    }
  }
  
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
function parseGenericStatement(text) {
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
          const category = categorizeTransaction(description);
          
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

function categorizeTransaction(description) {
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

// File upload endpoint with better error handling and debugging
app.post('/api/upload-statement', upload.single('file'), async (req, res) => {
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
        
        console.log('PDF text extracted, length:', text.length);
        console.log('First 1000 chars:', text.substring(0, 1000));
          transactions = parseEnhancedStatement(text);
        console.log(`Enhanced parser found ${transactions.length} transactions`);

        if (transactions.length === 0) {
          console.log('=== NO TRANSACTIONS FOUND - TRYING FALLBACK ===');
          transactions = parseGenericStatement(text);
          console.log(`Fallback parser found ${transactions.length} transactions`);
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
        const text = buffer.toString('utf-8');
        console.log('CSV content preview:', text.substring(0, 500));
        
        transactions = parseCSVStatement(text);
        console.log(`Extracted ${transactions.length} transactions from CSV`);
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

// Debug endpoint to see raw PDF text extraction
app.post('/api/debug-pdf', upload.single('file'), async (req, res) => {
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

// Improved import transactions endpoint
app.post('/api/import-transactions', (req, res) => {
  const { transactions, accountName } = req.body;
  
  if (!transactions || !Array.isArray(transactions)) {
    return res.status(400).json({ error: 'Invalid transactions data' });
  }
  
  if (!accountName) {
    return res.status(400).json({ error: 'Account name is required' });
  }
  
  console.log(`Importing ${transactions.length} transactions to account: ${accountName}`);
  
  let importedCount = 0;
  let errors = [];
  let processed = 0;
  
  // Process each transaction
  const processTransaction = (transaction, index) => {
    return new Promise((resolve) => {
      const { date, description, amount, category } = transaction;
      
      if (!date || !description || amount === undefined || !category) {
        errors.push(`Transaction ${index + 1}: Missing required fields (date, description, amount, or category)`);
        resolve();
        return;
      }
      
      // Validate date format
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        errors.push(`Transaction ${index + 1}: Invalid date format (${date})`);
        resolve();
        return;
      }
      
      // Validate amount
      const numericAmount = parseFloat(amount);
      if (isNaN(numericAmount)) {
        errors.push(`Transaction ${index + 1}: Invalid amount (${amount})`);
        resolve();
        return;
      }
      
      db.run("INSERT INTO transactions (date, description, amount, category, account_name) VALUES (?, ?, ?, ?, ?)",
        [date, description, numericAmount, category, accountName], function(err) {
        if (err) {
          console.error(`Error inserting transaction ${index + 1}:`, err);
          errors.push(`Transaction ${index + 1}: Database error - ${err.message}`);
        } else {
          importedCount++;
          
          // Update account balance if account exists
          db.run("UPDATE accounts SET balance = balance + ? WHERE name = ?", [numericAmount, accountName], (updateErr) => {
            if (updateErr) {
              console.error('Error updating account balance:', updateErr);
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
              }
            });
          }
        }
        
        processed++;
        resolve();
      });
    });
  };
  
  // Process all transactions
  Promise.all(transactions.map(processTransaction)).then(() => {
    console.log(`Import complete: ${importedCount}/${transactions.length} transactions imported`);
    
    res.json({
      message: `Successfully imported ${importedCount} out of ${transactions.length} transactions`,
      importedCount,
      totalCount: transactions.length,
      errors: errors.length > 0 ? errors : undefined,
      skippedCount: transactions.length - importedCount
    });
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

// Data management endpoints
app.post('/api/admin/clear-all-data', (req, res) => {
  db.serialize(() => {
    db.run("DELETE FROM transactions");
    db.run("DELETE FROM accounts");
    db.run("DELETE FROM budgets");
    db.run("DELETE FROM goals");
    db.run("DELETE FROM investments");
    
    res.json({ message: "All data cleared successfully" });
    console.log('All data cleared by admin');
  });
});

app.post('/api/admin/reset-to-sample', (req, res) => {
  db.serialize(() => {
    // Clear existing data
    db.run("DELETE FROM transactions");
    db.run("DELETE FROM accounts");
    db.run("DELETE FROM budgets");
    db.run("DELETE FROM goals");
    db.run("DELETE FROM investments");
    
    // Re-insert sample data
    setTimeout(() => {
      insertSampleData();
      res.json({ message: "Database reset to sample data successfully" });
      console.log('Database reset to sample data by admin');
    }, 100);
  });
});

// Accounts
app.get('/api/accounts', (req, res) => {
  db.all("SELECT * FROM accounts ORDER BY id", (err, rows) => {
    if (err) {
      console.error('Error fetching accounts:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/accounts', (req, res) => {
  const { name, type, balance, institution } = req.body;
  
  if (!name || !type || balance === undefined || !institution) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run("INSERT INTO accounts (name, type, balance, institution) VALUES (?, ?, ?, ?)",
    [name, type, balance, institution], function(err) {
    if (err) {
      console.error('Error creating account:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json({ id: this.lastID, message: "Account created successfully" });
    }
  });
});

// Transactions
app.get('/api/transactions', (req, res) => {
  const { category, account, dateFrom, dateTo } = req.query;
  let query = "SELECT * FROM transactions WHERE 1=1";
  let params = [];

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

app.post('/api/transactions', (req, res) => {
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

app.put('/api/transactions/:id', (req, res) => {
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

app.delete('/api/transactions/:id', (req, res) => {
  const { id } = req.params;
  
  // First get the transaction to reverse account balance
  db.get("SELECT * FROM transactions WHERE id = ?", [id], (err, transaction) => {
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

// Dashboard summary
app.get('/api/dashboard', (req, res) => {
  const summary = {};
  
  // Get total balance
  db.get("SELECT SUM(balance) as total_balance FROM accounts", (err, row) => {
    if (err) {
      console.error('Error fetching dashboard data:', err);
      res.status(500).json({ error: err.message });
    } else {
      summary.total_balance = row.total_balance || 0;
      
      // Get recent transactions for expense calculation
      db.all("SELECT SUM(amount) as total_expenses FROM transactions WHERE amount < 0 AND date >= date('now', '-30 days')", (expenseErr, expenseRow) => {
        if (expenseErr) {
          console.error('Error calculating expenses:', expenseErr);
        }
        
        // Get recent income
        db.all("SELECT SUM(amount) as total_income FROM transactions WHERE amount > 0 AND date >= date('now', '-30 days')", (incomeErr, incomeRow) => {
          if (incomeErr) {
            console.error('Error calculating income:', incomeErr);
          }
          
          const monthlyExpenses = Math.abs(expenseRow?.[0]?.total_expenses || 0);
          const monthlyIncome = incomeRow?.[0]?.total_income || 0;
          const savingsAmount = monthlyIncome - monthlyExpenses;
          const savingsRate = monthlyIncome > 0 ? ((savingsAmount / monthlyIncome) * 100) : 0;
          
          // Simulated monthly data for charts (you can customize this)
          const monthlyData = [
            {month: "Jul", income: 3200, expenses: 2600, savings: 600},
            {month: "Aug", income: 3200, expenses: 2800, savings: 400},
            {month: "Sep", income: 3200, expenses: 2500, savings: 700},
            {month: "Oct", income: 3200, expenses: 2900, savings: 300},
            {month: "Nov", income: 3200, expenses: 2700, savings: 500},
            {month: "Dec", income: monthlyIncome || 3200, expenses: monthlyExpenses || 2600, savings: savingsAmount || 600}
          ];
          
          summary.monthly_data = monthlyData;
          summary.monthly_income = monthlyIncome || 3200;
          summary.monthly_expenses = monthlyExpenses || 2600;
          summary.savings_rate = Math.round(savingsRate * 10) / 10; // Round to 1 decimal
          
          res.json(summary);
        });
      });
    }
  });
});

// Budgets
app.get('/api/budgets', (req, res) => {
  db.all("SELECT * FROM budgets ORDER BY category", (err, rows) => {
    if (err) {
      console.error('Error fetching budgets:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/budgets', (req, res) => {
  const { category, budgeted } = req.body;
  
  if (!category || budgeted === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run("INSERT OR REPLACE INTO budgets (category, budgeted, spent, remaining) VALUES (?, ?, 0, ?)",
    [category, budgeted, budgeted], function(err) {
    if (err) {
      console.error('Error creating/updating budget:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json({ message: "Budget updated successfully" });
    }
  });
});

// Goals
app.get('/api/goals', (req, res) => {
  db.all("SELECT * FROM goals ORDER BY deadline", (err, rows) => {
    if (err) {
      console.error('Error fetching goals:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/goals', (req, res) => {
  const { name, target, current, deadline } = req.body;
  
  if (!name || target === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run("INSERT INTO goals (name, target, current, deadline) VALUES (?, ?, ?, ?)",
    [name, target, current || 0, deadline], function(err) {
    if (err) {
      console.error('Error creating goal:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json({ id: this.lastID, message: "Goal created successfully" });
    }
  });
});

app.put('/api/goals/:id', (req, res) => {
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

app.delete('/api/goals/:id', (req, res) => {
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

// Investments
app.get('/api/investments', (req, res) => {
  db.all("SELECT * FROM investments ORDER BY symbol", (err, rows) => {
    if (err) {
      console.error('Error fetching investments:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/investments', (req, res) => {
  const { symbol, name, shares, value, gain_loss } = req.body;
  
  if (!symbol || !name || shares === undefined || value === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run("INSERT INTO investments (symbol, name, shares, value, gain_loss) VALUES (?, ?, ?, ?, ?)",
    [symbol, name, shares, value, gain_loss || "0%"], function(err) {
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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 FinanceFlow Pro API server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🛠️  Admin interface: http://localhost:${PORT}/admin`);
  console.log(`📁 Database: ${dbPath}`);
  console.log(`📄 PDF parsing: ENABLED`);
  console.log(`🗂️  Sample data: ${process.env.LOAD_SAMPLE_DATA === 'true' ? 'ENABLED' : 'DISABLED'}`);
});

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