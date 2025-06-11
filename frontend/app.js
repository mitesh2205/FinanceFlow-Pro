// API Configuration
const API_BASE_URL = 'http://localhost:3001/api';

// Global variables
let currentPage = 'dashboard';
let charts = {};
let filteredTransactions = [];
let editingTransactionId = null; // Track which transaction is being edited
let appData = {
  accounts: [],
  transactions: [],
  budgets: [],
  goals: [],
  investments: [],
  categories: [
    "Food & Dining", "Transportation", "Entertainment", "Bills & Utilities", 
    "Shopping", "Healthcare", "Education", "Travel", "Income", "Transfer"
  ],
  monthlyData: []
};

// API Helper Functions
async function apiRequest(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API Request failed:', error);
    showToast(`Error: ${error.message}`, 'error');
    throw error;
  }
}

// Data Loading Functions
async function loadAccounts() {
  try {
    appData.accounts = await apiRequest('/accounts');
  } catch (error) {
    console.error('Failed to load accounts:', error);
  }
}

async function loadTransactions(filters = {}) {
  try {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });
    
    const endpoint = `/transactions${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    appData.transactions = await apiRequest(endpoint);
    filteredTransactions = [...appData.transactions];
  } catch (error) {
    console.error('Failed to load transactions:', error);
  }
}

async function loadBudgets() {
  try {
    appData.budgets = await apiRequest('/budgets');
  } catch (error) {
    console.error('Failed to load budgets:', error);
  }
}

async function loadGoals() {
  try {
    appData.goals = await apiRequest('/goals');
  } catch (error) {
    console.error('Failed to load goals:', error);
  }
}

async function loadInvestments() {
  try {
    appData.investments = await apiRequest('/investments');
  } catch (error) {
    console.error('Failed to load investments:', error);
  }
}

async function loadDashboardData() {
  try {
    const dashboardData = await apiRequest('/dashboard');
    appData.monthlyData = dashboardData.monthly_data || [];
    // Update overview cards with real data
    updateOverviewCards(dashboardData);
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
  }
}

function updateOverviewCards(data) {
  const totalBalanceElement = document.querySelector('.overview-card:nth-child(1) .amount');
  const monthlyIncomeElement = document.querySelector('.overview-card:nth-child(2) .amount');
  const monthlyExpensesElement = document.querySelector('.overview-card:nth-child(3) .amount');
  const savingsRateElement = document.querySelector('.overview-card:nth-child(4) .amount');

  if (totalBalanceElement) totalBalanceElement.textContent = formatCurrency(data.total_balance || 0);
  if (monthlyIncomeElement) monthlyIncomeElement.textContent = formatCurrency(data.monthly_income || 0);
  if (monthlyExpensesElement) monthlyExpensesElement.textContent = formatCurrency(data.monthly_expenses || 0);
  if (savingsRateElement) savingsRateElement.textContent = `${data.savings_rate || 0}%`;
}

// Utility Functions
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Navigation Functions
function initializeNavigation() {
  const sidebarLinks = document.querySelectorAll('.sidebar__link');
  const pages = document.querySelectorAll('.page');
  const pageTitle = document.getElementById('pageTitle');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');

  sidebarLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetPage = link.getAttribute('data-page');
      
      if (targetPage) {
        navigateToPage(targetPage);
      }
    });
  });

  // Handle view all buttons
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('view-all-btn')) {
      e.preventDefault();
      const targetPage = e.target.getAttribute('data-page');
      if (targetPage) {
        navigateToPage(targetPage);
      }
    }
  });

  // Sidebar toggle for mobile
  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  async function navigateToPage(page) {
    // Update active link
    sidebarLinks.forEach(link => link.classList.remove('active'));
    document.querySelector(`[data-page="${page}"]`).classList.add('active');
    
    // Update active page
    pages.forEach(p => p.classList.remove('active'));
    document.getElementById(page).classList.add('active');
    
    // Update page title
    const pageTitles = {
      dashboard: 'Dashboard',
      transactions: 'Transactions',
      budget: 'Budget Planner',
      goals: 'Goals & Savings',
      investments: 'Investments',
      analytics: 'Analytics & Reports',
      upload: 'Upload Statements',
      settings: 'Settings'
    };
    pageTitle.textContent = pageTitles[page] || 'Dashboard';
    
    currentPage = page;
    
    // Initialize page-specific content
    switch(page) {
      case 'dashboard':
        await initializeDashboard();
        break;
      case 'transactions':
        await initializeTransactions();
        break;
      case 'budget':
        await initializeBudget();
        break;
      case 'goals':
        await initializeGoals();
        break;
      case 'investments':
        await initializeInvestments();
        break;
      case 'analytics':
        await initializeAnalytics();
        break;
      case 'upload':
        initializeUpload();
        break;
    }
    
    // Close sidebar on mobile after navigation
    if (window.innerWidth <= 768) {
      sidebar.classList.remove('open');
    }
  }
}

// Dashboard Functions
async function initializeDashboard() {
  try {
    await Promise.all([
      loadDashboardData(),
      loadTransactions(),
      loadBudgets()
    ]);
    
    renderRecentTransactions();
    renderBudgetProgress();
    initializeCharts();
  } catch (error) {
    console.error('Failed to initialize dashboard:', error);
    showToast('Failed to load dashboard data', 'error');
  }
}

function renderRecentTransactions() {
  const container = document.getElementById('recentTransactions');
  const recentTransactions = appData.transactions.slice(0, 5);
  
  container.innerHTML = recentTransactions.map(transaction => `
    <div class="transaction-item">
      <div class="transaction-info">
        <div class="transaction-description">${transaction.description}</div>
        <div class="transaction-meta">${formatDate(transaction.date)} • ${transaction.category}</div>
      </div>
      <div class="transaction-amount ${transaction.amount < 0 ? 'amount--negative' : 'amount--positive'}">
        ${formatCurrency(transaction.amount)}
      </div>
    </div>
  `).join('');
}

function renderBudgetProgress() {
  const container = document.getElementById('budgetProgress');
  
  container.innerHTML = appData.budgets.map(budget => {
    const percentage = (budget.spent / budget.budgeted) * 100;
    const isOverBudget = percentage > 100;
    
    return `
      <div class="budget-item">
        <div class="budget-header">
          <div class="budget-category">${budget.category}</div>
          <div class="budget-amounts">${formatCurrency(budget.spent)} / ${formatCurrency(budget.budgeted)}</div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${isOverBudget ? 'over-budget' : ''}" style="width: ${Math.min(percentage, 100)}%"></div>
        </div>
        <div class="budget-status ${isOverBudget ? 'amount--negative' : ''}">
          ${isOverBudget ? 'Over budget' : formatCurrency(budget.remaining) + ' remaining'}
        </div>
      </div>
    `;
  }).join('');
}

function initializeCharts() {
  // Cash Flow Chart
  const cashFlowCtx = document.getElementById('cashFlowChart');
  if (cashFlowCtx && appData.monthlyData.length > 0) {
    if (charts.cashFlow) {
      charts.cashFlow.destroy();
    }
    
    charts.cashFlow = new Chart(cashFlowCtx, {
      type: 'line',
      data: {
        labels: appData.monthlyData.map(d => d.month),
        datasets: [
          {
            label: 'Income',
            data: appData.monthlyData.map(d => d.income),
            borderColor: '#1FB8CD',
            backgroundColor: 'rgba(31, 184, 205, 0.1)',
            tension: 0.4
          },
          {
            label: 'Expenses',
            data: appData.monthlyData.map(d => d.expenses),
            borderColor: '#B4413C',
            backgroundColor: 'rgba(180, 65, 60, 0.1)',
            tension: 0.4
          },
          {
            label: 'Savings',
            data: appData.monthlyData.map(d => d.savings),
            borderColor: '#D2BA4C',
            backgroundColor: 'rgba(210, 186, 76, 0.1)',
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '$' + value.toLocaleString();
              }
            }
          }
        }
      }
    });
  }

  // Expense Breakdown Chart
  const expenseCtx = document.getElementById('expenseChart');
  if (expenseCtx && appData.budgets.length > 0) {
    if (charts.expense) {
      charts.expense.destroy();
    }
    
    charts.expense = new Chart(expenseCtx, {
      type: 'doughnut',
      data: {
        labels: appData.budgets.map(b => b.category),
        datasets: [{
          data: appData.budgets.map(b => b.spent),
          backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F'],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }
}

// Transaction Functions
async function initializeTransactions() {
  try {
    await Promise.all([
      loadTransactions(),
      loadAccounts()
    ]);
    
    renderTransactionFilters();
    renderTransactionTable();
    setupTransactionEventListeners();
  } catch (error) {
    console.error('Failed to initialize transactions:', error);
    showToast('Failed to load transactions', 'error');
  }
}

function renderTransactionFilters() {
  const categoryFilter = document.getElementById('categoryFilter');
  const accountFilter = document.getElementById('accountFilter');
  
  if (categoryFilter) {
    categoryFilter.innerHTML = '<option value="">All Categories</option>' +
      appData.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
  }
  
  if (accountFilter) {
    accountFilter.innerHTML = '<option value="">All Accounts</option>' +
      appData.accounts.map(acc => `<option value="${acc.name}">${acc.name}</option>`).join('');
  }
}

function renderTransactionTable() {
  const container = document.getElementById('transactionTable');
  
  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Description</th>
          <th>Category</th>
          <th>Account</th>
          <th>Amount</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filteredTransactions.map(transaction => `
          <tr>
            <td>${formatDate(transaction.date)}</td>
            <td>${transaction.description}</td>
            <td><span class="status status--info">${transaction.category}</span></td>
            <td>${transaction.account_name}</td>
            <td class="${transaction.amount < 0 ? 'amount--negative' : 'amount--positive'}">
              ${formatCurrency(transaction.amount)}
            </td>
            <td>
              <button class="btn btn--sm btn--outline edit-transaction" data-id="${transaction.id}">Edit</button>
              <button class="btn btn--sm btn--outline delete-transaction" data-id="${transaction.id}">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  // Add event listeners for edit and delete buttons
  container.querySelectorAll('.edit-transaction').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      await editTransaction(id);
    });
  });

  container.querySelectorAll('.delete-transaction').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      if (confirm('Are you sure you want to delete this transaction?')) {
        await deleteTransaction(id);
      }
    });
  });
}

