/**
 * GUIDE: Adding Custom Bank Parsers
 * 
 * The WalletWarden app now uses a flexible, extensible parser system.
 * If your bank statement format isn't recognized, you can easily add support for it.
 * 
 * TWO WAYS TO ADD PARSERS:
 * 
 * 1. PERMANENT (Built-in parsers)
 *    Add your parser to src/utils/bankParsers.js
 *    It will be included in every build
 * 
 * 2. RUNTIME (Dynamic registration)
 *    Register parsers at runtime using registerParser() function
 *    Useful for plugins or custom integrations
 * 
 * ============================================================================
 * ANATOMY OF A PARSER
 * ============================================================================
 * 
 * Each parser must have this structure:
 * 
 * ```javascript
 * export const myBankParser = {
 *   // Name of the bank/format (for debugging)
 *   name: 'My Bank Format',
 *   
 *   // Detection function - returns true if this parser should handle the text
 *   // Should be specific enough to avoid false positives
 *   detect: (text) => {
 *     return /bank-specific-keyword/i.test(text) && /another-pattern/i.test(text);
 *   },
 *   
 *   // Parse function - extracts transactions from the text
 *   // Returns array of transaction objects
 *   parse: (text) => {
 *     const transactions = [];
 *     // Your parsing logic here...
 *     return transactions;
 *   }
 * };
 * ```
 * 
 * ============================================================================
 * TRANSACTION OBJECT FORMAT
 * ============================================================================
 * 
 * Each parsed transaction must have this structure:
 * 
 * {
 *   id: unique identifier (use Date.now() + Math.random()),
 *   type: 'income' or 'expense',
 *   amount: number (always positive),
 *   date: string (any format, user-readable),
 *   description: string (max 80 chars recommended),
 *   source: string (optional, parser name for reference)
 * }
 * 
 * ============================================================================
 * EXAMPLE 1: Adding Support for HSBC Bank
 * ============================================================================
 * 
 * export const hsbcParser = {
 *   name: 'HSBC',
 *   
 *   detect: (text) => {
 *     // HSBC statements contain "HSBC Bank UK"
 *     return /HSBC Bank UK/i.test(text);
 *   },
 *   
 *   parse: (text) => {
 *     const parsed = [];
 *     const lines = text.split('\n').filter(l => l.trim());
 *     
 *     // HSBC format: Date | Description | Debit | Credit | Balance
 *     // Example line: "01 Jan | Payment | 25.50 | | 1234.50"
 *     
 *     const datePattern = /(\d{1,2}\s+\w{3})/i;
 *     
 *     for (const line of lines) {
 *       if (!datePattern.test(line)) continue;
 *       
 *       const parts = line.split('|').map(p => p.trim());
 *       
 *       const date = parts[0];
 *       const description = parts[1];
 *       const debit = parseFloat(parts[2]) || 0;
 *       const credit = parseFloat(parts[3]) || 0;
 *       
 *       if (debit === 0 && credit === 0) continue;
 *       
 *       const amount = debit > 0 ? debit : credit;
 *       const isIncome = credit > 0;
 *       
 *       parsed.push({
 *         id: Date.now() + Math.random(),
 *         type: isIncome ? 'income' : 'expense',
 *         amount: amount,
 *         date: date,
 *         description: description.substring(0, 80),
 *         source: 'HSBC'
 *       });
 *     }
 *     
 *     return parsed;
 *   }
 * };
 * ```
 * 
 * Then add to parsers array in bankParsers.js:
 * ```javascript
 * export const parsers = [
 *   hsbcParser,         // <- Add here
 *   santanderParser,
 *   genericTableParser,
 *   simpleCSVParser,
 *   fallbackParser
 * ];
 * ```
 * 
 * ============================================================================
 * EXAMPLE 2: Runtime Registration (For Plugin Systems)
 * ============================================================================
 * 
 * // In your plugin code or configuration
 * import { registerParser } from '../utils/bankParsers';
 * 
 * const myCustomParser = {
 *   name: 'Custom Bank',
 *   detect: (text) => /my-bank-keyword/i.test(text),
 *   parse: (text) => {
 *     // Your parsing logic
 *     return [];
 *   }
 * };
 * 
 * // Register it (adds to front of parser list for priority)
 * registerParser(myCustomParser);
 * ```
 * 
 * ============================================================================
 * BEST PRACTICES
 * ============================================================================
 * 
 * 1. DETECT SPECIFICALLY
 *    - Use bank name, keywords, or unique patterns from that bank
 *    - Avoid generic patterns that could match other banks
 *    - Test your detection on multiple real statements
 * 
 * 2. HANDLE EDGE CASES
 *    - Empty fields
 *    - Different date formats
 *    - Multiple currencies
 *    - Missing descriptions
 * 
 * 3. CLEAN UP TEXT
 *    - Trim whitespace
 *    - Remove extra spaces
 *    - Skip header/footer lines
 *    - Skip summary/balance lines
 * 
 * 4. AMOUNT EXTRACTION
 *    - Always store amounts as positive numbers
 *    - Use 'type' field to indicate income/expense
 *    - Handle commas in large amounts (1,234.56)
 *    - Handle different decimal separators
 * 
 * 5. DESCRIPTION QUALITY
 *    - Aim for 20-80 character descriptions
 *    - Remove transaction IDs or codes if present
 *    - Remove duplicate amount information
 *    - Keep it readable for users
 * 
 * 6. DEBUGGING
 *    - Use console.log in parse() to see what's happening
 *    - Check browser console (F12) when uploading
 *    - Return empty array if parsing fails (won't break app)
 * 
 * ============================================================================
 * TESTING YOUR PARSER
 * ============================================================================
 * 
 * // In browser console while developing:
 * 
 * import { parsePDFText, registerParser } from './utils/bankParsers';
 * 
 * // Test detection
 * const yourParser = { ... };
 * console.log(yourParser.detect(testText)); // Should be true
 * 
 * // Test parsing
 * const result = yourParser.parse(testText);
 * console.log(result);
 * 
 * // Try with main function
 * const result2 = parsePDFText(testText);
 * console.log(result2);
 * ```
 * 
 * ============================================================================
 * FAQ
 * ============================================================================
 * 
 * Q: My bank statement has inconsistent formatting. What do I do?
 * A: Use more flexible patterns. Check for keywords in different positions.
 *    The fallbackParser at the end handles very generic formats.
 * 
 * Q: How do I handle dates in different formats?
 * A: Store them as strings in parseDate() utility. Just extract what's there.
 *    The app displays them as-is to users.
 * 
 * Q: Parser order matters?
 * A: Yes! More specific parsers should come first in the array.
 *    Generic parsers (like fallbackParser) should come last.
 * 
 * Q: Can I add a parser without modifying the source code?
 * A: Yes! Use registerParser() at runtime or in a plugin system.
 * 
 * Q: My parser works but catches too many formats. How to fix?
 * A: Make your detect() function more specific. Add more required keywords.
 *    Test against documents from other banks.
 * 
 * ============================================================================
 */
