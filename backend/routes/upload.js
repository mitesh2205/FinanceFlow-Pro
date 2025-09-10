const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdf = require('pdf-parse');
const DatabaseService = require('../services/databaseService');
const FileProcessingService = require('../services/fileProcessingService');
const CategorizationService = require('../services/categorizationService');
const { authenticateToken } = require('../middleware/auth');
const { validationRules, handleValidationErrors } = require('../middleware/validation');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'text/csv'];
    const allowedExts = ['.pdf', '.csv'];
    
    const isValidType = allowedTypes.includes(file.mimetype);
    const isValidExt = allowedExts.some(ext => file.originalname.toLowerCase().endsWith(ext));
    
    if (isValidType || isValidExt) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and CSV files are allowed'), false);
    }
  }
});

const db = DatabaseService.getInstance();
const fileService = FileProcessingService;
const categorizationService = CategorizationService;

// POST /api/upload-statement - File upload endpoint with better error handling and debugging (protected)
router.post('/statement', authenticateToken, upload.single('file'), validationRules.uploadValidation, handleValidationErrors, async (req, res) => {
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
        
        // Use FileProcessingService to parse PDF
        transactions = await fileService.parsePDFStatement(text, lowerCaseText);
        
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
        let text = buffer.toString('utf-8');

        // Remove the Byte Order Mark (BOM) if present
        if (text.charCodeAt(0) === 0xFEFF) {
          console.log('Detected and removed BOM from CSV file.');
          text = text.substring(1);
        }

        console.log('CSV content preview:', text.substring(0, 500));
        const lowerCaseText = text.toLowerCase();

        // Use FileProcessingService to parse CSV
        transactions = await fileService.parseCSVStatement(text, lowerCaseText);

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

// POST /api/debug-pdf - Debug endpoint to see raw PDF text extraction (protected)
router.post('/debug-pdf', authenticateToken, upload.single('file'), async (req, res) => {
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
        const lines = text.split('\\n');
        console.log('=== LINE BY LINE ===');
        lines.forEach((line, index) => {
          if (line.trim()) {
            console.log(`Line ${index + 1}: \"${line.trim()}\"`);
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

// POST /api/import-transactions - Import transactions endpoint (protected)
router.post('/import-transactions', authenticateToken, validationRules.importTransactions, handleValidationErrors, async (req, res) => {
  try {
    const { transactions, accountName } = req.body;
    const userId = req.userId;

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

    // First, verify the account exists and belongs to the user
    const account = await db.get(
      "SELECT id, name, type FROM accounts WHERE name = ? AND (user_id = ? OR user_id IS NULL)",
      [accountName, userId]
    );

    if (!account) {
      return res.status(400).json({ 
        error: `Account \"${accountName}\" not found. Please create the account first or select a different account.` 
      });
    }

    console.log(`Importing ${transactions.length} transactions to account: ${accountName} (${account.type})`);

    let importedCount = 0;
    let skippedCount = 0;
    let errors = [];

    // Process each transaction
    for (let i = 0; i < processedTransactions.length; i++) {
      try {
        const transaction = processedTransactions[i];
        const { date, description, amount, category } = transaction;

        if (!date || !description || amount === undefined || !category) {
          errors.push(`Transaction ${i + 1}: Missing required fields (date, description, amount, or category)`);
          skippedCount++;
          continue;
        }

        // Check for duplicate transaction
        const existingTransaction = await db.get(
          "SELECT id FROM transactions WHERE date = ? AND description = ? AND amount = ? AND account_name = ?",
          [date, description, amount, accountName]
        );

        if (existingTransaction) {
          console.log(`Skipping duplicate transaction: ${description} on ${date}`);
          skippedCount++;
          continue;
        }

        // Categorize transaction if needed
        let finalCategory = category;
        if (category === 'Unknown' || !category) {
          finalCategory = await categorizationService.categorizeTransaction(description, amount);
        }

        // Insert transaction
        await db.run(
          "INSERT INTO transactions (date, description, amount, category, account_name) VALUES (?, ?, ?, ?, ?)",
          [date, description, amount, finalCategory, accountName]
        );

        // Update account balance
        const balanceChange = parseFloat(amount);
        await db.run(
          "UPDATE accounts SET balance = balance + ? WHERE name = ?",
          [balanceChange, accountName]
        );

        // Update budget spent amount if it's an expense
        if (balanceChange < 0) {
          await db.run(
            `UPDATE budgets SET
              spent = spent + ?,
              remaining = budgeted - spent
              WHERE category = ? AND (user_id = ? OR user_id IS NULL)`,
            [Math.abs(balanceChange), finalCategory, userId]
          );
        }

        importedCount++;
      } catch (transactionError) {
        console.error(`Error processing transaction ${i + 1}:`, transactionError);
        errors.push(`Transaction ${i + 1}: ${transactionError.message}`);
        skippedCount++;
      }
    }

    console.log(`Import complete: ${importedCount} imported, ${skippedCount} skipped`);

    res.json({
      message: 'Import completed',
      importedCount,
      skippedCount,
      totalProcessed: importedCount + skippedCount,
      errors: errors.slice(0, 10), // Limit error list
      success: importedCount > 0
    });

  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ 
      error: 'Failed to import transactions: ' + error.message 
    });
  }
});

module.exports = router;