async function editTransaction(id) {
  const transaction = appData.transactions.find(t => t.id == id);
  if (!transaction) {
    showToast('Transaction not found', 'error');
    return;
  }

  // Set editing mode
  editingTransactionId = id;
  
  // Populate the modal with transaction data
  populateTransactionModal(transaction);
  
  // Change modal title and button text
  const modalTitle = document.querySelector('#addTransactionModal h3');
  const submitButton = document.querySelector('#addTransactionModal button[type="submit"]');
  
  if (modalTitle) modalTitle.textContent = 'Edit Transaction';
  if (submitButton) submitButton.textContent = 'Update Transaction';
  
  // Show the modal
  document.getElementById('addTransactionModal').classList.add('active');
}

async function deleteTransaction(id) {
  try {
    await apiRequest(`/transactions/${id}`, { method: 'DELETE' });
    showToast('Transaction deleted successfully');
    await loadTransactions();
    renderTransactionTable();
    // Refresh dashboard if we're on it
    if (currentPage === 'dashboard') {
      await loadDashboardData();
      renderRecentTransactions();
    }
  } catch (error) {
    console.error('Failed to delete transaction:', error);
  }
}

function setupTransactionEventListeners() {
  // Filter toggle
  const filterBtn = document.getElementById('filterBtn');
  const transactionFilters = document.getElementById('transactionFilters');
  
  if (filterBtn) {
    filterBtn.addEventListener('click', () => {
      transactionFilters.style.display = transactionFilters.style.display === 'none' ? 'block' : 'none';
    });
  }

  // Apply filters
  const applyFilters = document.getElementById('applyFilters');
  if (applyFilters) {
    applyFilters.addEventListener('click', applyTransactionFilters);
  }

  // Add transaction modal
  const addTransactionBtn = document.getElementById('addTransactionBtn');
  const addTransactionModal = document.getElementById('addTransactionModal');
  const cancelTransaction = document.getElementById('cancelTransaction');
  
  if (addTransactionBtn) {
    addTransactionBtn.addEventListener('click', () => {
      // Reset editing mode
      editingTransactionId = null;
      
      // Reset modal title and button text
      const modalTitle = document.querySelector('#addTransactionModal h3');
      const submitButton = document.querySelector('#addTransactionModal button[type="submit"]');
      
      if (modalTitle) modalTitle.textContent = 'Add Transaction';
      if (submitButton) submitButton.textContent = 'Add Transaction';
      
      populateTransactionModal();
      addTransactionModal.classList.add('active');
    });
  }
  
  if (cancelTransaction) {
    cancelTransaction.addEventListener('click', () => {
      editingTransactionId = null;
      addTransactionModal.classList.remove('active');
    });
  }

  // Add/Edit transaction form
  const addTransactionForm = document.getElementById('addTransactionForm');
  if (addTransactionForm) {
    addTransactionForm.addEventListener('submit', handleAddEditTransaction);
  }
}

