/**
 * Bank Statement Parsers
 * Plugin-style architecture to support multiple bank formats
 * Each parser attempts to detect and parse a specific bank's format
 */

// Utility function to extract amounts from text
const extractAmounts = (text) => {
  return (text.match(/(\d+[.,]\d{2})/g) || []).map(a => parseFloat(a.replace(',', '')));
};

// Utility function to parse date variations
const parseDate = (dateStr) => {
  if (!dateStr) return new Date().toLocaleDateString('en-GB');
  return String(dateStr).trim();
};

/**
 * SANTANDER TABLE FORMAT PARSER
 * Handles Santander PDFs with Date | Description | Money In | Money Out | Balance columns
 */
export const santanderTableParser = {
  name: 'Santander Table Format',
  detect: (text) => {
    // Look for Santander-specific markers
    const isSantander = /Santander|Online Banking|Transactions/i.test(text);
    const hasTableColumns = /Date\s*Description\s*Money In\s*Money Out|Money In\s*Money Out\s*Balance/i.test(text);
    const hasDateFormat = /\d{2}\/\d{2}\/\d{4}/i.test(text);
    return isSantander && hasTableColumns && hasDateFormat;
  },
  parse: (text) => {
    const parsed = [];
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    
    // Find transactions - they start with a date in DD/MM/YYYY format
    const datePattern = /^(\d{2}\/\d{2}\/\d{4})/;
    
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const dateMatch = line.match(datePattern);
      
      if (!dateMatch) {
        i++;
        continue;
      }
      
      const date = dateMatch[1];
      let description = line.substring(10).trim(); // Skip the date
      
      // Collect description lines until we find amounts
      let j = i + 1;
      while (j < lines.length && !lines[j].match(/£\s*\d+/)) {
        description += ' ' + lines[j];
        j++;
      }
      
      // Extract money amounts from the current and next few lines
      let moneyIn = 0;
      let moneyOut = 0;
      
      for (let k = i; k < Math.min(i + 3, lines.length); k++) {
        const amountLine = lines[k];
        const amounts = (amountLine.match(/£\s*[\d,]+\.\d{2}/g) || []).map(a => 
          parseFloat(a.replace('£', '').replace(/,/g, '').trim())
        );
        
        if (amounts.length >= 2) {
          // Typically format is: Money In | Money Out | Balance
          moneyIn = amounts[0] || 0;
          moneyOut = amounts[1] || 0;
        } else if (amounts.length === 1) {
          // Single amount - need to determine if in or out
          const isIncome = /receipt|transfer from|payment received|faster payments receipt|income/i.test(description);
          if (isIncome) {
            moneyIn = amounts[0];
          } else {
            moneyOut = amounts[0];
          }
        }
      }
      
      // Determine transaction type and amount
      const amount = moneyOut > 0 ? moneyOut : moneyIn;
      const type = moneyOut > 0 ? 'expense' : 'income';
      
      // Clean up description
      description = description
        .replace(/£\s*[\d,]+\.\d{2}/g, '')
        .replace(/ON\s+\d{2}-\d{2}-\d{4}/i, '')
        .replace(/VIA APPLE PAY/i, '')
        .replace(/REFERENCE\s+[^,]*/i, '')
        .replace(/MANDATE\s+NO[^,]*/i, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .substring(0, 80);
      
      if (description && amount > 0) {
        parsed.push({
          id: Date.now() + Math.random(),
          type: type,
          amount: amount,
          date: date,
          description: description,
          source: 'Santander Table'
        });
      }
      
      i = j > i + 1 ? j : i + 1;
    }
    
    return parsed;
  }
};

/**
 * SANTANDER PARSER
 * Detects Santander format with date pattern like "20th Nov"
 */
