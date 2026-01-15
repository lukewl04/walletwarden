// Transaction categories for categorization
export const TRANSACTION_CATEGORIES = [
  'Rent',
  'Utilities',
  'Groceries',
  'Restaurants',
  'Petrol',
  'Transport',
  'Shopping',
  'Entertainment',
  'Subscriptions',
  'Education',
  'Gifts',
  'Charity',
  'Transfer',
  'Fees',
  'Salary',
  'Other'
];

export const CATEGORY_COLORS = {
  'Petrol': '#FF6B6B',
  'Subscriptions': '#4ECDC4',
  'Groceries': '#95E1D3',
  'Restaurants': '#F38181',
  'Entertainment': '#AA96DA',
  'Shopping': '#FCBAD3',
  'Transport': '#A8D8EA',
  'Utilities': '#FFE66D',
  'Healthcare': '#95E1D3',
  'Insurance': '#8AC6D1',
  'Rent': '#FF8B94',
  'Salary': '#38ADA9',
  'Freelance': '#78C850',
  'Bonus': '#B4E197',
  'Transfer': '#9D84B7',
  'Fees': '#FF6B9D',
  'Other': '#CCCCCC'
};

// Category suggestions based on keywords in transaction description
export function suggestCategory(description) {
  if (!description) return 'Other';
  
  const desc = description.toLowerCase();
  
  const categoryKeywords = {
    'Petrol': ['bp', 'shell', 'tesco fuel', 'sainsburys fuel', 'petrol', 'fuel', 'gas station', 'fuel station'],
    'Subscriptions': ['spotify', 'netflix', 'amazon prime', 'disney', 'subscription', 'month', 'yearly', 'annual'],
    'Groceries': ['tesco', 'sainsburys', 'asda', 'morrisons', 'waitrose', 'ocado', 'grocery', 'supermarket'],
    'Restaurants': ['mcdonald', 'burger king', 'kfc', 'pizza', 'restaurant', 'cafe', 'coffee', 'takeaway', 'deliveroo', 'uber eats', 'just eat'],
    'Entertainment': ['cinema', 'movie', 'theatre', 'concert', 'spotify', 'gaming', 'game'],
    'Shopping': ['amazon', 'ebay', 'asos', 'h&m', 'zara', 'next', 'john lewis', 'boots', 'shop', 'store'],
    'Transport': ['train', 'bus', 'uber', 'taxi', 'transport', 'rail', 'tube', 'tfl'],
    'Utilities': ['electric', 'gas', 'water', 'internet', 'phone', 'mobile', 'sky', 'broadband'],
    'Healthcare': ['pharmacy', 'doctor', 'hospital', 'medical', 'health', 'clinic', 'boots'],
    'Insurance': ['insurance', 'home', 'auto', 'car', 'travel', 'life'],
    'Rent': ['landlord', 'rent', 'housing', 'mortgage']
  };
  
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(keyword => desc.includes(keyword))) {
      return category;
    }
  }
  
  return 'Other';
}
