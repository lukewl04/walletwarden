# PDF Parser Refactoring Summary

## What Changed

Your PDF parser has been refactored from a **single Santander-specific implementation** to a **flexible, multi-format system**.

### Before
- ✗ Only worked with Santander statements
- ✗ Hard to add new bank formats
- ✗ Cryptic error messages
- ✗ Had to modify core component to add support

### After
- ✅ Supports multiple formats (Santander, generic tables, CSV-style)
- ✅ Easy to add new bank parsers (plugin architecture)
- ✅ Better error messages showing what parsers were tried
- ✅ Can register parsers at runtime without modifying source

## How It Works

The system now uses **intelligent format detection**:

```
1. Extract text from PDF
2. Try Santander parser → if matched, use it
3. Try Generic Table parser → if matched, use it
4. Try Simple CSV parser → if matched, use it
5. Try Fallback parser → catches anything with date + amount
```

Each parser can detect if a PDF matches its format before attempting to parse it.

## Current Supported Formats

| Format | Detection | Example |
|--------|-----------|---------|
| **Santander** | "20th Nov" + "sort code" | UK Santander bank statements |
| **Generic Table** | Table separators + dates | Any tabular statement format |
| **Simple CSV** | Comma/tab separated + amounts | Basic transaction lists |
| **Fallback** | Any date + amount | Edge cases, unusual formats |

## For Users

**No changes needed!** Your existing Santander PDFs will continue to work. But now:

- If your bank isn't Santander, it might still work (table/CSV formats)
- Error messages are clearer
- More banks can be added without code changes

## For Developers

### Adding a New Bank (3 Steps)

**1. Create a parser object:**
```javascript
export const myBankParser = {
  name: 'My Bank',
  detect: (text) => /my-bank-keyword/i.test(text),
  parse: (text) => {
    // Extract transactions
    return [{
      id: Date.now() + Math.random(),
      type: 'income' or 'expense',
      amount: number,
      date: string,
      description: string,
      source: 'My Bank'
    }];
  }
};
```

**2. Add to parsers array in `src/utils/bankParsers.js`:**
```javascript
export const parsers = [
  myBankParser,  // Add before fallbackParser
  santanderParser,
  ...
];
```

**3. Test with a real PDF from that bank**

### Runtime Registration (No Code Changes)

```javascript
import { registerParser } from '../utils/bankParsers';

registerParser({
  name: 'Custom Bank',
  detect: (text) => /custom-keyword/i.test(text),
  parse: (text) => { /* ... */ }
});
```

## Files Modified

- **`src/components/csv-pdf-upload.jsx`**
  - Replaced hardcoded `parseBankStatement()` with `parsePDFText()`
  - Improved error messages
  - Updated help text

- **`src/utils/bankParsers.js`** (NEW)
  - Core parser system
  - 4 built-in parsers (Santander, Generic Table, Simple CSV, Fallback)
  - `parsePDFText()` main function
  - `registerParser()` for runtime additions

- **`src/utils/PARSER_GUIDE.md`** (NEW)
  - Comprehensive guide for creating new parsers
  - Multiple examples
  - Best practices
  - Debugging tips

- **`src/utils/exampleParser.js`** (NEW)
  - Template showing how to add Barclays support
  - Can be copied and modified for other banks

- **`PARSER_ARCHITECTURE.md`** (NEW)
  - High-level system overview
  - Design decisions
  - Extension points

## Testing

1. **Existing functionality preserved:**
   - Santander PDFs still work the same way
   - Monzo/Starling CSV uploads work the same way
   - Simple CSV format works the same way

2. **New capabilities:**
   - Upload PDFs from other banks (if format matches table or simple CSV)
   - Easy to add more banks
   - Clear console logging of what parser was used

3. **Error handling:**
   - Better error messages tell users what went wrong
   - Fallback parser catches edge cases
   - Console logs show extracted text for debugging

## Next Steps

### For Testing
1. Upload your existing Santander PDF → should work as before
2. Check browser console (F12) → you'll see `[PDF Parser] Detected format: Santander`
3. Try a PDF from another bank → may work if it's a table format

### For Adding Banks
1. Get a PDF from the target bank
2. Upload it to see what format is extracted (console)
3. Use `PARSER_GUIDE.md` to create a parser
4. Add to `bankParsers.js` or register at runtime
5. Test and refine detection logic

### For Production
- All changes are backward compatible
- No breaking changes to existing code
- System gracefully degrades to fallback parser
- Comprehensive error messages for users
