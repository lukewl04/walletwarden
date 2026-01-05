# Quick Reference: Parser System Diagram

## Data Flow

```
┌─────────────────────────────────┐
│   User Uploads PDF File         │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  PDF.js Extracts Text           │
│  (runs in Web Worker)           │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│                   parsePDFText(fullText)                    │
│  (src/utils/bankParsers.js - Main Entry Point)             │
└────────────┬────────────────────────────────────────────────┘
             │
             ├─────────► santanderParser.detect()  ───► YES? Parse ─┐
             │              "20th Nov" + "sort code"         │       │
             │                                               ▼       │
             ├─────────► genericTableParser.detect() ───► YES? Parse ┤
             │              Table separators + dates        │       │
             │                                               ▼       │
             ├─────────► simpleCSVParser.detect()   ───► YES? Parse ┤
             │              Comma/tab separated             │       │
             │                                               ▼       │
             ├─────────► fallbackParser.detect()    ───► YES? Parse ┤
             │              (always true)                   │       │
             │                                               ▼       │
             └──────────────────────────────────────────────►|
                                                              │
                                                              ▼
                         ┌──────────────────────────┐
                         │  Transaction[] Result    │
                         │  or empty array if all   │
                         │  parsers failed          │
                         └──────────────────────────┘
```

## Parser Addition Points

### Built-in Parsers (Recommended for Official Support)
```
src/utils/bankParsers.js
├── santanderParser
├── genericTableParser
├── simpleCSVParser
└── fallbackParser
    (Add new official parsers here)
```

### Runtime Registration (For Plugins/Extensions)
```javascript
// Anywhere in your code
import { registerParser } from '../utils/bankParsers';

registerParser(myCustomParser);
// ^ Gets added to front of parser queue with priority
```

## Component Integration

```
csv-pdf-upload.jsx
│
├─ handlePDFUpload()
│  │
│  ├─ Read PDF file
│  │
│  ├─ Extract text with PDF.js
│  │
│  └─ Call parsePDFText(fullText)  ◄───── src/utils/bankParsers.js
│     │
│     ├─ Try each parser in order
│     │
│     ├─ Return transactions
│     │
│     └─ Update uploadedTransactions state
│
├─ handleCSVUpload()  (unchanged)
│
└─ Preview / Upload UI
```

## Adding a New Parser: 3 Simple Steps

```
Step 1: Understand Your Format
├─ Get a real PDF from the bank
├─ Upload it to WalletWarden
├─ Check browser console for extracted text
└─ Note: date patterns, unique keywords, amount positions

Step 2: Create Parser
├─ Copy template from src/utils/exampleParser.js
├─ Implement detect() - look for unique keywords
├─ Implement parse() - extract transactions
└─ Return array of transaction objects

Step 3: Register Parser
├─ Option A: Add to parsers array in bankParsers.js (permanent)
└─ Option B: Call registerParser() at runtime (temporary/plugin)
```

## Transaction Object

```javascript
{
  id: 1735857234234.567,           // Date.now() + Math.random()
  type: 'income' | 'expense',       // Always one of these
  amount: 123.45,                   // Always positive number
  date: '01 Jan 2024',              // Any format user recognizes
  description: 'Payment to grocery store', // 20-80 chars
  source: 'Santander'               // Optional: which parser found it
}
```

## File Structure

```
walletwarden/
├── REFACTORING_SUMMARY.md         ◄─── High-level summary
├── PARSER_ARCHITECTURE.md         ◄─── Technical design docs
│
└── src/
    ├── components/
    │   └── csv-pdf-upload.jsx     ◄─── Uses parsePDFText()
    │
    └── utils/
        ├── bankParsers.js          ◄─── Core parser system
        ├── PARSER_GUIDE.md         ◄─── How to create parsers
        └── exampleParser.js        ◄─── Template for new banks
```

## Browser Console Debugging

When you upload a PDF, you'll see console messages like:

```javascript
// Step 1: Text extraction
=== EXTRACTED PDF TEXT ===
[Full PDF text shown here]
=== END PDF TEXT ===

// Step 2: Parser selection
[PDF Parser] Detected format: Santander

// Step 3: Success
[PDF Parser] Successfully parsed 15 transactions using Santander
```

If parsing fails:

```javascript
// No parser detected the format
[PDF Parser] Failed - all parsers returned empty results

// Check the extracted text above
// Consider adding a new parser for this bank
```

## Decision Tree: Which Parser Should I Use?

```
┌─ Is it a known bank format (Santander, HSBC, etc.)?
│  └─ YES: Create specific parser for that bank
│
├─ Does it have a clear table structure (columns separated by | or -)?
│  └─ YES: Generic table parser will handle it
│
├─ Is it comma or tab separated like CSV?
│  └─ YES: Simple CSV parser will handle it
│
└─ Otherwise: Fallback parser tries to extract any date + amount
```

## Performance Notes

- Parsers tried sequentially (not parallel)
- Detection is fast (regex only)
- First successful parse wins
- Put specific parsers before generic ones
- Fallback parser is intentionally loose to catch edge cases
- No performance concerns for typical bank statements (1-5 pages)

---

**Need help?** Check these files:
- `PARSER_GUIDE.md` - Detailed guide with examples
- `exampleParser.js` - Template you can copy
- Browser console (F12) - Shows what's happening
