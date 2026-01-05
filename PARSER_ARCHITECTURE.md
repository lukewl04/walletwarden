## PDF Parser Architecture - WalletWarden

### Overview

The PDF parser system is now **flexible and extensible** rather than hardcoded for a single bank format. It uses a **plugin-style architecture** where multiple parsers compete to handle different statement formats.

### How It Works

```
User uploads PDF
        ↓
Extract text from PDF
        ↓
[Try Parser 1] → If detect() matches, try parse()
   ↓ (fail)     → If parse() fails, continue
[Try Parser 2] → If detect() matches, try parse()
   ↓ (fail)     → If parse() fails, continue
[Try Parser 3] → ...
   ↓
[Fallback Parser] → Last resort, tries generic patterns
        ↓
Return transactions (or empty array if all fail)
        ↓
Show transactions to user or error message
```

### Current Built-in Parsers

1. **Santander Parser** - Detects Santander-specific format
   - Pattern: Dates like "20th Nov", "1st Dec"
   - Keywords: "balance brought forward", "sort code"
   - Returns: Income/expense with amounts and descriptions

2. **Generic Table Parser** - Handles table-formatted statements
   - Pattern: Lines with pipe separators `|`, dashes `-`, or plus signs `+`
   - Detects: Common date formats (DD/MM/YYYY, DD-MMM-YYYY, etc.)
   - Returns: Transactions extracted from table cells

3. **Simple CSV Parser** - Parses comma/tab-separated values
   - Pattern: Lines with 3+ comma or tab-separated fields
   - Extracts: Date, description, amount from columns
   - Returns: Transactions with inferred income/expense

4. **Fallback Parser** - Last resort generic pattern matching
   - Pattern: Any line with a date and an amount
   - Tries multiple date formats
   - Returns: Best-guess transactions (may be incomplete)

### Parser Interface

All parsers must implement this interface:

```javascript
{
  name: string,                    // Display name for debugging
  detect: (text) => boolean,       // Returns true if this parser should handle the text
  parse: (text) => Transaction[]   // Extracts transactions from text
}
```

### Transaction Object Structure

```javascript
{
  id: number,              // Unique ID (Date.now() + Math.random())
  type: 'income'|'expense', // Whether money came in or went out
  amount: number,          // Always positive
  date: string,            // Any readable format
  description: string,     // 20-80 chars recommended
  source: string           // Optional: parser name
}
```

### Adding Support for New Banks

#### Option 1: Permanent (Built-in)
Add your parser to `src/utils/bankParsers.js`:

```javascript
export const myBankParser = {
  name: 'My Bank',
  detect: (text) => {
    // Return true if your bank's specific keywords/patterns are present
    return /my-bank-keyword|unique-pattern/i.test(text);
  },
  parse: (text) => {
    // Extract transactions and return array
    const transactions = [];
    // ... parsing logic ...
    return transactions;
  }
};

// Add to parsers array
export const parsers = [
  myBankParser,  // Add here before fallback
  ...
];
```

#### Option 2: Runtime (Dynamic)
Register at runtime for plugins:

```javascript
import { registerParser } from '../utils/bankParsers';

registerParser({
  name: 'Runtime Parser',
  detect: (text) => /pattern/i.test(text),
  parse: (text) => {
    // parsing logic
    return [];
  }
});
```

### Debugging

When a PDF upload fails:

1. **Check browser console (F12)**
   - Look for `=== EXTRACTED PDF TEXT ===`
   - This shows exactly what was extracted from your PDF

2. **Check parser selection**
   - Look for `[PDF Parser] Detected format: ...`
   - Shows which parser handled the file

3. **Enable detailed logging**
   - Add `console.log()` statements in parser.parse()
   - Reupload the PDF and check console for debug output

### Performance Considerations

- Parsers are tried sequentially, so put **more specific parsers first**
- Each parser should do **fast detection** (regex only, no deep parsing)
- The fallback parser is intentionally loose to catch edge cases

### Extending the System

The current architecture supports:

✅ Multiple bank formats  
✅ User-provided parsers  
✅ Runtime registration  
✅ Custom detection logic  
✅ Flexible date formats  
✅ Fallback handling  

### Example: Adding HSBC Support

```javascript
export const hsbcParser = {
  name: 'HSBC',
  
  detect: (text) => {
    // HSBC statements contain this unique text
    return /HSBC Bank UK|HSBC account statement/i.test(text);
  },
  
  parse: (text) => {
    const transactions = [];
    const lines = text.split('\n');
    
    // HSBC uses Date | Description | Debit | Credit | Balance format
    const datePattern = /(\d{2}\s+\w{3}\s+\d{4})/; // 01 Jan 2024
    
    for (const line of lines) {
      const dateMatch = line.match(datePattern);
      if (!dateMatch) continue;
      
      const parts = line.split('|').map(p => p.trim());
      const [date, desc, debit, credit] = parts;
      
      const amount = parseFloat(debit || credit);
      if (isNaN(amount)) continue;
      
      transactions.push({
        id: Date.now() + Math.random(),
        type: credit ? 'income' : 'expense',
        amount: amount,
        date: date,
        description: desc.substring(0, 80),
        source: 'HSBC'
      });
    }
    
    return transactions;
  }
};
```

Then add to `bankParsers.js`:
```javascript
export const parsers = [
  hsbcParser,
  santanderParser,
  // ... rest
];
```

### Files

- **`src/utils/bankParsers.js`** - Core parser system and implementations
- **`src/utils/PARSER_GUIDE.md`** - Detailed guide for adding parsers
- **`src/utils/exampleParser.js`** - Example Barclays parser template
- **`src/components/csv-pdf-upload.jsx`** - Component that uses the parsers