function populateTransactionModal(transaction = null) {
  const categorySelect = document.getElementById('transactionCategory');
  const accountSelect = document.getElementById('transactionAccount');
  const dateInput = document.getElementById('transactionDate');
  const descriptionInput = document.getElementById('transactionDescription');
  const amountInput = document.getElementById('transactionAmount');
  
  if (categorySelect) {
    categorySelect.innerHTML = appData.categories.map(cat => 
      `<option value="${cat}" ${transaction && transaction.category === cat ? 'selected' : ''}>${cat}</option>`
    ).join('');
  }
  
  if (accountSelect) {
    accountSelect.innerHTML = appData.accounts.map(acc => 
      `<option value="${acc.name}" ${transaction && transaction.account_name === acc.name ? 'selected' : ''}>${acc.name}</option>`
    ).join('');
  }
  
  if (dateInput) {
    dateInput.value = transaction ? transaction.date : new Date().toISOString().split('T')[0];
  }
  
  if (descriptionInput) {
    descriptionInput.value = transaction ? transaction.description : '';
  }
  
  if (amountInput) {
    amountInput.value = transaction ? transaction.amount : '';
  }
}

async function applyTransactionFilters() {
  const categoryFilter = document.getElementById('categoryFilter').value;
  const accountFilter = document.getElementById('accountFilter').value;
  const dateFromFilter = document.getElementById('dateFromFilter').value;
  const dateToFilter = document.getElementById('dateToFilter').value;
  
  const filters = {};
  if (categoryFilter) filters.category = categoryFilter;
  if (accountFilter) filters.account = accountFilter;
  if (dateFromFilter) filters.dateFrom = dateFromFilter;
  if (dateToFilter) filters.dateTo = dateToFilter;
  
  await loadTransactions(filters);
  renderTransactionTable();
  showToast('Filters applied successfully');
}