export const santanderParser = {
  name: 'Santander',
  detect: (text) => {
    // Check for Santander-specific date pattern and keywords
    const datePattern = /\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?/i;
    const hasSantanderKeywords = /balance brought forward|balance carried forward|sort code/i.test(text);
    return datePattern.test(text) && hasSantanderKeywords;
  },
  parse: (text) => {
    const parsed = [];
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    
    const datePattern = /^(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?)/i;
    
    const skipKeywords = [
      'balance brought forward', 'balance carried forward', 'average balance',
      'total money', 'sort code', 'account number', 'statement number',
      'statement of', 'interest', 'charges', 'your transactions', 'date',
      'description', 'money in', 'money out', 'page number'
    ];

    const dateLines = [];
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(datePattern);
      if (match) {
        dateLines.push({ index: i, date: match[1] });
      }
    }

    for (let d = 0; d < dateLines.length; d++) {
      const currentDateInfo = dateLines[d];
      const nextDateIndex = d + 1 < dateLines.length ? dateLines[d + 1].index : lines.length;
      const dateStr = currentDateInfo.date;
      const transactionLines = lines.slice(currentDateInfo.index, nextDateIndex);
      const transactionText = transactionLines.join(' ');

      if (skipKeywords.some(kw => transactionText.toLowerCase().includes(kw))) continue;

      const amounts = extractAmounts(transactionText);
      if (!amounts || amounts.length < 2) continue;

      let transactionAmount = null;
      if (amounts.length === 2) {
        transactionAmount = amounts[0];
      } else if (amounts.length >= 3) {
        const first = amounts[0];
        const second = amounts[1];
        if (Math.abs(second) > Math.abs(first) * 2) {
          transactionAmount = first;
        } else {
          transactionAmount = first > 0 ? first : second;
        }
      }

      if (!transactionAmount || transactionAmount === 0) continue;

      let description = transactionText.replace(dateStr, '').trim();
      description = description.replace(/\d+[.,]\d{2}/g, '').trim();
      description = description.replace(/\s{2,}/g, ' ').trim();

      if (!description || description.length < 2) continue;

      const isIncome = /receipt|transfer from|payment received/i.test(description);

      parsed.push({
        id: Date.now() + Math.random(),
        type: isIncome ? 'income' : 'expense',
        amount: Math.abs(transactionAmount),
        date: dateStr.trim(),
        description: description.substring(0, 80),
        source: 'Santander'
      });
    }

    return parsed;
  }
};

/**
 * GENERIC TABLE FORMAT PARSER
 * Attempts to parse tables with columns like: Date | Description | Amount | Balance
 */
export const genericTableParser = {
  name: 'Generic Table Format',
  detect: (text) => {
    // Look for table-like structure with separators
    const lines = text.split('\n');
    const hasTableLines = lines.some(line => /[\|\-\+]/g.test(line));
    const hasDatePatterns = /\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}-\w{3}-\d{4}|\d{1,2}\s+\w{3}\s+\d{4}/i.test(text);
    return hasTableLines && hasDatePatterns;
  },
  parse: (text) => {
    const parsed = [];
    const lines = text.split('\n').filter(l => l.trim());
    
    // Skip header/separator lines
    const dataLines = lines.filter(line => 
      !/^\s*[\|\-\+]+\s*$/.test(line) && 
      !/(Date|Description|Amount|Balance)/i.test(line)
    );

    const datePattern = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}-\w{3}-\d{4}|\d{1,2}\s+\w{3}\s+\d{4})/;

    for (const line of dataLines) {
      if (line.length < 10) continue;
      
      const dateMatch = line.match(datePattern);
      if (!dateMatch) continue;

      const amounts = extractAmounts(line);
      if (amounts.length < 1) continue;

      // Extract description (text between date and first amount)
      const parts = line.split(dateMatch[0]);
      let description = (parts[1] || '').trim();
      description = description.replace(/\d+[.,]\d{2}/g, '').trim();
      description = description.substring(0, 80);

      if (!description) description = 'Transaction';

      const amount = amounts[0];
      const isIncome = /in|credit|received|deposit/i.test(description);

      parsed.push({
        id: Date.now() + Math.random(),
        type: isIncome ? 'income' : 'expense',
        amount: Math.abs(amount),
        date: dateMatch[0],
        description: description,
        source: 'Generic Table'
      });
    }

    return parsed;
  }
};

