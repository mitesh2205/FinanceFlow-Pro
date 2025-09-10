const pdf = require('pdf-parse');
const CategorizationService = require('./categorizationService');

class FileProcessingService {
  constructor() {
    this.supportedFormats = ['application/pdf', 'text/csv'];
  }

  async processFile(buffer, originalname, mimetype) {
    console.log(`Processing file: ${originalname}, size: ${buffer.length} bytes, type: ${mimetype}`);

    if (!this.supportedFormats.includes(mimetype) && 
        !originalname.toLowerCase().endsWith('.pdf') && 
        !originalname.toLowerCase().endsWith('.csv')) {
      throw new Error('Unsupported file format. Please upload PDF or CSV files only.');
    }

    let transactions = [];

    if (mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf')) {
      transactions = await this.processPDF(buffer);
    } else if (mimetype === 'text/csv' || originalname.toLowerCase().endsWith('.csv')) {
      transactions = await this.processCSV(buffer);
    }

    if (transactions.length === 0) {
      throw new Error('No transactions found in the file. Please check if this is a bank statement with transaction data.');
    }

    return {
      transactions,
      totalCount: transactions.length,
      fileName: originalname,
      fileType: mimetype
    };
  }

  async processPDF(buffer) {
    try {
      const data = await pdf(buffer);
      const text = data.text;
      const lowerCaseText = text.toLowerCase();

      console.log('PDF text extracted, length:', text.length);
      
      let transactions = [];

      // Attempt to identify the bank and use the correct parser
      if (lowerCaseText.includes('apple card') && lowerCaseText.includes('goldman sachs')) {
        console.log('Detected Apple Card statement. Using Apple Card parser.');
        transactions = await this.parseAppleCardStatement(text);
      } else if (lowerCaseText.includes('bank of america')) {
        console.log('Detected Bank of America statement. Using BofA parser.');
        transactions = await this.parseEnhancedStatement(text);
      } else if (lowerCaseText.includes('chase') && lowerCaseText.includes('checking summary')) {
        console.log('Detected Chase Checking statement. Using Chase Checking parser.');
        transactions = await this.parseChaseCheckingStatement(text);
      } else if (lowerCaseText.includes('chase')) {
        console.log('Detected Chase Credit Card statement. Using Chase Credit Card parser.');
        transactions = await this.parseChaseCreditCardStatement(text);
      }

      // If no bank-specific parser worked, try the generic one as a fallback
      if (transactions.length === 0) {
        console.log('Bank-specific parser found no transactions. Trying generic fallback...');
        transactions = await this.parseGenericStatement(text);
        console.log(`Generic fallback parser found ${transactions.length} transactions`);
      }

      return transactions;
    } catch (error) {
      console.error('PDF parsing error:', error);
      throw new Error('Failed to parse PDF file. Please ensure it\'s a text-based PDF (not scanned image).');
    }
  }

  async processCSV(buffer) {
    try {
      let text = buffer.toString('utf-8');

      // Remove BOM if present
      if (text.charCodeAt(0) === 0xFEFF) {
        console.log('Detected and removed BOM from CSV file.');
        text = text.substring(1);
      }

      console.log('CSV content preview:', text.substring(0, 500));
      const lowerCaseText = text.toLowerCase();

      let transactions = [];

      // Check for Chase CSVs first (more specific patterns)
      if (lowerCaseText.includes('posting date') && lowerCaseText.includes('type') && lowerCaseText.includes('check or slip #')) {
        console.log('Detected Chase Checking CSV. Using specialized parser.');
        transactions = await this.parseChaseCheckingCSV(text);
      } else if (lowerCaseText.includes('transaction date') && lowerCaseText.includes('category') && lowerCaseText.includes('post date')) {
        console.log('Detected Chase Credit Card CSV. Using specialized parser.');
        transactions = await this.parseChaseCreditCardCSV(text);
      
      // Then check for Bank of America CSVs
      } else if (lowerCaseText.includes('posted date') && lowerCaseText.includes('reference number') && lowerCaseText.includes('payee')) {
        console.log('Detected Bank of America Credit Card CSV. Using specialized parser.');
        transactions = await this.parseBofACreditCardCSV(text);
      } else if (lowerCaseText.includes('running bal.') && lowerCaseText.includes('date,description,amount')) {
        console.log('Detected Bank of America Checking CSV. Using specialized parser.');
        transactions = await this.parseBofACheckingCSV(text);
        
        // If BofA parser didn't work, try the generic CSV parser
        if (transactions.length === 0) {
          console.log('BofA parser found no transactions, trying generic CSV parser...');
          transactions = await this.parseCSVStatement(text);
        }

      // Generic CSV fallback
      } else if (lowerCaseText.includes('posting date') && lowerCaseText.includes('check or slip')) {
        console.log('Detected Chase Checking CSV. Using specialized parser.');
        transactions = await this.parseChaseCheckingCSV(text);

      // Fallback for any other CSV format
      } else {
        console.log('Using generic CSV parser.');
        transactions = await this.parseCSVStatement(text);
      }

      return transactions;
    } catch (error) {
      console.error('CSV parsing error:', error);
      throw new Error('Failed to parse CSV file. Please check the file format.');
    }
  }

  // Helper function to parse date strings more reliably
  parseDateString(dateStr, currentYear = new Date().getFullYear()) {
    if (!dateStr) return null;

    // Remove quotes and clean up
    dateStr = dateStr.replace(/"/g, '').trim();

    // Try various date formats
    const formats = [
      /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
      /^(\d{2})\/(\d{2})\/(\d{4})$/, // MM/DD/YYYY
      /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/, // M/D/YY or M/D/YYYY
      /^(\d{2})-(\d{2})-(\d{4})$/, // MM-DD-YYYY
      /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/, // MM/DD/YYYY or M/D/YYYY
      /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2})$/, // MM/DD/YY or M/D/YY
      /^(\d{1,2})[\/-](\d{1,2})$/ // MM/DD or M/D
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

  // CSV parsing helper
  parseCSVLine(line) {
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

  // Placeholder methods for bank-specific parsers
  // These would contain the actual parsing logic from the original server.js
  async parseEnhancedStatement(text) {
    // Bank of America parser logic would go here
    return [];
  }

  async parseChaseCreditCardStatement(text) {
    // Chase credit card parser logic would go here
    return [];
  }

  async parseChaseCheckingStatement(text) {
    // Chase checking parser logic would go here
    return [];
  }

  async parseAppleCardStatement(text) {
    // Apple Card parser logic would go here
    return [];
  }

  async parseGenericStatement(text) {
    // Generic statement parser logic would go here
    return [];
  }

  async parseChaseCheckingCSV(text) {
    // Chase checking CSV parser logic would go here
    return [];
  }

  async parseChaseCreditCardCSV(text) {
    // Chase credit card CSV parser logic would go here
    return [];
  }

  async parseBofACreditCardCSV(text) {
    // BofA credit card CSV parser logic would go here
    return [];
  }

  async parseBofACheckingCSV(text) {
    // BofA checking CSV parser logic would go here
    return [];
  }

  async parseCSVStatement(text) {
    // Generic CSV parser logic would go here
    return [];
  }
}

// Export singleton instance
const fileProcessingService = new FileProcessingService();
module.exports = fileProcessingService;
