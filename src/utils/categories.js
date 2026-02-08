// Transaction categories for categorization
export const TRANSACTION_CATEGORIES = [
  'Rent',
  'Insurance',
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

// Category suggestions based on keywords in transaction description.
// Order matters — more specific rules (e.g. Insurance brands) are checked
// before broad catch-all terms so that "Admiral" hits Insurance rather than
// accidentally matching a generic bucket.
const CATEGORY_RULES = [
  // ── Salary / income (checked early so payroll refs aren't mis-bucketed) ──
  { cat: 'Salary',        kw: ['salary', 'wages', 'payroll', 'hmrc', 'tax refund', 'pension', 'bacs'] },

  // ── Insurance (specific brands first, then generic terms) ──
  { cat: 'Insurance',     kw: [
    'admiral', 'aviva', 'direct line', 'directline', 'aa ', 'the aa', 'rac ', 'hastings',
    'more than', 'morethan', 'confused.com', 'comparethemarket', 'gocompare',
    'lv=', 'axa', 'zurich', 'allianz', 'esure', 'churchill', 'privilege',
    'nfu mutual', 'vitality', 'bupa', 'simply health', 'simplyhealth',
    'insurance', 'insure', 'underwriter', 'premium', 'excess', 'policy'
  ]},

  // ── Rent / Mortgage ──
  { cat: 'Rent',          kw: ['landlord', 'rent', 'letting', 'housing assoc', 'mortgage', 'nationwide bs', 'openrent'] },

  // ── Utilities ──
  { cat: 'Utilities',     kw: [
    'british gas', 'scottish power', 'edf', 'eon', 'e.on', 'sse', 'octopus energy',
    'bulb', 'shell energy', 'ovo energy', 'utility', 'utilities',
    'electric', 'water', 'severn trent', 'thames water', 'united utilities', 'anglian water',
    'council tax', 'tv licence', 'tv license',
    'broadband', 'bt ', 'virgin media', 'sky ', 'talktalk', 'plusnet', 'hyperoptic',
    'internet', 'fibre', 'phone bill',
    'ee ', 'o2 ', 'vodafone', 'three ', 'giffgaff', 'tesco mobile', 'mobile'
  ]},

  // ── Subscriptions (checked before Shopping so "amazon prime" isn't tagged Shopping) ──
  { cat: 'Subscriptions', kw: [
    'netflix', 'disney+', 'disney plus', 'amazon prime', 'prime video',
    'spotify', 'apple music', 'youtube premium', 'audible', 'kindle',
    'now tv', 'nowtv', 'crunchyroll', 'dazn', 'bt sport',
    'playstation plus', 'ps plus', 'xbox game pass', 'xbox live',
    'adobe', 'microsoft 365', 'icloud', 'google one', 'google storage',
    'dropbox', 'chatgpt', 'openai',
    'gym', 'puregym', 'the gym', 'david lloyd', 'virgin active', 'fitness',
    'subscription', 'recurring', 'membership'
  ]},

  // ── Petrol / Fuel (before Shopping so "tesco" fuel matches here) ──
  { cat: 'Petrol',        kw: [
    'petrol', 'fuel', 'diesel',
    'bp ', 'shell ', 'esso', 'texaco', 'jet ', 'murco', 'gulf ',
    'tesco fuel', 'sainsburys fuel', 'asda fuel', 'morrisons fuel',
    'fuel station', 'gas station', 'pay at pump'
  ]},

  // ── Groceries (before Restaurants so supermarkets aren't tagged as food-out) ──
  { cat: 'Groceries',     kw: [
    'tesco', 'sainsbury', 'asda', 'morrisons', 'waitrose', 'ocado',
    'aldi', 'lidl', 'co-op', 'coop', 'm&s food', 'marks & spencer',
    'iceland', 'farmfoods', 'heron foods', 'jack\'s', 'spar', 'nisa',
    'grocery', 'supermarket', 'grocer'
  ]},

  // ── Restaurants / Eating out ──
  { cat: 'Restaurants',   kw: [
    'mcdonald', 'burger king', 'kfc', 'subway', 'greggs', 'pret',
    'nando', 'wagamama', 'pizza', 'domino', 'papa john',
    'starbucks', 'costa', 'caffe nero', 'coffee',
    'restaurant', 'cafe', 'diner', 'bistro', 'takeaway', 'take away',
    'deliveroo', 'uber eats', 'just eat', 'menulog'
  ]},

  // ── Transport ──
  { cat: 'Transport',     kw: [
    'uber', 'bolt', 'taxi', 'cab',
    'train', 'rail', 'national rail', 'lner', 'gwr', 'avanti',
    'bus', 'megabus', 'national express', 'stagecoach', 'arriva',
    'tube', 'tfl', 'oyster', 'contactless tfl',
    'parking', 'ncp', 'ringo', 'justpark', 'ringgo',
    'mot ', 'dvla', 'car wash', 'halfords', 'kwik fit',
    'transport', 'congestion'
  ]},

  // ── Shopping ──
  { cat: 'Shopping',      kw: [
    'amazon', 'ebay', 'asos', 'h&m', 'zara', 'primark', 'next ',
    'john lewis', 'argos', 'currys', 'ikea', 'tk maxx', 'tkmaxx',
    'boots', 'superdrug', 'home bargains', 'b&m', 'poundland',
    'shop', 'store', 'retail', 'clothing', 'outlet'
  ]},

  // ── Entertainment ──
  { cat: 'Entertainment', kw: [
    'cinema', 'odeon', 'cineworld', 'vue', 'movie',
    'theatre', 'concert', 'ticketmaster', 'eventbrite', 'live nation',
    'museum', 'gallery', 'zoo', 'theme park', 'alton towers', 'thorpe park',
    'gaming', 'steam', 'playstation store', 'nintendo', 'xbox',
    'pub', 'bar', 'wetherspoon', 'nightclub'
  ]},

  // ── Education ──
  { cat: 'Education',     kw: ['tuition', 'university', 'college', 'school', 'student loan', 'slc ', 'udemy', 'coursera', 'skillshare'] },

  // ── Gifts / Charity ──
  { cat: 'Gifts',         kw: ['gift', 'present', 'birthday', 'christmas'] },
  { cat: 'Charity',       kw: ['charity', 'donate', 'donation', 'oxfam', 'red cross', 'macmillan', 'cancer research'] },

  // ── Transfers / Fees ──
  { cat: 'Transfer',      kw: ['transfer', 'sent to', 'received from', 'monzo', 'revolut', 'paypal', 'wise ', 'bank transfer'] },
  { cat: 'Fees',          kw: ['fee', 'charge', 'overdraft', 'interest', 'penalty', 'late payment'] },
];

export function suggestCategory(description) {
  if (!description) return 'Other';
  const desc = description.toLowerCase();

  for (const { cat, kw } of CATEGORY_RULES) {
    if (kw.some(k => desc.includes(k))) return cat;
  }
  return 'Other';
}
