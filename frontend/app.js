// API Configuration  
const API_BASE_URL = 'http://localhost:3002/api';

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
  categories: [], // Will be loaded from API
  monthlyData: []
};

// Authentication helper
function getAuthToken() {
  return localStorage.getItem('financeflow_token');
}

function getAuthHeaders() {
  const token = getAuthToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function checkAuth() {
  const token = getAuthToken();
  if (!token) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

// API Helper Functions
async function apiRequest(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...options.headers
      },
      ...options
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        // Unauthorized - redirect to login
        localStorage.removeItem('financeflow_token');
        localStorage.removeItem('financeflow_user');
        window.location.href = 'login.html';
        return;
      }
      
      // Try to get error details from response
      let errorMessage = `API Error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.message) {
          errorMessage = errorData.message;
        }
        if (errorData.errors && Array.isArray(errorData.errors)) {
          errorMessage += '\n' + errorData.errors.map(err => err.message).join('\n');
        }
      } catch (e) {
        // Could not parse error response, use default message
      }
      
      throw new Error(errorMessage);
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

async function loadCategories() {
  try {
    appData.categories = await apiRequest('/categories');
  } catch (error) {
    console.error('Failed to load categories:', error);
    // Fallback to basic categories if API fails
    appData.categories = [
      "Food & Dining", "Transportation", "Entertainment", "Bills & Utilities",
      "Shopping", "Healthcare", "Education", "Travel", "Income", "Transfer"
    ];
  }
}

async function loadDashboardData() {
  try {
    const [dashboardData, chartData] = await Promise.all([
      apiRequest('/dashboard'),
      apiRequest('/charts/data')
    ]);
    
    appData.monthlyData = dashboardData.monthly_data || [];
    appData.chartData = chartData; // Store enhanced chart data
    
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
      accounts: 'Account Management',
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
    case 'accounts':
      await initializeAccounts();
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
      loadBudgets(),
      loadCategories()
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
  if (!appData.chartData) return;
  
  const chartColors = {
    income: '#10B981', // Green
    expenses: '#EF4444', // Red  
    pieColors: [
      '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
      '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1'
    ]
  };

  // Monthly Income vs Expenses Bar Chart
  initializeMonthlyBarChart(chartColors);
  
  // Income Category Pie Chart  
  initializeIncomePieChart(chartColors);
  
  // Expense Category Pie Chart
  initializeExpensePieChart(chartColors);
  
  // Financial Health Gauge
  initializeFinancialHealthGauge(chartColors);
  
  // Smart Financial Insights
  updateSmartInsights();
  
  // Loan Tracking (if loan data exists)
  if (appData.chartData.loanTracking && appData.chartData.loanTracking.totalPayments > 0) {
    initializeLoanTracking(chartColors);
  }
}

function initializeMonthlyBarChart(colors) {
  const ctx = document.getElementById('monthlyBarChart');
  if (!ctx || !appData.chartData.monthlyData?.length) return;
  
  if (charts.monthlyBar) {
    charts.monthlyBar.destroy();
  }
  
  const monthlyData = appData.chartData.monthlyData;
  
  charts.monthlyBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: monthlyData.map(d => {
        const date = new Date(d.month + '-01');
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      }),
      datasets: [
        {
          label: 'Income',
          data: monthlyData.map(d => d.income),
          backgroundColor: colors.income,
          borderColor: colors.income,
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: 'Expenses', 
          data: monthlyData.map(d => d.expenses),
          backgroundColor: colors.expenses,
          borderColor: colors.expenses,
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            usePointStyle: true,
            padding: 20,
            font: { size: 12, weight: '500' }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: 'white',
          bodyColor: 'white',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          cornerRadius: 8,
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: $${context.parsed.y.toLocaleString()}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: {
            font: { size: 11 },
            callback: function(value) {
              return '$' + (value >= 1000 ? (value/1000).toFixed(1) + 'K' : value);
            }
          }
        }
      }
    }
  });
}

function initializeIncomePieChart(colors) {
  const ctx = document.getElementById('incomePieChart');
  if (!ctx || !appData.chartData.incomeCategories?.length) return;
  
  if (charts.incomePie) {
    charts.incomePie.destroy();
  }
  
  const incomeData = appData.chartData.incomeCategories;
  
  charts.incomePie = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: incomeData.map(d => d.category),
      datasets: [{
        data: incomeData.map(d => d.total),
        backgroundColor: colors.pieColors.slice(0, incomeData.length),
        borderWidth: 2,
        borderColor: '#fff',
        hoverBorderWidth: 3,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            padding: 15,
            font: { size: 11 },
            generateLabels: function(chart) {
              const original = Chart.defaults.plugins.legend.labels.generateLabels;
              const labels = original.call(this, chart);
              labels.forEach((label, i) => {
                const value = chart.data.datasets[0].data[i];
                const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                label.text = `${label.text} (${percentage}%)`;
              });
              return labels;
            }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          callbacks: {
            label: function(context) {
              const value = context.parsed;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(1);
              return `${context.label}: $${value.toLocaleString()} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

function initializeExpensePieChart(colors) {
  const ctx = document.getElementById('expensePieChart');
  if (!ctx || !appData.chartData.expenseCategories?.length) return;
  
  if (charts.expensePie) {
    charts.expensePie.destroy();
  }
  
  const expenseData = appData.chartData.expenseCategories;
  
  charts.expensePie = new Chart(ctx, {
    type: 'doughnut', 
    data: {
      labels: expenseData.map(d => d.category),
      datasets: [{
        data: expenseData.map(d => d.total),
        backgroundColor: colors.pieColors.slice(0, expenseData.length),
        borderWidth: 2,
        borderColor: '#fff',
        hoverBorderWidth: 3,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            padding: 15,
            font: { size: 11 },
            generateLabels: function(chart) {
              const original = Chart.defaults.plugins.legend.labels.generateLabels;
              const labels = original.call(this, chart);
              labels.forEach((label, i) => {
                const value = chart.data.datasets[0].data[i];
                const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                label.text = `${label.text} (${percentage}%)`;
              });
              return labels;
            }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          callbacks: {
            label: function(context) {
              const value = context.parsed;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(1);
              return `${context.label}: $${value.toLocaleString()} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

function initializeFinancialHealthGauge(colors) {
  const ctx = document.getElementById('healthGaugeChart');
  if (!ctx || !appData.chartData) return;
  
  if (charts.healthGauge) {
    charts.healthGauge.destroy();
  }
  
  // Calculate financial health score based on user data
  const healthScore = calculateFinancialHealthScore();
  
  // Update score display
  document.getElementById('healthScoreValue').textContent = healthScore;
  
  // Update insights
  updateHealthInsights(healthScore);
  
  charts.healthGauge = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [healthScore, 100 - healthScore],
        backgroundColor: [
          getHealthScoreColor(healthScore),
          'rgba(255, 255, 255, 0.1)'
        ],
        borderWidth: 0,
        cutout: '80%',
        circumference: 180,
        rotation: 270,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    }
  });
}

function calculateFinancialHealthScore() {
  if (!appData.chartData || !appData.chartData.monthlyData) return 50;
  
  const monthlyData = appData.chartData.monthlyData;
  if (!monthlyData.length) return 50;
  
  // Calculate average monthly income/expense ratio
  const latestMonth = monthlyData[monthlyData.length - 1];
  const avgIncome = monthlyData.reduce((sum, m) => sum + m.income, 0) / monthlyData.length;
  const avgExpenses = monthlyData.reduce((sum, m) => sum + m.expenses, 0) / monthlyData.length;
  
  // Calculate true savings rate considering loan payments
  const loanPayments = appData.chartData.loanTracking?.totalPayments / 3 || 0; // Monthly avg
  const totalMonthlyOutflow = avgExpenses + loanPayments;
  const savingsRate = avgIncome > 0 ? ((avgIncome - totalMonthlyOutflow) / avgIncome) * 100 : 0;
  
  // Income consistency (lower variation is better)
  const incomeVariation = calculateVariation(monthlyData.map(m => m.income));
  const consistencyScore = Math.max(0, 100 - (incomeVariation * 2));
  
  // Expense control (lower expense growth is better)
  const expenseGrowth = monthlyData.length > 1 ? 
    ((latestMonth.expenses - monthlyData[0].expenses) / monthlyData[0].expenses) * 100 : 0;
  const expenseControlScore = Math.max(0, 100 - Math.abs(expenseGrowth));
  
  // Weighted score calculation
  const healthScore = (
    (Math.max(0, Math.min(100, savingsRate * 2)) * 0.5) + // Savings rate (50% weight)
    (consistencyScore * 0.3) + // Income consistency (30% weight)  
    (expenseControlScore * 0.2) // Expense control (20% weight)
  );
  
  return Math.round(Math.max(10, Math.min(100, healthScore)));
}

function calculateVariation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return mean > 0 ? (stdDev / mean) * 100 : 0;
}

function getHealthScoreColor(score) {
  if (score >= 80) return '#10B981'; // Green - Excellent
  if (score >= 60) return '#F59E0B'; // Yellow - Good  
  if (score >= 40) return '#F97316'; // Orange - Fair
  return '#EF4444'; // Red - Poor
}

function updateHealthInsights(score) {
  const insights = [];
  
  if (score >= 80) {
    insights.push({ icon: '🌟', text: 'Excellent financial health!' });
    insights.push({ icon: '💎', text: 'Keep up the great savings habits' });
  } else if (score >= 60) {
    insights.push({ icon: '👍', text: 'Good financial habits' });
    insights.push({ icon: '📈', text: 'Room for improvement in savings' });
  } else if (score >= 40) {
    insights.push({ icon: '⚠️', text: 'Consider budgeting improvements' });
    insights.push({ icon: '💡', text: 'Track expenses more carefully' });
  } else {
    insights.push({ icon: '🚨', text: 'Focus on expense reduction' });
    insights.push({ icon: '💼', text: 'Consider increasing income streams' });
  }
  
  const container = document.getElementById('healthInsights');
  if (container) {
    container.innerHTML = insights.map(insight => `
      <div class="insight-item">
        <span class="insight-icon">${insight.icon}</span>
        <span class="insight-text">${insight.text}</span>
      </div>
    `).join('');
  }
}

function updateSmartInsights() {
  if (!appData.chartData || !appData.chartData.financialInsights) return;
  
  const insights = appData.chartData.financialInsights;
  
  // Update metric values
  document.getElementById('trueIncomeValue').textContent = 
    '$' + insights.trueIncome.toLocaleString();
  
  document.getElementById('loanPaymentsValue').textContent = 
    '$' + (appData.chartData.loanTracking?.totalPayments / 3 || 0).toLocaleString(); // Monthly avg
    
  document.getElementById('availableCashValue').textContent = 
    '$' + insights.availableCashFlow.toLocaleString();
    
  document.getElementById('selfTransfersValue').textContent = 
    '$' + insights.selfTransferAmount.toLocaleString();
}

function initializeLoanTracking(colors) {
  // Show the loan analysis card
  const loanCard = document.getElementById('loanAnalysisCard');
  if (loanCard) {
    loanCard.style.display = 'block';
  }
  
  // Initialize loan payment chart
  const ctx = document.getElementById('loanPaymentChart');
  if (!ctx || !appData.chartData.loanTracking) return;
  
  if (charts.loanPayment) {
    charts.loanPayment.destroy();
  }
  
  const loanData = appData.chartData.loanTracking.monthlyData.filter(d => d.payment_type === 'Debt Payments');
  
  charts.loanPayment = new Chart(ctx, {
    type: 'line',
    data: {
      labels: loanData.map(d => {
        const date = new Date(d.month + '-01');
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      }),
      datasets: [{
        label: 'Debt Payments (Loans + Credit Cards)',
        data: loanData.map(d => d.amount),
        borderColor: '#DC2626',
        backgroundColor: 'rgba(220, 38, 38, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#DC2626',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            font: { size: 12, weight: '500' }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: $${context.parsed.y.toLocaleString()}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: {
            font: { size: 11 },
            callback: function(value) {
              return '$' + (value >= 1000 ? (value/1000).toFixed(1) + 'K' : value);
            }
          }
        }
      }
    }
  });
  
  // Update loan insights
  updateLoanInsights();
}

function updateLoanInsights() {
  if (!appData.chartData.loanTracking) return;
  
  const loanTracking = appData.chartData.loanTracking;
  const insights = [];
  
  // Total loan payments insight
  if (loanTracking.totalPayments > 0) {
    insights.push({
      icon: '💸',
      label: 'Total Loan Payments (90 days)',
      value: `$${loanTracking.totalPayments.toLocaleString()}`
    });
  }
  
  // Monthly average
  if (loanTracking.monthlyData.length > 0) {
    const monthlyAvg = loanTracking.totalPayments / 3; // Assuming 3 months data
    insights.push({
      icon: '📊',
      label: 'Average Monthly Payment',
      value: `$${monthlyAvg.toLocaleString()}`
    });
  }
  
  // Net loan position
  if (loanTracking.netPosition !== 0) {
    const isPositive = loanTracking.netPosition > 0;
    insights.push({
      icon: isPositive ? '📈' : '📉',
      label: isPositive ? 'Net Loan Received' : 'Net Loan Paid',
      value: `$${Math.abs(loanTracking.netPosition).toLocaleString()}`
    });
  }
  
  // Cash flow impact
  const cashFlowImpact = loanTracking.totalPayments / appData.chartData.financialInsights.trueIncome * 100;
  if (cashFlowImpact > 0) {
    insights.push({
      icon: '⚖️',
      label: 'Income Used for Loans',
      value: `${cashFlowImpact.toFixed(1)}%`
    });
  }
  
  // Update UI
  const container = document.getElementById('loanInsightsList');
  if (container && insights.length > 0) {
    container.innerHTML = insights.map(insight => `
      <div class="loan-insight-item">
        <div class="loan-insight-icon">${insight.icon}</div>
        <div class="loan-insight-content">
          <div class="loan-insight-label">${insight.label}</div>
          <div class="loan-insight-value">${insight.value}</div>
        </div>
      </div>
    `).join('');
  }
}

// Transaction Functions
async function initializeTransactions() {
  try {
    await Promise.all([
      loadTransactions(),
      loadAccounts(),
      loadCategories()
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
  // Clear previous selection when re-rendering
  if (typeof selectedTransactionIds !== 'undefined') {
    selectedTransactionIds.clear();
    const bulkActionsBar = document.getElementById('bulkActionsBar');
    if (bulkActionsBar) {
      bulkActionsBar.style.display = 'none';
    }
  }
  
  const container = document.getElementById('transactionTable');
  
  container.innerHTML = `
    <table class="transaction-table">
      <thead>
        <tr>
          <th>
            <input type="checkbox" id="selectAllTransactions" class="transaction-checkbox" title="Select All">
          </th>
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
            <td>
              <input type="checkbox" class="transaction-checkbox transaction-select" data-id="${transaction.id}">
            </td>
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

  // Add bulk selection event listeners
  setupBulkSelectionListeners();
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

// Bulk selection functionality
let selectedTransactionIds = new Set();

function setupBulkSelectionListeners() {
  const selectAllCheckbox = document.getElementById('selectAllTransactions');
  const individualCheckboxes = document.querySelectorAll('.transaction-select');
  const bulkActionsBar = document.getElementById('bulkActionsBar');
  const selectedCountSpan = document.getElementById('selectedCount');
  const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
  const clearSelectionBtn = document.getElementById('clearSelectionBtn');

  // Select all checkbox functionality
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', function() {
      const isChecked = this.checked;
      selectedTransactionIds.clear();
      
      individualCheckboxes.forEach(checkbox => {
        checkbox.checked = isChecked;
        const row = checkbox.closest('tr');
        if (isChecked) {
          selectedTransactionIds.add(checkbox.dataset.id);
          row.classList.add('selected');
        } else {
          row.classList.remove('selected');
        }
      });
      
      updateBulkActionsBar();
    });
  }

  // Individual checkbox functionality
  individualCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      const row = this.closest('tr');
      const transactionId = this.dataset.id;
      
      if (this.checked) {
        selectedTransactionIds.add(transactionId);
        row.classList.add('selected');
      } else {
        selectedTransactionIds.delete(transactionId);
        row.classList.remove('selected');
      }
      
      // Update select all checkbox state
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = selectedTransactionIds.size === individualCheckboxes.length;
        selectAllCheckbox.indeterminate = selectedTransactionIds.size > 0 && selectedTransactionIds.size < individualCheckboxes.length;
      }
      
      updateBulkActionsBar();
    });
  });

  // Bulk delete functionality
  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener('click', async () => {
      if (selectedTransactionIds.size === 0) return;
      
      if (confirm(`Are you sure you want to delete ${selectedTransactionIds.size} selected transaction${selectedTransactionIds.size > 1 ? 's' : ''}?`)) {
        await bulkDeleteTransactions();
      }
    });
  }

  // Clear selection functionality
  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener('click', () => {
      clearSelection();
    });
  }
}

