/**
 * Example: Adding Support for a New Bank Format
 * This file demonstrates how to extend WalletWarden to support additional banks
 */

import { registerParser } from '../utils/bankParsers';

/**
 * Example Parser for Barclays Bank
 * This is a skeleton you can copy and modify for your own bank
 */
export const barclaysParser = {
  name: 'Barclays',
  
  detect: (text) => {
    // Look for Barclays-specific keywords
    return /Barclays Bank|Sort code \d{6}/i.test(text) && /Date|Description|Amount/i.test(text);
  },
  
  parse: (text) => {
    const transactions = [];
    const lines = text.split('\n').filter(l => l.trim().length > 5);
    
    // Barclays format typically has: Date | Description | Amount | Balance
    // You would need to examine a real Barclays statement and adjust the parsing logic
    
    const datePattern = /(\d{2}\/\d{2}\/\d{4})/; // DD/MM/YYYY format
    
    for (const line of lines) {
      const dateMatch = line.match(datePattern);
      if (!dateMatch) continue;
      
      // Extract amounts - look for currency values
      const amounts = (line.match(/(\d+[.,]\d{2})/g) || []).map(a => parseFloat(a.replace(',', '')));
      if (amounts.length === 0) continue;
      
      // Get description (everything between date and amounts)
      let description = line.replace(dateMatch[0], '').trim();
      description = description.replace(/\d+[.,]\d{2}/g, '').trim().substring(0, 80);
      
      if (!description) description = 'Transaction';
      
      // Determine if income or expense
      // You might check keywords like "credit", "debit", "transfer in", "payment out"
      const isIncome = /received|credited|transfer in|deposit/i.test(line);
      
      transactions.push({
        id: Date.now() + Math.random(),
        type: isIncome ? 'income' : 'expense',
        amount: amounts[0],
        date: dateMatch[0],
        description: description,
        source: 'Barclays'
      });
    }
    
    return transactions;
  }
};

/**
 * Example: Registering a parser at runtime
 * This would run when your component/page loads
 */
export const registerCustomParsers = () => {
  // Uncomment and modify these to add support for additional banks
  
  // registerParser(barclaysParser);
  
  // You can add more parsers here as needed:
  // registerParser(anotherBankParser);
  // registerParser(thirdBankParser);
};

/**
 * HOW TO USE THIS:
 * 
 * 1. Examine your bank's PDF statement and note:
 *    - What keywords or patterns identify it as your bank?
 *    - What date format does it use? (DD/MM/YYYY, MM/DD/YYYY, etc.)
 *    - How are transactions laid out? (table, list, etc.)
 *    - How are amounts shown? (debit column, credit column, single column, etc.)
 *    - What keywords indicate income vs. expense?
 * 
 * 2. Update the detect() function to match your bank's unique keywords
 * 
 * 3. Update the parse() function to extract dates, descriptions, and amounts
 *    - Use regex patterns appropriate for your bank's format
 *    - Test with console.log() to debug extraction logic
 * 
 * 4. Call registerCustomParsers() in your component's useEffect or on app startup
 * 
 * 5. Test by uploading a PDF from your bank
 *    - Check browser console (F12) to see which parser was selected
 *    - See if transactions were extracted correctly
 * 
 * ============================================================================
 * DEBUGGING TIPS:
 * ============================================================================
 * 
 * In browser console, after uploading a PDF:
 * 
 * 1. Check extracted text:
 *    Look for "=== EXTRACTED PDF TEXT ===" in console
 *    See what format your bank's PDF produces
 * 
 * 2. Test your detect function:
 *    ```
 *    import { barclaysParser } from './path/to/this/file';
 *    barclaysParser.detect(extractedText); // Should return true
 *    ```
 * 
 * 3. Test your parse function:
 *    ```
 *    const result = barclaysParser.parse(extractedText);
 *    console.log(result); // Should show parsed transactions
 *    ```
 * 
 * 4. Check parser selection:
 *    Look for "[PDF Parser] Detected format: ..." in console
 *    This tells you which parser was selected
 * 
 * ============================================================================
 */