async function handleAddEditTransaction(e) {
  e.preventDefault();
  
  const transactionData = {
    date: document.getElementById('transactionDate').value,
    description: document.getElementById('transactionDescription').value,
    amount: parseFloat(document.getElementById('transactionAmount').value),
    category: document.getElementById('transactionCategory').value,
    account_name: document.getElementById('transactionAccount').value
  };
  
  try {
    if (editingTransactionId) {
      // Update existing transaction
      await apiRequest(`/transactions/${editingTransactionId}`, {
        method: 'PUT',
        body: JSON.stringify(transactionData)
      });
      showToast('Transaction updated successfully');
      editingTransactionId = null;
    } else {
      // Create new transaction
      await apiRequest('/transactions', {
        method: 'POST',
        body: JSON.stringify(transactionData)
      });
      showToast('Transaction added successfully');
    }
    
    await loadTransactions();
    renderTransactionTable();
    document.getElementById('addTransactionModal').classList.remove('active');
    e.target.reset();
    
    // Refresh dashboard if we're on it
    if (currentPage === 'dashboard') {
      await loadDashboardData();
      renderRecentTransactions();
    }
  } catch (error) {
    console.error('Failed to save transaction:', error);
  }
}

// Budget Functions
async function initializeBudget() {
  try {
    await loadBudgets();
    renderBudgetCategories();
  } catch (error) {
    console.error('Failed to initialize budget:', error);
    showToast('Failed to load budget data', 'error');
  }
}