function updateBulkActionsBar() {
  const bulkActionsBar = document.getElementById('bulkActionsBar');
  const selectedCountSpan = document.getElementById('selectedCount');
  
  if (selectedTransactionIds.size > 0) {
    bulkActionsBar.style.display = 'flex';
    selectedCountSpan.textContent = selectedTransactionIds.size;
  } else {
    bulkActionsBar.style.display = 'none';
  }
}

function clearSelection() {
  selectedTransactionIds.clear();
  const selectAllCheckbox = document.getElementById('selectAllTransactions');
  const individualCheckboxes = document.querySelectorAll('.transaction-select');
  
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  }
  
  individualCheckboxes.forEach(checkbox => {
    checkbox.checked = false;
    const row = checkbox.closest('tr');
    row.classList.remove('selected');
  });
  
  updateBulkActionsBar();
}

async function bulkDeleteTransactions() {
  try {
    const deletePromises = Array.from(selectedTransactionIds).map(id => 
      apiRequest(`/transactions/${id}`, { method: 'DELETE' })
    );
    
    await Promise.all(deletePromises);
    
    showToast(`Successfully deleted ${selectedTransactionIds.size} transaction${selectedTransactionIds.size > 1 ? 's' : ''}`);
    
    // Clear selection and refresh
    clearSelection();
    await loadTransactions();
    renderTransactionTable();
    
    // Refresh dashboard if we're on it
    if (currentPage === 'dashboard') {
      await loadDashboardData();
      renderRecentTransactions();
    }
  } catch (error) {
    console.error('Failed to delete transactions:', error);
    showToast('Failed to delete some transactions', 'error');
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
  const categoryCustom = document.getElementById('transactionCategoryCustom');
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

  // Setup dynamic category functionality
  setupDynamicCategoryInput();
  
  // If editing and category doesn't exist in predefined list, show custom input
  if (transaction && !appData.categories.includes(transaction.category)) {
    showCustomCategoryInput();
    categoryCustom.value = transaction.category;
  }
}

// Dynamic Category Input Functions
function setupDynamicCategoryInput() {
  const addCategoryBtn = document.getElementById('addCategoryBtn');
  const categorySelect = document.getElementById('transactionCategory');
  const categoryCustom = document.getElementById('transactionCategoryCustom');
  const categorySuggestions = document.getElementById('categorySuggestions');
  
  // Remove existing listeners to avoid duplicates
  const newAddCategoryBtn = addCategoryBtn.cloneNode(true);
  addCategoryBtn.parentNode.replaceChild(newAddCategoryBtn, addCategoryBtn);
  
  // Add category button click
  newAddCategoryBtn.addEventListener('click', toggleCategoryInput);
  
  // Category custom input listeners
  if (categoryCustom) {
    const newCategoryCustom = categoryCustom.cloneNode(true);
    categoryCustom.parentNode.replaceChild(newCategoryCustom, categoryCustom);
    
    newCategoryCustom.addEventListener('input', handleCategoryInput);
    newCategoryCustom.addEventListener('keydown', handleCategoryKeydown);
    newCategoryCustom.addEventListener('blur', hideCategorySuggestions);
  }
}

function toggleCategoryInput() {
  const categorySelect = document.getElementById('transactionCategory');
  const categoryCustom = document.getElementById('transactionCategoryCustom');
  const addCategoryBtn = document.getElementById('addCategoryBtn');
  
  if (categorySelect.style.display === 'none') {
    // Switch back to select
    categorySelect.style.display = 'block';
    categoryCustom.style.display = 'none';
    addCategoryBtn.textContent = '+';
    addCategoryBtn.title = 'Add new category';
    hideCategorySuggestions();
  } else {
    // Switch to custom input
    showCustomCategoryInput();
  }
}

function showCustomCategoryInput() {
  const categorySelect = document.getElementById('transactionCategory');
  const categoryCustom = document.getElementById('transactionCategoryCustom');
  const addCategoryBtn = document.getElementById('addCategoryBtn');
  
  categorySelect.style.display = 'none';
  categoryCustom.style.display = 'block';
  addCategoryBtn.textContent = '↩';
  addCategoryBtn.title = 'Back to category list';
  categoryCustom.focus();
}

function handleCategoryInput(e) {
  const query = e.target.value.toLowerCase().trim();
  if (query.length === 0) {
    hideCategorySuggestions();
    return;
  }
  
  showCategorySuggestions(query);
}

function showCategorySuggestions(query) {
  const suggestions = document.getElementById('categorySuggestions');
  
  // Find matching existing categories
  const matches = appData.categories.filter(cat => 
    cat.toLowerCase().includes(query)
  ).slice(0, 5);
  
  let suggestionHTML = '';
  
  // Add existing category matches
  matches.forEach(cat => {
    suggestionHTML += `<div class="category-suggestion-item" data-category="${cat}">${cat}</div>`;
  });
  
  // Add "create new" option
  if (query.length >= 2) {
    suggestionHTML += `<div class="category-suggestion-item category-suggestion-new" data-category="${query}">Create "${query}"</div>`;
  }
  
  if (suggestionHTML) {
    suggestions.innerHTML = suggestionHTML;
    suggestions.style.display = 'block';
    
    // Add click listeners to suggestion items
    suggestions.querySelectorAll('.category-suggestion-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent blur event
        selectCategory(e.target.dataset.category);
      });
    });
  } else {
    hideCategorySuggestions();
  }
}

