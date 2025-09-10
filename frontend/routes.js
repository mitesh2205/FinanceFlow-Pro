/**
 * Route Configuration for FinanceFlow Pro
 * Defines all application routes and their handlers
 */

// Import the router
// Note: router.js should be loaded before this file

// Authentication middleware
const authMiddleware = async (context) => {
  const token = localStorage.getItem('financeflow_token');
  
  // Skip auth check for login and public routes
  const publicRoutes = ['/login', '/register', '/forgot-password'];
  if (publicRoutes.includes(context.path)) {
    return true;
  }
  
  if (!token) {
    console.log('No auth token found, redirecting to login');
    router.navigate('/login', { replace: true });
    return false; // Block navigation
  }
  
  return true; // Allow navigation
};

// Page initialization functions
const PageInitializers = {
  async dashboard(context) {
    await updatePageUI('dashboard', 'Dashboard');
    await initializeDashboard();
  },

  async transactions(context) {
    await updatePageUI('transactions', 'Transactions');
    
    // Handle query parameters for filtering
    const filters = {};
    if (context.query.category) filters.category = context.query.category;
    if (context.query.account) filters.account = context.query.account;
    if (context.query.dateFrom) filters.dateFrom = context.query.dateFrom;
    if (context.query.dateTo) filters.dateTo = context.query.dateTo;
    
    await initializeTransactions(filters);
  },

  async transactionDetail(context) {
    const transactionId = context.params.id;
    await updatePageUI('transaction-detail', `Transaction #${transactionId}`);
    await initializeTransactionDetail(transactionId);
  },

  async accounts(context) {
    await updatePageUI('accounts', 'Account Management');
    await initializeAccounts();
  },

  async accountDetail(context) {
    const accountName = decodeURIComponent(context.params.name);
    await updatePageUI('account-detail', `Account: ${accountName}`);
    await initializeAccountDetail(accountName);
  },

  async budget(context) {
    await updatePageUI('budget', 'Budget Planner');
    await initializeBudget();
  },

  async goals(context) {
    await updatePageUI('goals', 'Goals & Savings');
    await initializeGoals();
  },

  async investments(context) {
    await updatePageUI('investments', 'Investments');
    await initializeInvestments();
  },

  async analytics(context) {
    await updatePageUI('analytics', 'Analytics & Reports');
    await initializeAnalytics();
  },

  async upload(context) {
    await updatePageUI('upload', 'Upload Statements');
    await initializeUpload();
  },

  async settings(context) {
    await updatePageUI('settings', 'Settings');
    await initializeSettings();
  },

  async login(context) {
    // For login page, just show the page (handled separately in login.html)
    window.location.href = 'login.html';
  },

  async notFound(context) {
    await updatePageUI('dashboard', 'Page Not Found');
    showToast('Page not found. Redirecting to dashboard.', 'error');
  }
};

// Helper function to update page UI
async function updatePageUI(pageId, title) {
  // Update active navigation
  updateActiveNavigation(pageId);
  
  // Update page visibility
  updateActivePageContent(pageId);
  
  // Update page title
  updatePageTitle(title);
  
  // Update document title
  document.title = `${title} - FinanceFlow Pro`;
  
  // Close mobile sidebar if open
  closeMobileSidebar();
}

function updateActiveNavigation(pageId) {
  // Remove active class from all nav links
  document.querySelectorAll('.sidebar__link').forEach(link => {
    link.classList.remove('active');
  });
  
  // Add active class to current nav link
  const activeLink = document.querySelector(`[data-page="${pageId}"]`);
  if (activeLink) {
    activeLink.classList.add('active');
  }
}

function updateActivePageContent(pageId) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  
  // Show current page
  const activePage = document.getElementById(pageId);
  if (activePage) {
    activePage.classList.add('active');
  } else {
    // Fallback to dashboard if page doesn't exist
    const dashboard = document.getElementById('dashboard');
    if (dashboard) {
      dashboard.classList.add('active');
    }
  }
}

function updatePageTitle(title) {
  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle) {
    pageTitle.textContent = title;
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar && window.innerWidth <= 768) {
    sidebar.classList.remove('open');
  }
}