function renderBudgetCategories() {
  const container = document.getElementById('budgetCategories');
  
  container.innerHTML = appData.budgets.map(budget => {
    const percentage = (budget.spent / budget.budgeted) * 100;
    const isOverBudget = percentage > 100;
    
    return `
      <div class="card budget-item">
        <div class="card__body">
          <div class="budget-header">
            <div class="budget-category">${budget.category}</div>
            <div class="budget-amounts">${formatCurrency(budget.spent)} / ${formatCurrency(budget.budgeted)}</div>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${isOverBudget ? 'over-budget' : ''}" style="width: ${Math.min(percentage, 100)}%"></div>
          </div>
          <div class="budget-status ${isOverBudget ? 'amount--negative' : ''}">
            ${isOverBudget ? 'Over budget by ' + formatCurrency(budget.spent - budget.budgeted) : formatCurrency(budget.remaining) + ' remaining'}
          </div>
          <div style="margin-top: 12px;">
            <button class="btn btn--sm btn--outline">Edit Budget</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Goals Functions
async function initializeGoals() {
  try {
    await loadGoals();
    renderGoals();
  } catch (error) {
    console.error('Failed to initialize goals:', error);
    showToast('Failed to load goals data', 'error');
  }
}

function renderGoals() {
  const container = document.getElementById('goalsGrid');
  
  container.innerHTML = appData.goals.map(goal => {
    const percentage = (goal.current / goal.target) * 100;
    const daysLeft = Math.ceil((new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24));
    
    return `
      <div class="card goal-card">
        <div class="card__body">
          <div class="goal-header">
            <h3 class="goal-name">${goal.name}</h3>
            <div class="goal-deadline">${daysLeft} days left</div>
          </div>
          <div class="goal-progress">
            <div class="goal-amounts">
              <span class="goal-current">${formatCurrency(goal.current)}</span>
              <span class="goal-target">${formatCurrency(goal.target)}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${percentage}%"></div>
            </div>
            <div class="goal-percentage">${percentage.toFixed(1)}% complete</div>
          </div>
          <div style="margin-top: 16px;">
            <button class="btn btn--sm btn--primary" onclick="addMoneyToGoal(${goal.id})">Add Money</button>
            <button class="btn btn--sm btn--outline">Edit Goal</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function addMoneyToGoal(goalId) {
  const amount = prompt('Enter amount to add:');
  if (amount && !isNaN(amount)) {
    try {
      const goal = appData.goals.find(g => g.id === goalId);
      const newCurrent = goal.current + parseFloat(amount);
      
      await apiRequest(`/goals/${goalId}`, {
        method: 'PUT',
        body: JSON.stringify({ current: newCurrent })
      });
      
      await loadGoals();
      renderGoals();
      showToast('Goal updated successfully');
    } catch (error) {
      console.error('Failed to update goal:', error);
    }
  }
}

// Investment Functions
async function initializeInvestments() {
  try {
    await loadInvestments();
    renderInvestmentHoldings();
  } catch (error) {
    console.error('Failed to initialize investments:', error);
    showToast('Failed to load investment data', 'error');
  }
}

function renderInvestmentHoldings() {
  const container = document.getElementById('investmentHoldings');
  
  container.innerHTML = appData.investments.map(investment => `
    <div class="card investment-item">
      <div class="card__body">
        <div class="investment-info">
          <h4>${investment.name}</h4>
          <div class="investment-symbol">${investment.symbol} • ${investment.shares} shares</div>
        </div>
        <div class="investment-value">
          <div class="investment-amount">${formatCurrency(investment.value)}</div>
          <div class="investment-gain">${investment.gain_loss}</div>
        </div>
      </div>
    </div>
  `).join('');
}

// Analytics Functions
async function initializeAnalytics() {
  try {
    await loadDashboardData();
    initializeAnalyticsCharts();
  } catch (error) {
    console.error('Failed to initialize analytics:', error);
    showToast('Failed to load analytics data', 'error');
  }
}

function initializeAnalyticsCharts() {
  // Spending Trend Chart
  const spendingTrendCtx = document.getElementById('spendingTrendChart');
  if (spendingTrendCtx && appData.monthlyData.length > 0) {
    if (charts.spendingTrend) {
      charts.spendingTrend.destroy();
    }
    
    charts.spendingTrend = new Chart(spendingTrendCtx, {
      type: 'bar',
      data: {
        labels: appData.monthlyData.map(d => d.month),
        datasets: [{
          label: 'Monthly Expenses',
          data: appData.monthlyData.map(d => d.expenses),
          backgroundColor: '#1FB8CD',
          borderColor: '#1FB8CD',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '$' + value.toLocaleString();
              }
            }
          }
        }
      }
    });
  }

  // Net Worth Chart
  const netWorthCtx = document.getElementById('netWorthChart');
  if (netWorthCtx && appData.monthlyData.length > 0) {
    if (charts.netWorth) {
      charts.netWorth.destroy();
    }
    
    const netWorthData = appData.monthlyData.map((d, i) => {
      return 40000 + (i * 1200) + d.savings; // Simulated net worth growth
    });
    
    charts.netWorth = new Chart(netWorthCtx, {
      type: 'line',
      data: {
        labels: appData.monthlyData.map(d => d.month),
        datasets: [{
          label: 'Net Worth',
          data: netWorthData,
          borderColor: '#D2BA4C',
          backgroundColor: 'rgba(210, 186, 76, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            ticks: {
              callback: function(value) {
                return '$' + value.toLocaleString();
              }
            }
          }
        }
      }
    });
  }
}