/**
 * SIMPLE CSV-STYLE PARSER (from PDF text)
 * Assumes lines with: date, description, amount pattern
 */
export const simpleCSVParser = {
  name: 'Simple CSV Format',
  detect: (text) => {
    // Look for comma-separated or tab-separated values
    const lines = text.split('\n').slice(0, 5);
    return lines.some(line => {
      const parts = line.split(/[,\t]/);
      return parts.length >= 3;
    });
  },
  parse: (text) => {
    const parsed = [];
    const lines = text.split('\n').filter(l => l.trim());
    const delimiter = text.includes('\t') ? '\t' : ',';

    for (const line of lines) {
      const parts = line.split(delimiter).map(p => p.trim());
      if (parts.length < 2) continue;

      const amount = parseFloat(parts[parts.length - 1]);
      if (isNaN(amount)) continue;

      const date = parts[0] || new Date().toLocaleDateString('en-GB');
      const description = parts.slice(1, -1).join(' ').substring(0, 80) || 'Transaction';
      const isIncome = /income|in|received|credit|deposit/i.test(description);

      parsed.push({
        id: Date.now() + Math.random(),
        type: isIncome ? 'income' : 'expense',
        amount: Math.abs(amount),
        date: parseDate(date),
        description: description,
        source: 'CSV Format'
      });
    }

    return parsed;
  }
};

/**
 * FALLBACK PARSER
 * Last resort - looks for any date and amount pattern
 */
export const fallbackParser = {
  name: 'Fallback Pattern Matcher',
  detect: () => true, // Always matches as fallback
  parse: (text) => {
    const parsed = [];
    const lines = text.split('\n').filter(l => l.trim());
    
    // Look for common date patterns
    const datePatterns = [
      /(\d{1,2}\/\d{1,2}\/\d{4})/,
      /(\d{1,2}-\w{3}-\d{4})/i,
      /(\d{1,2}\s+\w{3}\s+\d{4})/i,
      /(\d{4}-\d{1,2}-\d{1,2})/
    ];

    for (const line of lines) {
      if (line.length < 10) continue;

      let dateMatch = null;
      for (const pattern of datePatterns) {
        const match = line.match(pattern);
        if (match) {
          dateMatch = match[1];
          break;
        }
      }

      if (!dateMatch) continue;

      const amounts = extractAmounts(line);
      if (amounts.length === 0) continue;

      const description = line
        .replace(dateMatch, '')
        .replace(/\d+[.,]\d{2}/g, '')
        .trim()
        .substring(0, 80) || 'Transaction';

      const amount = amounts[0];
      const isIncome = /in|credit|received|deposit|income/i.test(line);

      parsed.push({
        id: Date.now() + Math.random(),
        type: isIncome ? 'income' : 'expense',
        amount: Math.abs(amount),
        date: dateMatch,
        description: description,
        source: 'Pattern Match'
      });
    }

    return parsed;
  }
};

/**
 * Parser Registry - Add new parsers here
 */
export const parsers = [
  santanderTableParser,
  santanderParser,
  genericTableParser,
  simpleCSVParser,
  fallbackParser
];

/**
 * Main parsing function
 * Tries each parser in order, uses the first one that detects the format
 */
export const parsePDFText = (text) => {
  for (const parser of parsers) {
    if (parser.detect(text)) {
      console.log(`[PDF Parser] Detected format: ${parser.name}`);
      try {
        const result = parser.parse(text);
        if (result.length > 0) {
          console.log(`[PDF Parser] Successfully parsed ${result.length} transactions using ${parser.name}`);
          return result;
        }
      } catch (error) {
        console.warn(`[PDF Parser] ${parser.name} failed:`, error);
      }
    }
  }

  return [];
};

/**
 * Add a custom parser at runtime
 */
export const registerParser = (parserConfig) => {
  parsers.unshift(parserConfig); // Add to front so it has priority
};