function selectCategory(category) {
  const categoryCustom = document.getElementById('transactionCategoryCustom');
  categoryCustom.value = category;
  hideCategorySuggestions();
}

function hideCategorySuggestions() {
  const suggestions = document.getElementById('categorySuggestions');
  suggestions.style.display = 'none';
}

function handleCategoryKeydown(e) {
  const suggestions = document.getElementById('categorySuggestions');
  const items = suggestions.querySelectorAll('.category-suggestion-item');
  
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    let current = suggestions.querySelector('.active');
    if (current) {
      current.classList.remove('active');
      current = current.nextElementSibling || items[0];
    } else {
      current = items[0];
    }
    if (current) current.classList.add('active');
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    let current = suggestions.querySelector('.active');
    if (current) {
      current.classList.remove('active');
      current = current.previousElementSibling || items[items.length - 1];
    } else {
      current = items[items.length - 1];
    }
    if (current) current.classList.add('active');
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const active = suggestions.querySelector('.active');
    if (active) {
      selectCategory(active.dataset.category);
    }
  } else if (e.key === 'Escape') {
    hideCategorySuggestions();
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

async function learnCategory(description, category) {
  try {
    await apiRequest('/transactions/learn-category', {
      method: 'POST',
      body: JSON.stringify({
        descriptionSubstring: description.slice(0, 20), // Take first 20 chars of description
        category
      })
    });
  } catch (error) {
    console.error('Failed to learn category:', error);
  }
}

async function handleAddEditTransaction(e) {
  e.preventDefault();
  
  // Get the category from either select or custom input
  const categorySelect = document.getElementById('transactionCategory');
  const categoryCustom = document.getElementById('transactionCategoryCustom');
  const category = categorySelect.style.display === 'none' 
    ? categoryCustom.value.trim() 
    : categorySelect.value;
  
  // Validate category
  if (!category) {
    showToast('Please select or enter a category', 'error');
    return;
  }
  
  const transactionData = {
    date: document.getElementById('transactionDate').value,
    description: document.getElementById('transactionDescription').value,
    amount: parseFloat(document.getElementById('transactionAmount').value),
    category: category,
    account_name: document.getElementById('transactionAccount').value
  };
  
  try {
    if (editingTransactionId) {
      // Get the original transaction to check if category changed
      const originalTransaction = appData.transactions.find(t => t.id == editingTransactionId);
      
      // Update existing transaction
      await apiRequest(`/transactions/${editingTransactionId}`, {
        method: 'PUT',
        body: JSON.stringify(transactionData)
      });

      // If category was changed, learn from this change
      if (originalTransaction && originalTransaction.category !== transactionData.category) {
        await learnCategory(transactionData.description, transactionData.category);
      }

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
    
    // Add new category to local list if it doesn't exist
    if (!appData.categories.includes(transactionData.category)) {
      appData.categories.push(transactionData.category);
      appData.categories.sort(); // Keep categories sorted
      showToast(`New category "${transactionData.category}" added!`);
    }
    
    await Promise.all([
      loadTransactions(),
      loadCategories() // Reload categories to get the latest from database
    ]);
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
      headers: {
        ...getAuthHeaders()
      },
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
        'Content-Type': 'application/json',
        ...getAuthHeaders()
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
          if (window.Navigation) {
            Navigation.to('transactions');
          }
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
  // Check authentication first
  if (!checkAuth()) {
    return;
  }
  
  try {
    await apiRequest('/health');
    console.log('API connection successful');
  } catch (error) {
    console.error('API connection failed. Using offline mode.');
    showToast('API connection failed. Some features may not work.', 'error');
  }
  
  // Initialize the new routing system instead of old navigation
  initializeRouting();
  initializeUserInfo();
  initializeSearch();
  
  // Set up modal event handlers
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      e.target.classList.remove('active');
    }
  });
  
  // Set default date for transaction form
  const transactionDate = document.getElementById('transactionDate');
  if (transactionDate) {
    transactionDate.value = new Date().toISOString().split('T')[0];
  }
  
  console.log('FinanceFlow Pro initialized with new routing system');
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

// Backward compatibility - use new Navigation system
window.navigateToPage = function(page) {
  if (window.Navigation) {
    Navigation.to(page);
  } else {
    console.warn('Navigation system not available');
  }
};

// User authentication functions
function initializeUserInfo() {
  const user = JSON.parse(localStorage.getItem('financeflow_user') || '{}');
  if (user.firstName && user.lastName) {
    const fullName = `${user.firstName} ${user.lastName}`;
    const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`;
    
    // Update header elements
    document.getElementById('userName').textContent = fullName;
    document.getElementById('userAvatar').textContent = initials;
    
    // Update settings page elements
    const userFullNameInput = document.getElementById('userFullName');
    const userEmailInput = document.getElementById('userEmail');
    
    if (userFullNameInput) userFullNameInput.value = fullName;
    if (userEmailInput) userEmailInput.value = user.email || '';
  }
}

function handleLogout() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.removeItem('financeflow_token');
    localStorage.removeItem('financeflow_user');
    window.location.href = 'login.html';
  }
}

// Account Functions
async function initializeAccounts() {
  try {
    await loadAccounts();
    renderAccountsGrid();
    setupAccountEventListeners();
  } catch (error) {
    console.error('Failed to initialize accounts:', error);
    showToast('Failed to load accounts', 'error');
  }
}

function renderAccountsGrid() {
  const container = document.getElementById('accountsGrid');
  
  container.innerHTML = appData.accounts.map(account => `
    <div class="card account-card">
      <div class="card__body">
        <div class="account-header">
          <div class="account-info">
            <h3 class="account-name">${account.name}</h3>
            <div class="account-details">
              <span class="account-type">${account.type}</span>
              <span class="account-institution">${account.institution}</span>
            </div>
          </div>
          <div class="account-balance ${account.balance < 0 ? 'negative' : 'positive'}">
            ${formatCurrency(account.balance)}
          </div>
        </div>
        <div class="account-actions">
          <button class="btn btn--sm btn--outline" onclick="editAccount(${account.id})">Edit</button>
          <button class="btn btn--sm btn--outline delete-btn" onclick="deleteAccount(${account.id})">Delete</button>
        </div>
      </div>
    </div>
  `).join('');
}

function setupAccountEventListeners() {
  const addAccountBtn = document.getElementById('addAccountBtn');
  const addAccountModal = document.getElementById('addAccountModal');
  const addAccountForm = document.getElementById('addAccountForm');
  const cancelAccount = document.getElementById('cancelAccount');

  if (addAccountBtn) {
    addAccountBtn.addEventListener('click', () => {
      addAccountModal.classList.add('active');
    });
  }

  if (cancelAccount) {
    cancelAccount.addEventListener('click', () => {
      addAccountModal.classList.remove('active');
      addAccountForm.reset();
    });
  }

  if (addAccountForm) {
    addAccountForm.addEventListener('submit', handleAddAccount);
  }
}

async function handleAddAccount(e) {
  e.preventDefault();
  
  const accountData = {
    name: document.getElementById('accountName').value,
    type: document.getElementById('accountType').value,
    institution: document.getElementById('accountInstitution').value,
    balance: parseFloat(document.getElementById('accountBalance').value) || 0,
    amount: parseFloat(document.getElementById('accountBalance').value) || 0 // For validation
  };

  try {
    await apiRequest('/accounts', {
      method: 'POST',
      body: JSON.stringify(accountData)
    });

    showToast('Account created successfully');
    await loadAccounts();
    renderAccountsGrid();
    document.getElementById('addAccountModal').classList.remove('active');
    e.target.reset();
  } catch (error) {
    console.error('Failed to create account:', error);
  }
}

async function editAccount(id) {
  // TODO: Implement edit functionality
  showToast('Edit functionality coming soon', 'info');
}

async function deleteAccount(id) {
  if (!confirm('Are you sure you want to delete this account? This will also delete all associated transactions.')) {
    return;
  }

  try {
    await apiRequest(`/accounts/${id}`, { method: 'DELETE' });
    showToast('Account deleted successfully');
    await loadAccounts();
    renderAccountsGrid();
  } catch (error) {
    console.error('Failed to delete account:', error);
  }
}

// Make functions available globally for HTML onclick events
window.addMoneyToGoal = addMoneyToGoal;
window.processUpload = processUpload;
window.cancelUpload = cancelUpload;
window.handleLogout = handleLogout;
window.editAccount = editAccount;
window.deleteAccount = deleteAccount;