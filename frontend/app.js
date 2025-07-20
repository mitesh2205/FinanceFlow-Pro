// API Configuration
const API_BASE_URL = 'http://localhost:3001/api';

// Global variables
let currentPage = 'dashboard';
let charts = {};
let filteredTransactions = [];
let editingTransactionId = null; // Track which transaction is being edited
let uploadedTransactions = []; // Store parsed transactions globally
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
      await initializeUpload(); // Now loads accounts
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
            tension: 0.4,
            fill: false
          },
          {
            label: 'Expenses',
            data: appData.monthlyData.map(d => d.expenses),
            borderColor: '#B4413C',
            backgroundColor: 'rgba(180, 65, 60, 0.1)',
            tension: 0.4,
            fill: false
          },
          {
            label: 'Savings',
            data: appData.monthlyData.map(d => d.savings),
            borderColor: '#D2BA4C',
            backgroundColor: 'rgba(210, 186, 76, 0.1)',
            tension: 0.4,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false, // Allow chart to fill container
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true,
              padding: 20
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(0,0,0,0.1)'
            },
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
          backgroundColor: [
            '#1FB8CD', 
            '#FFC185', 
            '#B4413C', 
            '#ECEBD5', 
            '#5D878F',
            '#D2BA4C',
            '#A67C52'
          ],
          borderWidth: 2,
          borderColor: '#fff',
          hoverBorderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true,
              padding: 15,
              generateLabels: function(chart) {
                const original = Chart.defaults.plugins.legend.labels.generateLabels;
                const labels = original.call(this, chart);
                
                // Add values to legend labels
                labels.forEach((label, i) => {
                  const value = chart.data.datasets[0].data[i];
                  label.text += `: $${value.toLocaleString()}`;
                });
                
                return labels;
              }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return `${label}: $${value.toLocaleString()} (${percentage}%)`;
              }
            }
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
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false
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
          x: {
            grid: {
              display: false
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(0,0,0,0.1)'
            },
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
          fill: true,
          pointBackgroundColor: '#D2BA4C',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4
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
          x: {
            grid: {
              display: false
            }
          },
          y: {
            beginAtZero: false,
            grid: {
              color: 'rgba(0,0,0,0.1)'
            },
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

// Load accounts specifically for import (with more details)
async function loadAccountsForImport() {
  try {
    appData.accountsForImport = await apiRequest('/accounts/for-import');
  } catch (error) {
    console.error('Failed to load accounts for import:', error);
    // Fallback to regular accounts
    await loadAccounts();
    appData.accountsForImport = appData.accounts.map(acc => ({
      ...acc,
      displayName: `${acc.name} (${acc.type})`
    }));
  }
}

// NEW: Render import history
function renderImportHistory(history) {
  const historyContainer = document.querySelector('#upload .card:last-child .card__body');
  
  if (!historyContainer || history.length === 0) {
    return;
  }
  
  historyContainer.innerHTML = `
    <h3>Recent Uploads</h3>
    <div class="import-history">
      ${history.map(item => `
        <div class="import-history-item">
          <div class="import-info">
            <div class="import-account">${item.account_name}</div>
            <div class="import-details">
              ${item.transaction_count} transactions • 
              ${formatDate(item.earliest_transaction)} to ${formatDate(item.latest_transaction)}
            </div>
          </div>
          <div class="import-date">
            ${formatDate(item.last_import)}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// Upload Functions - FIXED TO USE REAL BACKEND PARSING
async function initializeUpload() {
  try {
    await loadAccountsForImport();
    setupUploadEventListeners();
    await loadImportHistory(); // Load recent import history
  } catch (error) {
    console.error('Failed to initialize upload page:', error);
    showToast('Failed to load accounts', 'error');
  }
}

// NEW: Load import history
async function loadImportHistory() {
  try {
    const history = await apiRequest('/import-history');
    renderImportHistory(history);
  } catch (error) {
    console.error('Failed to load import history:', error);
  }
}

function setupUploadEventListeners() {
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  const selectFileBtn = document.getElementById('selectFileBtn');
  
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
}

// FIXED: Real file upload that calls backend
function handleFileUpload(files) {
  if (files.length === 0) return;
  
  const file = files[0];
  const allowedTypes = ['.pdf', '.csv', '.xls', '.xlsx'];
  const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
  
  if (!allowedTypes.includes(fileExtension)) {
    showToast('Please upload a valid file format (PDF, CSV, XLS, XLSX)', 'error');
    return;
  }
  
  // Upload the actual file to backend for parsing
  uploadFileToBackend(file);
}

// FIXED: Actually upload to backend
async function uploadFileToBackend(file) {
  const uploadProgress = document.getElementById('uploadProgress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  
  uploadProgress.style.display = 'block';
  progressText.textContent = 'Uploading and parsing file...';
  
  try {
    // Create FormData to send the file
    const formData = new FormData();
    formData.append('file', file);
    
    // Upload and parse the file
    const response = await fetch(`${API_BASE_URL}/upload-statement`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to parse file');
    }
    
    const result = await response.json();
    console.log('Backend parsing result:', result);
    
    // Animate progress to 100%
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      progressFill.style.width = progress + '%';
      
      if (progress >= 100) {
        clearInterval(interval);
        progressText.textContent = `Successfully parsed ${result.totalCount} transactions!`;
        
        // Store the parsed transactions
        uploadedTransactions = result.transactions || [];
        
        setTimeout(async () => {
          await showUploadPreview(file, result);
        }, 500);
      }
    }, 50);
    
  } catch (error) {
    console.error('Upload failed:', error);
    uploadProgress.style.display = 'none';
    showToast(`Upload failed: ${error.message}`, 'error');
  }
}

// Show real parsed data
async function showUploadPreview(file, parseResult) {
  const uploadProgress = document.getElementById('uploadProgress');
  const uploadPreview = document.getElementById('uploadPreview');
  
  // Make sure accounts are loaded
  if (!appData.accounts || appData.accounts.length === 0) {
    await loadAccounts();
  }
  
  uploadProgress.style.display = 'none';
  
  // Use real parsed data instead of sample data
  const transactions = parseResult.transactions || [];
  
  if (transactions.length === 0) {
    uploadPreview.innerHTML = `
      <div class="card__body">
        <h3>No Transactions Found</h3>
        <p>No transactions could be extracted from this file. Please check the file format and try again.</p>
        <button class="btn btn--outline" onclick="cancelUpload()">Cancel</button>
      </div>
    `;
    uploadPreview.style.display = 'block';
    return;
  }
  
  // Create the preview table HTML as a string first
  const previewTableHTML = `
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
        ${transactions.slice(0, 10).map(transaction => `
          <tr>
            <td>${transaction.date}</td>
            <td>${transaction.description}</td>
            <td class="${parseFloat(transaction.amount) < 0 ? 'amount--negative' : 'amount--positive'}">
              ${formatCurrency(parseFloat(transaction.amount))}
            </td>
            <td>${transaction.category}</td>
          </tr>
        `).join('')}
        ${transactions.length > 10 ? `
          <tr>
            <td colspan="4" style="text-align: center; color: var(--color-text-secondary); font-style: italic;">
              ... and ${transactions.length - 10} more transactions
            </td>
          </tr>
        ` : ''}
      </tbody>
    </table>
  `;
  
  // Update the upload preview card content
  uploadPreview.innerHTML = `
    <div class="card__body">
      <h3>Upload Preview - ${transactions.length} transactions found</h3>
      <div class="form-group">
        <label class="form-label">Select Account</label>
        <select class="form-control" id="uploadAccountSelect" required>
          ${appData.accounts.map(acc => 
            `<option value="${acc.name}">${acc.name} (${acc.type} - ${acc.institution})</option>`
          ).join('')}
        </select>
      </div>
      <div class="preview-table">
        ${previewTableHTML}
      </div>
      <div class="preview-actions">
        <button class="btn btn--primary" onclick="processUpload()">Import ${transactions.length} Transactions</button>
        <button class="btn btn--outline" onclick="cancelUpload()">Cancel</button>
      </div>
    </div>
  `;
  
  uploadPreview.style.display = 'block';
}


// Actually import parsed transactions
async function processUpload() {
  const uploadProgress = document.getElementById('uploadProgress');
  const uploadPreview = document.getElementById('uploadPreview');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  
  if (!uploadedTransactions || uploadedTransactions.length === 0) {
    showToast('No transactions to import', 'error');
    return;
  }
  
  const selectedAccount = document.getElementById('uploadAccountSelect')?.value;
  if (!selectedAccount) {
    showToast('Please select an account for the transactions', 'error');
    return;
  }
  
  uploadPreview.style.display = 'none';
  uploadProgress.style.display = 'block';
  progressText.textContent = 'Importing transactions...';
  progressFill.style.width = '0%';
  
  try {
    console.log('Importing transactions:', uploadedTransactions.length, 'to account:', selectedAccount);
    
    const response = await fetch(`${API_BASE_URL}/import-transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transactions: uploadedTransactions,
        accountName: selectedAccount
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to import transactions');
    }
    
    const result = await response.json();
    console.log('Import result:', result);
    
    // Animate progress
    let progress = 0;
    const interval = setInterval(async () => {
      progress += 20;
      progressFill.style.width = progress + '%';
      
      if (progress >= 100) {
        clearInterval(interval);
        
        setTimeout(async () => {
          uploadProgress.style.display = 'none';
          showToast(`Successfully imported ${result.importedCount} transactions!`);
          
          // Clear uploaded data
          uploadedTransactions = [];
          document.getElementById('fileInput').value = '';
          
          // Navigate to transactions page to see the imported data
          const targetLink = document.querySelector('[data-page="transactions"]');
          if (targetLink) targetLink.click();
        }, 1000);
      }
    }, 200);
    
  } catch (error) {
    console.error('Failed to import transactions:', error);
    showToast(`Import failed: ${error.message}`, 'error');
    uploadProgress.style.display = 'none';
  }
}



function cancelUpload() {
  const uploadProgress = document.getElementById('uploadProgress');
  const uploadPreview = document.getElementById('uploadPreview');
  const fileInput = document.getElementById('fileInput');
  
  uploadProgress.style.display = 'none';
  uploadPreview.style.display = 'none';
  fileInput.value = '';
  uploadedTransactions = [];
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

// Add window resize handler to properly resize charts
window.addEventListener('resize', debounce(() => {
  Object.values(charts).forEach(chart => {
    if (chart && typeof chart.resize === 'function') {
      chart.resize();
    }
  });
}, 300));

// Debounce utility function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

window.navigateToPage = function(page) {
  const targetLink = document.querySelector(`[data-page="${page}"]`);
  if (targetLink) {
    targetLink.click();
  }
};

// Make functions available globally for HTML onclick events
window.addMoneyToGoal = addMoneyToGoal;
window.processUpload = processUpload;
window.cancelUpload = cancelUpload;