// Upload Functions (keeping original for now)
function initializeUpload() {
  setupUploadEventListeners();
}

function setupUploadEventListeners() {
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  const selectFileBtn = document.getElementById('selectFileBtn');
  const uploadProgress = document.getElementById('uploadProgress');
  const uploadPreview = document.getElementById('uploadPreview');
  
  if (selectFileBtn) {
    selectFileBtn.addEventListener('click', () => {
      fileInput.click();
    });
  }
  
  if (uploadArea) {
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      handleFileUpload(e.dataTransfer.files);
    });
  }
  
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      handleFileUpload(e.target.files);
    });
  }
  
  const confirmUpload = document.getElementById('confirmUpload');
  const cancelUpload = document.getElementById('cancelUpload');
  
  if (confirmUpload) {
    confirmUpload.addEventListener('click', () => {
      processUpload();
    });
  }
  
  if (cancelUpload) {
    cancelUpload.addEventListener('click', () => {
      uploadPreview.style.display = 'none';
      uploadProgress.style.display = 'none';
      fileInput.value = '';
    });
  }
}

function handleFileUpload(files) {
  if (files.length === 0) return;
  
  const file = files[0];
  const allowedTypes = ['.pdf', '.csv', '.xls', '.xlsx'];
  const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
  
  if (!allowedTypes.includes(fileExtension)) {
    showToast('Please upload a valid file format (PDF, CSV, XLS, XLSX)', 'error');
    return;
  }
  
  const uploadProgress = document.getElementById('uploadProgress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  
  uploadProgress.style.display = 'block';
  
  let progress = 0;
  const interval = setInterval(() => {
    progress += 10;
    progressFill.style.width = progress + '%';
    progressText.textContent = `Processing... ${progress}%`;
    
    if (progress >= 100) {
      clearInterval(interval);
      setTimeout(() => {
        showUploadPreview(file);
      }, 500);
    }
  }, 200);
}

function showUploadPreview(file) {
  const uploadPreview = document.getElementById('uploadPreview');
  const previewTable = document.getElementById('previewTable');
  
  const sampleData = [
    { date: '2024-06-10', description: 'Sample Transaction 1', amount: '-45.67', category: 'Food & Dining' },
    { date: '2024-06-09', description: 'Sample Transaction 2', amount: '-123.45', category: 'Shopping' },
    { date: '2024-06-08', description: 'Sample Transaction 3', amount: '2500.00', category: 'Income' }
  ];
  
  previewTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Description</th>
          <th>Amount</th>
          <th>Category</th>
        </tr>
      </thead>
      <tbody>
        ${sampleData.map(row => `
          <tr>
            <td>${row.date}</td>
            <td>${row.description}</td>
            <td class="${parseFloat(row.amount) < 0 ? 'amount--negative' : 'amount--positive'}">
              ${formatCurrency(parseFloat(row.amount))}
            </td>
            <td>${row.category}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  
  uploadPreview.style.display = 'block';
}

async function processUpload() {
  const uploadProgress = document.getElementById('uploadProgress');
  const uploadPreview = document.getElementById('uploadPreview');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  
  uploadPreview.style.display = 'none';
  uploadProgress.style.display = 'block';
  progressText.textContent = 'Importing transactions...';
  
  let progress = 0;
  const interval = setInterval(async () => {
    progress += 15;
    progressFill.style.width = progress + '%';
    
    if (progress >= 100) {
      clearInterval(interval);
      
      const newTransactions = [
        { date: '2024-06-10', description: 'Sample Transaction 1', amount: -45.67, category: 'Food & Dining', account_name: 'Chase Checking' },
        { date: '2024-06-09', description: 'Sample Transaction 2', amount: -123.45, category: 'Shopping', account_name: 'Chase Checking' },
        { date: '2024-06-08', description: 'Sample Transaction 3', amount: 2500.00, category: 'Income', account_name: 'Chase Checking' }
      ];
      
      try {
        for (const transaction of newTransactions) {
          await apiRequest('/transactions', {
            method: 'POST',
            body: JSON.stringify(transaction)
          });
        }
        
        setTimeout(async () => {
          uploadProgress.style.display = 'none';
          showToast('Transactions imported successfully!');
          
          const targetLink = document.querySelector('[data-page="transactions"]');
          if (targetLink) targetLink.click();
        }, 1000);
      } catch (error) {
        console.error('Failed to import transactions:', error);
        showToast('Failed to import transactions', 'error');
        uploadProgress.style.display = 'none';
      }
    }
  }, 200);
}

// Search functionality
function initializeSearch() {
  const searchInput = document.querySelector('.search-input');
  const searchBtn = document.querySelector('.search-btn');
  
  if (searchInput && searchBtn) {
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        performSearch();
      }
    });
  }
}

function performSearch() {
  const searchInput = document.querySelector('.search-input');
  const query = searchInput.value.toLowerCase().trim();
  
  if (!query) {
    filteredTransactions = [...appData.transactions];
  } else {
    filteredTransactions = appData.transactions.filter(transaction => 
      transaction.description.toLowerCase().includes(query) ||
      transaction.category.toLowerCase().includes(query) ||
      transaction.account_name.toLowerCase().includes(query)
    );
  }
  
  if (currentPage === 'transactions') {
    renderTransactionTable();
  }
  
  showToast(`Found ${filteredTransactions.length} transactions`);
}

// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await apiRequest('/health');
    console.log('API connection successful');
  } catch (error) {
    console.error('API connection failed. Using offline mode.');
    showToast('API connection failed. Some features may not work.', 'error');
  }
  
  initializeNavigation();
  await initializeDashboard();
  initializeSearch();
  
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      e.target.classList.remove('active');
    }
  });
  
  const transactionDate = document.getElementById('transactionDate');
  if (transactionDate) {
    transactionDate.value = new Date().toISOString().split('T')[0];
  }
});

window.addEventListener('resize', () => {
  if (window.innerWidth <= 768) {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.remove('open');
  }
});

window.navigateToPage = function(page) {
  const targetLink = document.querySelector(`[data-page="${page}"]`);
  if (targetLink) {
    targetLink.click();
  }
};