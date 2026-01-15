import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/navbar.jsx";
import CsvPdfUpload from "../components/csv-pdf-upload.jsx";
import { useTransactions } from "../state/TransactionsContext";

const API_URL = "http://localhost:4000/api";

export default function InsightTracker() {
  const { addTransaction, bulkAddTransactions } = useTransactions?.() ?? {};
  const [savedSplits, setSavedSplits] = useState([]);
  const [selectedSplit, setSelectedSplit] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [purchases, setPurchases] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [newPurchase, setNewPurchase] = useState({
    date: new Date().toISOString().split("T")[0],
    amount: "",
    category: "",
    description: "",
  });
  const [quickAdd, setQuickAdd] = useState({
    amount: "",
    category: "",
    description: "",
  });
  const [showOverBudgetAlert, setShowOverBudgetAlert] = useState(false);
  const [overBudgetCategories, setOverBudgetCategories] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [alertShownKey, setAlertShownKey] = useState(null);

  // Insights controls
  const [monthsBack, setMonthsBack] = useState(6);
  const [showCumulative, setShowCumulative] = useState(true);

  const selectedSplitData = useMemo(
    () => savedSplits.find((s) => s.id === selectedSplit),
    [selectedSplit, savedSplits]
  );

  // Detect system dark mode and react to changes
  useEffect(() => {
    try {
      const media = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
      if (!media) return;
      const handler = (e) => setIsDarkMode(!!e.matches);
      setIsDarkMode(!!media.matches);
      if (media.addEventListener) media.addEventListener('change', handler);
      else if (media.addListener) media.addListener(handler);
      return () => {
        if (media.removeEventListener) media.removeEventListener('change', handler);
        else if (media.removeListener) media.removeListener(handler);
      };
    } catch {}
  }, []);

  // Load splits and purchases from backend on initial mount
  useEffect(() => {
    const loadDataFromBackend = async () => {
      setIsLoading(true);
      try {
        const token = localStorage.getItem("auth0Token") || "dev-user";

        // Load splits
        const splitsResponse = await fetch(`${API_URL}/splits`, {
          headers: { "Authorization": `Bearer ${token}` },
        });

        let loadedSplits = [];
        if (splitsResponse.ok) {
          loadedSplits = await splitsResponse.json();
          setSavedSplits(loadedSplits);
          
          localStorage.setItem("walletwardenSplits", JSON.stringify(loadedSplits));
          
          if (loadedSplits.length > 0 && !selectedSplit) {
            setSelectedSplit(loadedSplits[0].id);
          }
        } else {
          const localSplits = localStorage.getItem("walletwardenSplits");
          if (localSplits) {
            loadedSplits = JSON.parse(localSplits);
            setSavedSplits(loadedSplits);
            if (loadedSplits.length > 0) {
              setSelectedSplit(loadedSplits[0].id);
            }
          }
        }

        // Load purchases
        const purchasesResponse = await fetch(`${API_URL}/purchases`, {
          headers: { "Authorization": `Bearer ${token}` },
        });

        if (purchasesResponse.ok) {
          const allPurchases = await purchasesResponse.json();
          setPurchases(allPurchases);
        }
      } catch (err) {
        console.error("Error loading data from backend:", err);
        
        const localSplits = localStorage.getItem("walletwardenSplits");
        if (localSplits) {
          const splits = JSON.parse(localSplits);
          setSavedSplits(splits);
          if (splits.length > 0) {
            setSelectedSplit(splits[0].id);
          }
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadDataFromBackend();
  }, []);

  // Filter purchases by selected split
  const filteredPurchases = useMemo(() => {
    if (!selectedSplit) return [];
    return purchases.filter((p) => p.split_id === selectedSplit);
  }, [purchases, selectedSplit]);

  // Check for over-budget categories
  useEffect(() => {
    if (!selectedSplitData || !filteredPurchases.length) {
      setShowOverBudgetAlert(false);
      setOverBudgetCategories([]);
      setAlertShownKey(null);
      return;
    }

    const overBudget = [];
    const periodPurchases = getPeriodPurchases();
    
    selectedSplitData.categories.forEach((cat) => {
      const categoryPurchases = periodPurchases.filter((p) => p.category === cat.name);
      const categoryTotal = categoryPurchases.reduce((sum, p) => sum + p.amount, 0);
      const totalSpent = periodPurchases.reduce((sum, p) => sum + p.amount, 0);
      const allocatedAmount = (totalSpent * cat.percent) / 100;
      const percentUsed = totalSpent > 0 ? (categoryTotal / allocatedAmount) * 100 : 0;

      if (percentUsed > 100) {
        overBudget.push({
          name: cat.name,
          spent: categoryTotal,
          budget: allocatedAmount,
          percent: percentUsed,
        });
      }
    });

    setOverBudgetCategories(overBudget);

    const periodKey = getPeriodKeyWithSplit();
    if (overBudget.length === 0) {
      setShowOverBudgetAlert(false);
      return;
    }

    if (alertShownKey !== periodKey) {
      setShowOverBudgetAlert(true);
      setAlertShownKey(periodKey);
    }
  }, [filteredPurchases, selectedSplitData, currentDate]);

  // Sync splits to backend (only after initial load)
  useEffect(() => {
    if (isLoading) return;
    
    const syncSplitsToBackend = async () => {
      if (savedSplits.length === 0) return;
      
      try {
        const token = localStorage.getItem("auth0Token") || "dev-user";
        for (const split of savedSplits) {
          await fetch(`${API_URL}/splits`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({
              id: split.id,
              name: split.name,
              frequency: split.frequency,
              categories: split.categories,
            }),
          });
        }
      } catch (err) {
        console.error("Error syncing splits:", err);
      }
    };

    syncSplitsToBackend();
  }, [savedSplits, isLoading]);

  // Sync purchases to backend (only after initial load)
  useEffect(() => {
    if (isLoading) return;
    
    const syncPurchasesToBackend = async () => {
      if (purchases.length === 0 || !selectedSplit) return;

      try {
        const token = localStorage.getItem("auth0Token") || "dev-user";
        const purchasesToSync = purchases.filter((p) => p.split_id === selectedSplit);
        
        for (const purchase of purchasesToSync) {
          await fetch(`${API_URL}/purchases`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({
              id: purchase.id,
              split_id: selectedSplit,
              date: purchase.date,
              amount: purchase.amount,
              category: purchase.category,
              description: purchase.description || "",
            }),
          });
        }
      } catch (err) {
        console.error("Error syncing purchases:", err);
      }
    };

    syncPurchasesToBackend();
  }, [purchases, selectedSplit, isLoading]);

  const handleAddPurchase = () => {
    if (!newPurchase.amount || !newPurchase.category) {
      alert("Please fill in amount and category");
      return;
    }

    const purchase = {
      id: crypto.randomUUID(),
      split_id: selectedSplit,
      ...newPurchase,
      amount: parseFloat(newPurchase.amount),
    };

    setPurchases([...purchases, purchase]);

    if (typeof addTransaction === "function") {
      addTransaction({
        type: "expense",
        amount: purchase.amount,
        date: purchase.date,
        category: purchase.category,
        description: purchase.description,
      });
    }

    setNewPurchase({
      date: new Date().toISOString().split("T")[0],
      amount: "",
      category: "",
      description: "",
    });
    setShowAddModal(false);
  };

  const handleQuickAdd = (category) => {
    if (!quickAdd.amount) {
      alert("Please enter an amount");
      return;
    }

    const purchase = {
      id: crypto.randomUUID(),
      split_id: selectedSplit,
      date: new Date().toISOString().split("T")[0],
      amount: parseFloat(quickAdd.amount),
      category: category,
      description: quickAdd.description,
    };

    setPurchases([...purchases, purchase]);

    if (typeof addTransaction === "function") {
      addTransaction({
        type: "expense",
        amount: purchase.amount,
        date: purchase.date,
        category: purchase.category,
        description: purchase.description,
      });
    }

    setQuickAdd({
      amount: "",
      category: "",
      description: "",
    });
    setSyncMessage(`Added £${purchase.amount.toFixed(2)} to ${category} ✓`);
    setTimeout(() => setSyncMessage(""), 2000);
  };

  const handleBulkAdd = (transactions) => {
    // Call the original bulkAddTransactions if it exists
    if (typeof bulkAddTransactions === "function") {
      bulkAddTransactions(transactions);
    }
    
    // Function to match imported category to split category
    const matchCategory = (importedCat, description = "") => {
      // Generic keywords that work with any category name
      const keywordsByType = {
        food: [
          // UK Supermarkets
          "tesco", "sainsbury", "sainsburys", "asda", "morrisons", "lidl", "aldi", "waitrose", "co-op", "coop", "iceland", "poundland", "home bargains", "ocado",
          // Grocery & Markets
          "grocery", "supermarket", "bakery", "deli", "market", "farmers market", "butcher", "fishmonger",
          // Restaurants & Dining
          "restaurant", "cafe", "coffee", "bistro", "brasserie", "dining", "pizzeria",
          // Fast Food Chains
          "mcdonald", "kfc", "burger king", "wendy's", "subway", "taco bell", "chipotle", "dominos", "pizza hut",
          // Coffee & Tea
          "starbucks", "costa", "caffe nero", "pret", "leon", "greggs", "coffee", "tea room", "tea house",
          // Pubs & Bars
          "pub", "bar", "bar & grill", "bistro", "lounge", "tavern", "inn",
          // Food Delivery
          "deliveroo", "uber eats", "just eat", "grubhub", "doordash", "food delivery",
          // Asian Cuisine
          "chinese", "indian", "thai", "japanese", "ramen", "sushi", "curry",
          // Beverages & Alcohol
          "brewery", "winery", "distillery", "bar", "cocktail",
          // Vegan/Health
          "vegan", "vegetarian", "organic", "health food",
          // General
          "meals", "food", "lunch", "dinner", "breakfast", "snack", "provisions",
        ],
        petrol: [
          // Fuel Stations
          "bp", "shell", "esso", "texaco", "chevron", "aral", "jet", "total", "sunoco", "marathon",
          "tesco fuel", "sainsbury fuel", "asda fuel", "morrisons fuel", "costco fuel",
          // Parking & Tolls
          "parking", "car park", "parkway", "parkwhiz", "just park", "parking meter", "toll", "congestion charge",
          // Vehicle Related
          "petrol", "diesel", "fuel", "gas station", "filling station", "pump", "forecourt",
          // Ride Sharing & Taxis
          "uber", "lyft", "bolt", "ola", "taxify", "gett", "mytaxi", "addison lee", "minicab", "taxi",
          // Public Transport
          "train", "rail", "railway", "tfl", "national express", "stagecoach", "arriva", "go-ahead", "bus", "coach", "tram", "metro", "underground", "tube",
          // Car Services
          "car wash", "carwash", "valet", "valeting", "auto wash",
          // Vehicle Purchase/Rental
          "hertz", "europcar", "avis", "budget", "enterprise", "zipcar", "car rental", "car hire",
          // General
          "transport", "motorbike", "motorcycle", "scooter", "transportation",
        ],
        entertainment: [
          // Streaming Services
          "netflix", "spotify", "disney", "prime video", "hulu", "apple tv", "now tv", "britbox", "bbc iplayer", "channel 4", "itv hub", "all 4",
          // Gaming Platforms
          "steam", "playstation", "xbox", "nintendo", "epic games", "itch.io", "ubisoft", "activision", "ea", "rockstar", "take two",
          // Games & Gaming
          "game", "gamestop", "gaming", "esports", "twitch",
          // Music & Audio
          "spotify", "apple music", "tidal", "soundcloud", "bandcamp", "lastfm", "deezer",
          // Cinemas & Movies
          "cinema", "movie", "film", "odeon", "vue", "cineworld", "picturehouse", "multiplex", "screening", "imax",
          // Theater & Arts
          "theatre", "theater", "opera", "ballet", "concert", "live music", "comedy", "stand-up",
          // Events & Tickets
          "ticketmaster", "eventbrite", "eventim", "ticketek", "ticket", "live nation", "songkick", "bandsintown",
          // Hobbies & Crafts
          "hobby", "craft", "art supply", "lego", "collectible", "puzzle",
          // Media & Publishing
          "ebook", "kindle", "audiobook", "audible", "scribd", "wattpad", "medium",
          // General
          "entertainment", "music", "show", "performance", "amusement", "fun",
        ],
        utilities: [
          // Energy
          "water", "gas", "electric", "electricity", "fuel", "power", "supply", "utility",
          // Energy Companies
          "edf", "eon", "npower", "scottish power", "sse", "british gas", "centrica", "ovo", "bulb", "octopus energy",
          // Broadband & Internet
          "broadband", "internet", "isp", "bt broadband", "virgin media", "sky broadband", "talktalk", "plusnet", "vodafone", "ee", "o2",
          // Phone & Mobile
          "phone", "mobile", "sim", "phone bill", "contract", "pay as you go",
          "virgin", "bt", "plusnet", "talk talk", "vodafone", "o2", "ee", "three", "giffgaff",
          // Council & Local
          "council", "council tax", "bin", "waste", "refuse", "local authority",
          // Household Services
          "boiler", "plumber", "electrician", "heating", "maintenance", "repairs",
          // General
          "bills", "bill payment", "household",
        ],
        health: [
          // Pharmacies & Medicine
          "pharmacy", "chemist", "boots", "lloyds", "asda pharmacy", "tesco pharmacy", "sainsbury pharmacy", "boots pharmacist",
          "medicine", "medication", "prescription", "pharma",
          // Hospitals & Clinics
          "hospital", "clinic", "health centre", "medical centre", "surgery", "gp",
          // Doctors & Medical
          "doctor", "gp", "physician", "consultant", "medical", "healthcare",
          // Dentists
          "dentist", "dental", "orthodontist", "teeth", "braces",
          // Opticians & Vision
          "optician", "eye care", "glasses", "contact lens", "vision",
          // Fitness & Gym
          "gym", "fitness", "health club", "leisure centre", "yoga", "pilates", "spin class", "crossfit", "peloton", "fitbit",
          "pure gym", "budget gym", "virgin active", "david lloyd", "f45",
          // Wellbeing & Therapy
          "therapy", "counseling", "psychology", "physio", "physiotherapy", "massage", "spa", "sauna", "wellness",
          // Sports & Recreation
          "sports", "swimming", "pool", "tennis", "golf", "cricket",
          // Mental Health
          "mental health", "therapy", "counselor", "psychiatry",
          // General
          "health", "wellbeing", "wellness", "medical",
        ],
        shopping: [
          // Online Retail
          "amazon", "ebay", "etsy", "aliexpress", "wish", "shein", "boohoo", "asos", "depop", "vinted", "mercari",
          // Department Stores
          "john lewis", "selfridges", "harrods", "liberty", "fortnum mason", "arnotts", "boots",
          // Clothing & Fashion
          "h&m", "zara", "uniqlo", "gap", "river island", "new look", "topshop", "urban outfitters", "primark", "next", "m&s", "marks spencer",
          "asos", "boohoo", "nasty gal", "very", "jd sports", "footpatrol",
          // Designer & Luxury
          "louis vuitton", "gucci", "prada", "chanel", "dior", "hermes", "burberry", "versace", "dolce gabbana",
          // Shoes & Footwear
          "schuh", "office", "dune", "clarks", "timberland", "nike", "adidas", "puma", "vans", "converse", "sketchers",
          // Homeware & Furniture
          "ikea", "dunelm", "next home", "habitat", "maisons du monde", "cox & cox", "wayfair", "wayfair.co.uk",
          "argos", "john lewis", "furniture village", "dreams", "sofa",
          // DIY & Hardware
          "b&q", "wickes", "screwfix", "toolstation", "homebase", "focus diy", "b and q",
          // Electronics & Computing
          "currys", "john lewis", "argos", "ao.com", "laptops direct", "scan", "overclockers",
          // Books & Media
          "waterstones", "foyles", "WHSmith", "WH smith", "book depository",
          // Sports & Outdoor
          "sports direct", "decathlon", "blacks", "go outdoors", "cotswold outdoor", "wiggle",
          // Toys & Games
          "toys r us", "hasbro", "lego", "smyths", "mothercare",
          // Beauty & Personal Care
          "boots", "superdrug", "sephora", "ulta", "spacenk", "beauty", "makeup",
          // Home & Garden
          "garden centre", "garden furniture", "wyevale", "thompson morgan", "crocus",
          // General
          "shop", "shopping", "retail", "store", "mall", "boutique", "outlet",
        ],
        subscriptions: [
          // Streaming Video
          "netflix", "disney", "prime video", "hulu", "apple tv", "now tv", "britbox",
          // Music Streaming
          "spotify", "apple music", "amazon music", "tidal", "soundcloud", "deezer",
          // Software & Productivity
          "adobe", "microsoft", "office 365", "creative cloud", "photoshop", "office", "windows",
          "slack", "asana", "monday.com", "notion", "trello", "monday",
          // Cloud & Storage
          "dropbox", "onedrive", "google drive", "google one", "icloud",
          // VPN & Security
          "nordvpn", "expressvpn", "surfshark", "bitdefender", "norton", "mcafee", "kaspersky",
          // Gaming Subscriptions
          "game pass", "playstation plus", "xbox live", "nintendo switch online", "ea play",
          // Learning & Education
          "masterclass", "udemy", "coursera", "skillshare", "duolingo", "babbel",
          // News & Publishing
          "medium", "substack", "patreon", "newsletter",
          // Fitness & Health
          "peloton", "apple fitness", "headspace", "calm", "fitbit",
          // Dating & Social
          "tinder", "bumble", "match", "eharmony", "hinge",
          // Other Services
          "subscription", "member", "membership", "recurring", "subscription box",
        ],
        bills: [
          // Utilities
          "bill", "bills", "utility", "utilities",
          "council tax", "council", "rates", "local authority",
          "water", "sewage", "waste water",
          "gas", "electric", "electricity", "fuel",
          // Broadband & Phone
          "broadband", "internet", "isp", "phone", "mobile", "phone bill",
          "virgin", "bt", "sky", "talktalk", "plusnet", "vodafone", "o2", "ee",
          // Insurance
          "insurance", "home insurance", "contents insurance", "car insurance", "breakdown cover",
          "direct line", "go compare", "confused", "churchill", "admiral",
          // Subscriptions (recurring payments)
          "subscription", "monthly", "annual", "yearly", "renewal",
          // Rent & Housing
          "rent", "mortgage", "landlord", "housing association",
          // Council & Government
          "hmrc", "tv licence", "bbc", "parking fine", "penalty",
          // General
          "payment", "invoice", "statement", "account",
        ],
        savings: [
          // Banks & Accounts
          "bank", "savings", "account", "deposit",
          "hsbc", "barclays", "lloyds", "santander", "natwest", "rbs", "nationwide", "building society",
          // Transfer
          "transfer", "wire", "standing order", "direct debit", "bank transfer",
          // Savings Products
          "savings account", "isa", "premium bonds", "savings bonds", "fixed rate", "notice account",
          // Save & Reserve
          "save", "saving", "reserve", "rainy day", "emergency fund",
          // Investment Apps
          "vanguard", "vanguard", "hargreaves lansdown",
          // General
          "move", "moved", "allocation",
        ],
        investing: [
          // Stock Markets & Trading
          "invest", "investment", "trading", "trader", "exchange", "shares", "stock", "stocks",
          // Brokerage Platforms
          "etoro", "plus500", "ig", "interactive brokers", "capital.com", "lmax", "saxo bank",
          "hargreaves lansdown", "charles schwab", "fidelity", "td ameritrade",
          // Robo Advisors & Investment Apps
          "vanguard", "fidelity", "wealthify", "nutmeg", "betterment", "robinhood", "trading 212", "freetrade", "webuying",
          // Crypto & Digital Assets
          "crypto", "bitcoin", "ethereum", "blockchain", "coinbase", "kraken", "binance", "bitstamp", "gemini",
          // Funds & ETFs
          "fund", "etf", "mutual fund", "index fund", "pension",
          // P2P & Alternative
          "p2p", "peer to peer", "funding circle", "zopa", "rate setter", "lending club",
          // Financial Advisor
          "financial advisor", "ifa", "advisor", "wealth management",
          // Broker & Trading
          "broker", "brokerage", "spread betting", "cfd", "forex",
          // General
          "investor", "trader", "investment portfolio", "portfolio",
        ],
      };

      const searchText = (importedCat + " " + description).toLowerCase();
      
      // Try exact match first on imported category
      if (importedCat) {
        const importedLower = importedCat.toLowerCase();
        const exactMatch = selectedSplitData?.categories.find(
          c => c.name.toLowerCase() === importedLower
        );
        if (exactMatch) {
          return exactMatch.name;
        }
      }
      
      // For each category in the split, try to match keywords
      for (const category of selectedSplitData?.categories || []) {
        const categoryLower = category.name.toLowerCase();
        
        // Get keywords for this category name
        // First try exact key match (e.g., "Shopping" -> keywordsByType.shopping)
        const directKeywords = keywordsByType[categoryLower];
        if (directKeywords && directKeywords.some(kw => searchText.includes(kw))) {
          return category.name;
        }
        
        // Then try partial match on keyword type names
        for (const [typeKey, keywords] of Object.entries(keywordsByType)) {
          if (categoryLower.includes(typeKey) || typeKey.includes(categoryLower)) {
            if (keywords.some(kw => searchText.includes(kw))) {
              return category.name;
            }
          }
        }
      }
      
      // Default to first category or Other
      const defaultCat = selectedSplitData?.categories[0]?.name || "Other";
      return defaultCat;
    };

    // Convert date format from DD/MM/YYYY to YYYY-MM-DD
    const formatDate = (dateStr) => {
      if (!dateStr) return new Date().toISOString().split("T")[0];
      
      // If already in YYYY-MM-DD format, return as-is
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
      
      // Convert DD/MM/YYYY to YYYY-MM-DD
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
        const [day, month, year] = dateStr.split("/");
        return `${year}-${month}-${day}`;
      }
      
      // Try to parse as date and format
      const d = new Date(dateStr);
      if (!isNaN(d)) {
        return d.toISOString().split("T")[0];
      }
      
      return new Date().toISOString().split("T")[0];
    };

    // Convert transactions to purchases with split_id
    const newPurchases = transactions
      .filter(t => t.type === "expense")
      .map(t => {
        const matched = matchCategory(t.category, t.description);
        return {
          id: crypto.randomUUID(),
          split_id: selectedSplit,
          date: formatDate(t.date),
          amount: t.amount,
          category: matched,
          description: t.description || "",
        };
      });

    if (newPurchases.length > 0) {
      setPurchases(prev => [...prev, ...newPurchases]);
      
      // Automatically navigate to the period of the most recent uploaded transaction
      const mostRecentDate = newPurchases.reduce((latest, p) => {
        const pDate = new Date(p.date);
        return pDate > latest ? pDate : latest;
      }, new Date(newPurchases[0].date));
      
      setCurrentDate(mostRecentDate);
      
      setSyncMessage(`Added ${newPurchases.length} purchases from upload ✓ (viewing ${mostRecentDate.toLocaleDateString()})`);
      setTimeout(() => setSyncMessage(""), 3000);
    }
  };

  const handleDeletePurchase = async (purchaseId) => {
    if (!confirm("Are you sure you want to delete this purchase?")) return;

    try {
      const token = localStorage.getItem("auth0Token") || "dev-user";
      const response = await fetch(`${API_URL}/purchases/${purchaseId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setPurchases((prev) => prev.filter((p) => p.id !== purchaseId));
        setSyncMessage("Purchase deleted ✓");
        setTimeout(() => setSyncMessage(""), 2000);
      }
    } catch (err) {
      console.error("Error deleting purchase:", err);
      alert("Failed to delete purchase");
    }
  };

  const previousMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1)
    );
  };

  const nextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1)
    );
  };

  const monthYear = currentDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const getPeriodLabel = () => {
    if (!selectedSplitData) return "";
    const freq = selectedSplitData.frequency;
    
    if (freq === "weekly") {
      const weekStart = new Date(currentDate);
      weekStart.setDate(currentDate.getDate() - currentDate.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      return `Week of ${weekStart.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })} - ${weekEnd.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })}`;
    } else if (freq === "monthly") {
      return monthYear;
    } else if (freq === "yearly") {
      return currentDate.getFullYear().toString();
    }
  };

  const getCurrentPeriodKey = () => {
    if (!selectedSplitData) return "";
    const freq = selectedSplitData.frequency;
    if (freq === "weekly") {
      const weekStart = new Date(currentDate);
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(currentDate.getDate() - currentDate.getDay());
      return `week-${weekStart.toISOString().slice(0,10)}`;
    } else if (freq === "monthly") {
      return `month-${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`;
    } else if (freq === "yearly") {
      return `year-${currentDate.getFullYear()}`;
    }
    return "";
  };

  const getPeriodKeyWithSplit = () => {
    const base = getCurrentPeriodKey();
    return selectedSplit ? `${selectedSplit}-${base}` : base;
  };

  const getPeriodPurchases = () => {
    if (!selectedSplitData) return [];
    const freq = selectedSplitData.frequency;

    if (freq === "weekly") {
      const weekStart = new Date(currentDate);
      weekStart.setDate(currentDate.getDate() - currentDate.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      return filteredPurchases.filter((p) => {
        const pDate = new Date(p.date);
        return pDate >= weekStart && pDate <= weekEnd;
      });
    } else if (freq === "monthly") {
      return filteredPurchases.filter((p) => {
        const pDate = new Date(p.date);
        return (
          pDate.getMonth() === currentDate.getMonth() &&
          pDate.getFullYear() === currentDate.getFullYear()
        );
      });
    } else if (freq === "yearly") {
      return filteredPurchases.filter((p) => {
        const pDate = new Date(p.date);
        return pDate.getFullYear() === currentDate.getFullYear();
      });
    }

    return [];
  };

  // ---- INSIGHTS ANALYTICS ----
  const safeParseDate = (input) => {
    if (input instanceof Date && !isNaN(input)) return input;
    if (!input) return new Date();

    let d = new Date(input);
    if (!isNaN(d)) return d;

    const stripped = String(input)
      .replace(/(\d+)(st|nd|rd|th)/gi, "$1")
      .trim();
    d = new Date(`${stripped} ${new Date().getFullYear()}`);
    if (!isNaN(d)) return d;

    return new Date();
  };

  const parsedPurchases = useMemo(() => {
    return filteredPurchases.map((p) => {
      const date = safeParseDate(p.date);
      const amt = Number(p.amount) || 0;
      const desc = (p.description || "").trim();
      return { ...p, date, amount: amt, description: desc };
    });
  }, [filteredPurchases]);

  const totals = useMemo(() => {
    const expense = parsedPurchases.reduce((sum, p) => sum + p.amount, 0);
    const periodPurchases = getPeriodPurchases();
    const totalBudget = periodPurchases.reduce((sum, p) => sum + p.amount, 0);
    return { expense, totalBudget };
  }, [parsedPurchases]);

  const monthly = useMemo(() => {
    if (!selectedSplitData) return [];
    
    const now = new Date();
    const months = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      months.push({
        key,
        date: d,
        label: d.toLocaleString(undefined, { month: "short", year: "2-digit" }),
      });
    }

    const map = {};
    months.forEach((m) => (map[m.key] = { expense: 0 }));

    parsedPurchases.forEach((p) => {
      const key = p.date.toISOString().slice(0, 7);
      if (!map[key]) return;
      map[key].expense += p.amount;
    });

    const list = months.map((m) => ({
      ...m,
      expense: map[m.key].expense,
    }));

    if (!showCumulative) return list;

    let cum = 0;
    return list.map((l) => {
      cum += l.expense;
      return { ...l, cum };
    });
  }, [parsedPurchases, monthsBack, showCumulative, selectedSplitData]);

  const categoryInsights = useMemo(() => {
    if (!selectedSplitData) return [];
    
    const periodPurchases = getPeriodPurchases();
    const totalSpent = periodPurchases.reduce((sum, p) => sum + p.amount, 0);

    return selectedSplitData.categories.map((cat) => {
      const categoryPurchases = periodPurchases.filter((p) => p.category === cat.name);
      const spent = categoryPurchases.reduce((sum, p) => sum + p.amount, 0);
      const allocatedAmount = (totalSpent * cat.percent) / 100;
      const percentUsed = allocatedAmount > 0 ? (spent / allocatedAmount) * 100 : 0;

      return {
        category: cat.name,
        spent,
        allocated: allocatedAmount,
        percentUsed,
        percent: cat.percent,
      };
    }).sort((a, b) => b.spent - a.spent);
  }, [selectedSplitData, getPeriodPurchases]);

  // ---- CHART COMPONENTS ----
  const Donut = ({ totalSpent, totalBudget, size = 160, thickness = 22 }) => {
    const total = totalBudget || 1;
    const radius = (size - thickness) / 2;
    const circ = 2 * Math.PI * radius;

    const spentArc = Math.min((totalSpent / total) * circ, circ);
    const remainingArc = circ - spentArc;

    const baseStroke = isDarkMode ? "#444" : "#eee";
    const mainTextFill = isDarkMode ? "#f0f0f0" : "#000";
    const subTextFill = isDarkMode ? "#c7c7c7" : "#666";

    return (
      <div style={{ width: size, textAlign: "center" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <g transform={`translate(${size / 2},${size / 2})`}>
            <circle r={radius} fill="none" stroke={baseStroke} strokeWidth={thickness} />

            <circle
              r={radius}
              fill="none"
              stroke={totalSpent > totalBudget ? "#c53030" : "#1c7d3a"}
              strokeWidth={thickness}
              strokeDasharray={`${spentArc} ${circ - spentArc}`}
              transform="rotate(-90)"
            />

            <text x="0" y="4" textAnchor="middle" fontSize="14" fontWeight={600} fill={mainTextFill}>
              £{totalSpent.toFixed(2)}
            </text>
            <text x="0" y="22" textAnchor="middle" fontSize="11" fill={subTextFill}>
              Spent
            </text>
          </g>
        </svg>
        <div className="small text-muted">
          Budget: £{totalBudget.toFixed(2)}
        </div>
      </div>
    );
  };

  const LineChart = ({ data, width = 600, height = 160 }) => {
    if (!data || data.length === 0) return null;

    const values = data.map((d) => Number(showCumulative ? d.cum : d.expense) || 0);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;

    const pad = { l: 28, r: 12, t: 8, b: 24 };
    const w = width - pad.l - pad.r;
    const h = height - pad.t - pad.b;

    const gridColor = isDarkMode ? "#444" : "#eee";
    const labelFill = isDarkMode ? "#c7c7c7" : "#666";
    const pointFill = isDarkMode ? "#111" : "#fff";
    const areaFill = isDarkMode ? "rgba(197,48,48,0.12)" : "rgba(197,48,48,0.08)";

    const pts = values.map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * w + pad.l;
      const y = ((max - v) / range) * h + pad.t;
      return [x, y];
    });

    const d = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
      .join(" ");

    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = pad.t + f * h;
          return <line key={f} x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke={gridColor} />;
        })}

        {data.map((it, i) => {
          const x = (i / Math.max(1, data.length - 1)) * w + pad.l;
          return (
            <text key={i} x={x} y={height - 6} fontSize={11} textAnchor="middle" fill={labelFill}>
              {it.label}
            </text>
          );
        })}

        <path
          d={`${d} L ${width - pad.r},${height - pad.b} L ${pad.l},${height - pad.b} Z`}
          fill={areaFill}
        />
        <path d={d} fill="none" stroke="#c53030" strokeWidth={2} />

        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill={pointFill} stroke="#c53030" strokeWidth={1.2} />
        ))}
      </svg>
    );
  };

  const Bars = ({ items = [], width = 700, height = 220 }) => {
    if (!items.length) return null;

    const pad = { l: 12, r: 12, t: 20, b: 36 };
    const w = width - pad.l - pad.r;
    const h = height - pad.t - pad.b;

    const gap = 12;
    const bw = Math.max(32, (w - (items.length - 1) * gap) / items.length);
    const max = Math.max(...items.map((i) => i.spent), 1);

    const textFill = isDarkMode ? "#ddd" : "#333";

    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
        {items.map((it, idx) => {
          const x = pad.l + idx * (bw + gap);
          const barH = (it.spent / max) * h;
          const y = pad.t + (h - barH);
          const color = it.percentUsed > 100 ? "#c53030" : "#1c7d3a";

          return (
            <g key={idx}>
              <rect x={x} y={y} width={bw} height={barH} fill={color} rx={6} />
              <text x={x + bw / 2} y={height - 12} fontSize={11} fill={textFill} textAnchor="middle">
                {it.category.length > 12 ? it.category.slice(0, 12) + "…" : it.category}
              </text>
              <text x={x + bw / 2} y={y - 8} fontSize={11} fill={textFill} textAnchor="middle">
                £{it.spent.toFixed(0)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  // ---- RENDER ----
  if (savedSplits.length === 0 && !isLoading) {
    return (
      <div className="container-fluid py-4 mt-5" style={{ maxWidth: 900, minHeight: "100vh" }}>
        <Navbar />
        
        <div className="card shadow-sm">
          <div className="card-body text-center py-5">
            <img
              src="/warden.png"
              alt="Warden"
              style={{ maxWidth: "200px", marginBottom: "20px" }}
            />
            <h2 className="h4 mb-3">No Budget Split Found</h2>
            <p className="text-muted mb-4">
              To use Insight Tracker, you need to create a budget split first. 
              This will define your spending categories and allocations.
            </p>
            <Link to="/splitmaker" className="btn btn-primary btn-lg">
              Create Your First Split
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="container-fluid py-4 mt-5"
      style={{ maxWidth: 900, minHeight: "100vh", overflowY: "auto" }}
    >
      <Navbar />

      {/* Main Card Container */}
      <div className="card shadow-sm mb-4">
        <div className="card-body">
          {/* Header + controls */}
          <div className="d-flex align-items-start justify-content-between mb-3">
            <div>
              <h2 className="h5 mb-1">Insight Tracker</h2>
              <p className="text-muted small mb-0">
                Track spending & analyze your budget insights based on your splits
              </p>
            </div>

            {selectedSplitData && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div className="btn-group" role="group">
                  <button
                    className={`btn btn-sm ${monthsBack === 3 ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => setMonthsBack(3)}
                  >
                    3m
                  </button>
                  <button
                    className={`btn btn-sm ${monthsBack === 6 ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => setMonthsBack(6)}
                  >
                    6m
                  </button>
                  <button
                    className={`btn btn-sm ${monthsBack === 12 ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => setMonthsBack(12)}
                  >
                    12m
                  </button>
                </div>

                <div className="form-check form-switch ms-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="cumSwitch"
                    checked={showCumulative}
                    onChange={(e) => setShowCumulative(e.target.checked)}
                  />
                  <label className="form-check-label small" htmlFor="cumSwitch">
                    Cumulative
                  </label>
                </div>
              </div>
            )}
          </div>

          {syncMessage && (
            <div className="alert alert-success alert-dismissible fade show" role="alert">
              {syncMessage}
            </div>
          )}

          {/* Split Selection */}
          <div className="card shadow-sm mb-3">
            <div className="card-body">
              <label className="form-label small fw-semibold">Select Split</label>
              <select
                className="form-select form-select-sm w-auto"
                value={selectedSplit || ""}
                onChange={(e) => setSelectedSplit(e.target.value)}
              >
                <option value="">Choose a split…</option>
                {savedSplits.map((split) => (
                  <option key={split.id} value={split.id}>
                    {split.name} ({split.frequency})
                  </option>
                ))}
              </select>

              {selectedSplitData && (
                <div style={{ marginTop: "12px" }}>
                  <div className="d-flex gap-2 flex-wrap">
                    {selectedSplitData.categories.map((cat) => (
                      <small key={cat.id} className="badge bg-secondary">
                        {cat.name}: {cat.percent}%
                      </small>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {selectedSplit && selectedSplitData && (
            <>
              {/* Quick Add + Upload Section */}
              <div className="row g-3 mb-3">
                <div className="col-12 col-md-6">
                  <div className="card shadow-sm h-100">
                    <div className="card-body">
                      <h2 className="h6 mb-3">Quick Add Purchase</h2>

                      <div className="mb-2">
                        <label className="form-label small">Amount (£)</label>
                        <input
                          className="form-control form-control-sm"
                          type="number"
                          placeholder="0.00"
                          value={quickAdd.amount}
                          onChange={(e) => setQuickAdd({ ...quickAdd, amount: e.target.value })}
                          step="0.01"
                          min="0"
                        />
                      </div>

                      <div className="mb-2">
                        <label className="form-label small">Category</label>
                        <select 
                          className="form-select form-select-sm" 
                          value={quickAdd.category} 
                          onChange={(e) => setQuickAdd({ ...quickAdd, category: e.target.value })}
                        >
                          <option value="">Select category…</option>
                          {selectedSplitData.categories.map((c) => (
                            <option key={c.id} value={c.name}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="mb-2">
                        <label className="form-label small">Description (optional)</label>
                        <input
                          className="form-control form-control-sm"
                          value={quickAdd.description}
                          onChange={(e) => setQuickAdd({ ...quickAdd, description: e.target.value })}
                          placeholder="e.g. Tesco / Rent"
                        />
                      </div>

                      <div className="d-grid gap-2 mt-3">
                        <button 
                          className="btn btn-danger btn-sm w-100" 
                          onClick={() => handleQuickAdd(quickAdd.category)}
                          disabled={!quickAdd.amount || !quickAdd.category}
                        >
                          Add Expense
                        </button>
                        <button
                          className="btn btn-outline-secondary btn-sm w-100"
                          onClick={() => setShowAddModal(true)}
                        >
                          Advanced Add
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-12 col-md-6">
                  <div className="card shadow-sm">
                    <div className="card-body p-2">
                      <h2 className="h6 mb-1">Upload CSV/PDF</h2>
                      <p className="text-muted small mb-2">Import bank statements</p>
                      <div className="d-grid">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => setShowImportModal(true)}
                          aria-label="Import Bank Statement"
                          title="Import Bank Statement"
                        >
                          Import
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts Section */}
              {filteredPurchases.length > 0 ? (
                <div className="row g-3 mb-3">
                  <div className="col-12 col-md-4 d-flex align-items-center justify-content-center">
                    <Donut 
                      totalSpent={totals.expense} 
                      totalBudget={totals.totalBudget}
                    />
                  </div>

                  <div className="col-12 col-md-8">
                    <div className="card p-2" style={{ height: 220 }}>
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <small className="text-muted">{showCumulative ? "Cumulative spending" : "Spending per month"}</small>
                        <small className="text-muted">{monthsBack} months</small>
                      </div>
                      <div style={{ width: "100%", height: 160 }}>
                        <LineChart data={monthly} width={600} height={160} />
                      </div>
                    </div>
                  </div>

                  <div className="col-12">
                    <div className="card p-2">
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <div>
                          <strong>Category Spending Breakdown</strong>
                          <div className="text-muted small">Based on {selectedSplitData.name} split</div>
                        </div>
                        <div className="text-muted small">{categoryInsights.length} categories</div>
                      </div>

                      {categoryInsights.length === 0 ? (
                        <div className="text-muted">No spending data available.</div>
                      ) : (
                        <div style={{ minHeight: 260 }}>
                          <Bars items={categoryInsights} width={700} height={220} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-muted mb-3">No transactions to show. Add some purchases to see insights.</div>
              )}

              {/* Purchases Table */}
              <div className="card shadow-sm mb-3">
                <div className="card-body">
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="h6 mb-0">Purchases - {getPeriodLabel()}</h2>
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        onClick={previousMonth}
                      >
                        ← Previous
                      </button>
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        onClick={nextMonth}
                      >
                        Next →
                      </button>
                    </div>
                  </div>

                  <div className="table-responsive" style={{ maxHeight: "400px", overflowY: "auto" }}>
                    <table className="table table-sm table-hover table-bordered mb-0">
                      <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                        <tr>
                          <th style={{ width: "120px" }}>Date</th>
                          <th style={{ width: "150px" }}>Category</th>
                          <th style={{ width: "120px" }} className="text-end">Amount</th>
                          <th>Description</th>
                          <th style={{ width: "80px" }} className="text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getPeriodPurchases().length === 0 ? (
                          <tr>
                            <td colSpan="5" className="text-center text-muted py-4">
                              No purchases for this period. Use Quick Add to get started.
                            </td>
                          </tr>
                        ) : (
                          getPeriodPurchases()
                            .sort((a, b) => new Date(b.date) - new Date(a.date))
                            .map((purchase) => {
                              const categoryData = selectedSplitData?.categories.find(
                                (c) => c.name === purchase.category
                              );
                              return (
                                <tr key={purchase.id}>
                                  <td>
                                    {new Date(purchase.date).toLocaleDateString("en-GB", {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </td>
                                  <td>
                                    <span className="badge bg-secondary">
                                      {purchase.category}
                                    </span>
                                    {categoryData && (
                                      <span className="text-muted small ms-1">
                                        ({categoryData.percent}%)
                                      </span>
                                    )}
                                  </td>
                                  <td className="text-end fw-bold">£{purchase.amount.toFixed(2)}</td>
                                  <td className="text-muted">{purchase.description || "—"}</td>
                                  <td className="text-center">
                                    <button
                                      className="btn btn-sm btn-outline-danger"
                                      onClick={() => handleDeletePurchase(purchase.id)}
                                      title="Delete"
                                    >
                                      ×
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                        )}
                      </tbody>
                      <tfoot className="fw-bold">
                        <tr>
                          <td colSpan="2" className="text-end">Total:</td>
                          <td className="text-end">
                            £{getPeriodPurchases().reduce((sum, p) => sum + p.amount, 0).toFixed(2)}
                          </td>
                          <td colSpan="2"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              {filteredPurchases.length > 0 && (
                <div className="card shadow-sm mb-3">
                  <div className="card-body">
                    <h6 className="mb-3">
                      {selectedSplitData.frequency === "weekly" ? "Weekly" : selectedSplitData.frequency === "monthly" ? "Monthly" : "Yearly"} Summary - {getPeriodLabel()}
                    </h6>
                    <div className="row">
                      {selectedSplitData?.categories.map((cat) => {
                        const categoryPurchases = getPeriodPurchases().filter((p) => p.category === cat.name);
                        const categoryTotal = categoryPurchases.reduce((sum, p) => sum + p.amount, 0);
                        const totalSpent = getPeriodPurchases().reduce((sum, p) => sum + p.amount, 0);
                        const allocatedAmount = (totalSpent * cat.percent) / 100;
                        const percentUsed = totalSpent > 0 ? (categoryTotal / allocatedAmount) * 100 : 0;
                        const barWidth = Math.min(percentUsed, 100);
                        
                        return (
                          <div key={cat.id} className="col-md-4 mb-3">
                            <div className="card p-2">
                              <div className="small text-muted">{cat.name}</div>
                              <div className="fw-bold">£{categoryTotal.toFixed(2)}</div>
                              <div className="small text-muted">
                                {cat.percent}% allocated (£{allocatedAmount.toFixed(2)} budget)
                              </div>
                              <div className="progress mt-2" style={{ height: "6px" }}>
                                <div
                                  className={`progress-bar ${percentUsed > 100 ? "bg-danger" : "bg-success"}`}
                                  role="progressbar"
                                  style={{ width: `${barWidth}%` }}
                                  aria-valuenow={barWidth}
                                  aria-valuemin="0"
                                  aria-valuemax="100"
                                ></div>
                              </div>
                              <div className="small text-muted mt-1">
                                {percentUsed > 100 ? "⚠️" : "✓"} {percentUsed.toFixed(0)}% of budget used
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add Purchase Modal */}
      {showAddModal && (
        <div className="modal d-block" style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }} role="dialog">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add Purchase</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowAddModal(false)}
                />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label small">Date</label>
                  <input
                    type="date"
                    className="form-control form-control-sm"
                    value={newPurchase.date}
                    onChange={(e) =>
                      setNewPurchase({ ...newPurchase, date: e.target.value })
                    }
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label small">Amount (£)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control form-control-sm"
                    value={newPurchase.amount}
                    onChange={(e) =>
                      setNewPurchase({ ...newPurchase, amount: e.target.value })
                    }
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label small">Category</label>
                  <select
                    className="form-select form-select-sm"
                    value={newPurchase.category}
                    onChange={(e) =>
                      setNewPurchase({ ...newPurchase, category: e.target.value })
                    }
                  >
                    <option value="">Select category…</option>
                    {selectedSplitData?.categories.map((cat) => (
                      <option key={cat.id} value={cat.name}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-3">
                  <label className="form-label small">Description (optional)</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={newPurchase.description}
                    onChange={(e) =>
                      setNewPurchase({ ...newPurchase, description: e.target.value })
                    }
                    placeholder="e.g. Tesco shopping"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleAddPurchase}
                >
                  Add Purchase
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Over Budget Alert Modal */}
      {showOverBudgetAlert && (
        <div className="modal d-block" style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }} role="dialog">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-danger">
              <div className="modal-header bg-danger text-white">
                <h5 className="modal-title">⚠️ Budget Alert</h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => {
                    setShowOverBudgetAlert(false);
                    setAlertShownKey(getPeriodKeyWithSplit());
                  }}
                />
              </div>
              <div className="modal-body text-center">
                <img
                  src="/warden.png"
                  alt="Warden"
                  style={{ maxWidth: "200px", marginBottom: "20px" }}
                />
                <h6 className="text-danger fw-bold mb-3">You've exceeded your budget!</h6>
                <div className="alert alert-danger">
                  {overBudgetCategories.map((cat, idx) => (
                    <div key={idx} className="mb-2">
                      <strong>{cat.name}:</strong> £{cat.spent.toFixed(2)} spent of £{cat.budget.toFixed(2)} ({cat.percent.toFixed(0)}%)
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    setShowOverBudgetAlert(false);
                    setAlertShownKey(getPeriodKeyWithSplit());
                  }}
                >
                  Acknowledge
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Bank Statement Modal */}
      {showImportModal && (
        <div 
          className="modal d-block" 
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
          role="dialog"
        >
          <div className="modal-dialog modal-lg" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Import Bank Statement</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowImportModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                <CsvPdfUpload onSave={handleBulkAdd} onClose={() => setShowImportModal(false)} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