// Route Definitions
function setupRoutes() {
  // Add authentication middleware
  router.use(authMiddleware);
  
  // Define all routes
  router
    .route('/', {
      handler: PageInitializers.dashboard,
      title: 'Dashboard - FinanceFlow Pro'
    })
    .route('/dashboard', {
      handler: PageInitializers.dashboard,
      title: 'Dashboard - FinanceFlow Pro'
    })
    .route('/transactions', {
      handler: PageInitializers.transactions,
      title: 'Transactions - FinanceFlow Pro'
    })
    .route('/transactions/:id', {
      handler: PageInitializers.transactionDetail,
      title: (context) => `Transaction #${context.params.id} - FinanceFlow Pro`
    })
    .route('/accounts', {
      handler: PageInitializers.accounts,
      title: 'Accounts - FinanceFlow Pro'
    })
    .route('/accounts/:name', {
      handler: PageInitializers.accountDetail,
      title: (context) => `${decodeURIComponent(context.params.name)} - FinanceFlow Pro`
    })
    .route('/budget', {
      handler: PageInitializers.budget,
      title: 'Budget - FinanceFlow Pro'
    })
    .route('/goals', {
      handler: PageInitializers.goals,
      title: 'Goals - FinanceFlow Pro'
    })
    .route('/investments', {
      handler: PageInitializers.investments,
      title: 'Investments - FinanceFlow Pro'
    })
    .route('/analytics', {
      handler: PageInitializers.analytics,
      title: 'Analytics - FinanceFlow Pro'
    })
    .route('/upload', {
      handler: PageInitializers.upload,
      title: 'Upload - FinanceFlow Pro'
    })
    .route('/settings', {
      handler: PageInitializers.settings,
      title: 'Settings - FinanceFlow Pro'
    })
    .route('/login', {
      handler: PageInitializers.login,
      title: 'Login - FinanceFlow Pro'
    })
    .route('/404', {
      handler: PageInitializers.notFound,
      title: 'Page Not Found - FinanceFlow Pro'
    });
}

// Navigation helper functions
const Navigation = {
  // Navigate to a specific page
  to(page, params = {}, query = {}) {
    const routes = {
      dashboard: '/',
      transactions: '/transactions',
      accounts: '/accounts',
      budget: '/budget',
      goals: '/goals',
      investments: '/investments',
      analytics: '/analytics',
      upload: '/upload',
      settings: '/settings'
    };
    
    const basePath = routes[page] || '/';
    const url = router.url(basePath, params, query);
    router.navigate(url);
  },

  // Navigate to transaction detail
  toTransaction(id) {
    router.navigate(router.url('/transactions/:id', { id }));
  },

  // Navigate to account detail
  toAccount(accountName) {
    router.navigate(router.url('/accounts/:name', { name: encodeURIComponent(accountName) }));
  },

  // Navigate to transactions with filters
  toTransactionsWithFilters(filters = {}) {
    router.navigate(router.url('/transactions', {}, filters));
  },

  // Go back in history
  back() {
    window.history.back();
  },

  // Go forward in history
  forward() {
    window.history.forward();
  },

  // Check if current route is active
  isActive(page) {
    const routes = {
      dashboard: ['/', '/dashboard'],
      transactions: ['/transactions'],
      accounts: ['/accounts'],
      budget: ['/budget'],
      goals: ['/goals'],
      investments: ['/investments'],
      analytics: ['/analytics'],
      upload: ['/upload'],
      settings: ['/settings']
    };
    
    const currentRoute = router.getCurrentRoute();
    if (!currentRoute) return false;
    
    const pagePaths = routes[page] || [];
    return pagePaths.some(path => 
      currentRoute.path === path || currentRoute.path.startsWith(path + '/')
    );
  }
};

// Initialize routing system
function initializeRouting() {
  // Set up routes
  setupRoutes();
  
  // Initialize the router
  router.init();
  
  // Update navigation event handlers
  setupNavigationEventHandlers();
  
  // Make Navigation available globally
  window.Navigation = Navigation;
  
  console.log('Routing system initialized');
}

function setupNavigationEventHandlers() {
  // Convert existing data-page links to proper href attributes
  document.querySelectorAll('[data-page]').forEach(link => {
    const page = link.getAttribute('data-page');
    const routes = {
      dashboard: '/',
      transactions: '/transactions',
      accounts: '/accounts',
      budget: '/budget',
      goals: '/goals',
      investments: '/investments',
      analytics: '/analytics',
      upload: '/upload',
      settings: '/settings'
    };
    
    const href = routes[page] || '/';
    link.setAttribute('href', href);
    
    // Remove old event handlers by cloning the element
    const newLink = link.cloneNode(true);
    link.parentNode.replaceChild(newLink, link);
  });
  
  // Handle view-all buttons and other navigation elements
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('view-all-btn')) {
      e.preventDefault();
      const targetPage = e.target.getAttribute('data-page');
      if (targetPage) {
        Navigation.to(targetPage);
      }
    }
  });
}

// Placeholder for missing page initializers (these should be implemented in app.js)
async function initializeTransactionDetail(id) {
  console.log(`Initialize transaction detail for ID: ${id}`);
  showToast('Transaction detail view coming soon!', 'info');
}

async function initializeAccountDetail(accountName) {
  console.log(`Initialize account detail for: ${accountName}`);
  showToast('Account detail view coming soon!', 'info');
}

async function initializeSettings() {
  console.log('Initialize settings page');
  showToast('Settings page coming soon!', 'info');
}

// Export the initialization function
window.initializeRouting = initializeRouting;
window.Navigation = Navigation;
