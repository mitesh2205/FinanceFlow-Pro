const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/databaseService');
const { authenticateToken } = require('../middleware/auth');

const db = DatabaseService.getInstance();

// GET /api/charts/data - Enhanced chart data endpoint (protected route)
router.get('/data', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    // Get monthly income/expense data for the last 12 months
    const monthlyQuery = `
      SELECT 
        strftime('%Y-%m', date) as month,
        ROUND(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 2) as income,
        ROUND(ABS(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END)), 2) as expenses
      FROM transactions t 
      LEFT JOIN accounts a ON t.account_name = a.name 
      WHERE (a.user_id = ? OR a.user_id IS NULL) 
        AND date >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', date)
      ORDER BY month ASC
    `;

    // Get category breakdown for expenses
    const expenseCategoryQuery = `
      SELECT 
        category,
        ROUND(ABS(SUM(amount)), 2) as amount
      FROM transactions t 
      LEFT JOIN accounts a ON t.account_name = a.name 
      WHERE (a.user_id = ? OR a.user_id IS NULL) 
        AND amount < 0 
        AND date >= date('now', '-90 days')
      GROUP BY category
      ORDER BY amount DESC
    `;

    // Get intelligent income categorization
    const smartIncomeCategoryQuery = `
      SELECT 
        CASE
          -- Main income sources (salary, wages, employment)
          WHEN (LOWER(description) LIKE '%salary%' OR LOWER(description) LIKE '%payroll%' 
                OR LOWER(description) LIKE '%wages%' OR LOWER(description) LIKE '%employment%'
                OR LOWER(description) LIKE '%public partnership%' OR LOWER(description) LIKE '%employer%'
                OR (category = 'Income' AND amount > 1000)) 
          THEN '💼 Primary Income'
          
          -- Self transfers (transfers between own accounts)
          WHEN (LOWER(description) LIKE '%transfer%' OR LOWER(description) LIKE '%tfrfrom%'
                OR LOWER(description) LIKE '%tfrto%' OR LOWER(description) LIKE '%internal%'
                OR LOWER(description) LIKE '%zelle%' OR LOWER(description) LIKE '%venmo%'
                OR LOWER(description) LIKE '%self%' OR LOWER(description) LIKE '%own account%')
          THEN '🔄 Self Transfers'
          
          -- Loan disbursements
          WHEN (LOWER(description) LIKE '%loan%' OR LOWER(description) LIKE '%disbursement%'
                OR LOWER(description) LIKE '%credit line%' OR LOWER(description) LIKE '%advance%')
          THEN '🏦 Loan Disbursement'
          
          -- Investment/side income
          WHEN (LOWER(description) LIKE '%investment%' OR LOWER(description) LIKE '%dividend%'
                OR LOWER(description) LIKE '%interest%' OR LOWER(description) LIKE '%freelance%'
                OR LOWER(description) LIKE '%gig%' OR LOWER(description) LIKE '%side%')
          THEN '📈 Investment/Side Income'
          
          -- Refunds and reimbursements
          WHEN (LOWER(description) LIKE '%refund%' OR LOWER(description) LIKE '%reimburse%'
                OR LOWER(description) LIKE '%cashback%' OR LOWER(description) LIKE '%reward%')
          THEN '💰 Refunds/Rewards'
          
          ELSE '📊 Other Income'
        END as income_type,
        COUNT(*) as transaction_count,
        ROUND(SUM(amount), 2) as total_amount,
        ROUND(AVG(amount), 2) as avg_amount
      FROM transactions t 
      LEFT JOIN accounts a ON t.account_name = a.name 
      WHERE (a.user_id = ? OR a.user_id IS NULL) 
        AND amount > 0 
        AND date >= date('now', '-90 days')
        -- EXCLUDE credit card payments, loan payments, and other debt payments from income
        AND NOT (LOWER(description) LIKE '%credit card%payment%' OR LOWER(description) LIKE '%cc payment%'
                 OR LOWER(description) LIKE '%visa payment%' OR LOWER(description) LIKE '%mastercard payment%'
                 OR LOWER(description) LIKE '%loan%payment%' OR LOWER(description) LIKE '%mortgage payment%')
      GROUP BY income_type
      ORDER BY total_amount DESC
    `;
    
    // Get loan and debt payment tracking (including credit cards)
    const loanTrackingQuery = `
      SELECT 
        strftime('%Y-%m', date) as month,
        CASE
          WHEN LOWER(description) LIKE '%loan%payment%' OR LOWER(description) LIKE '%loan payment%'
               OR LOWER(description) LIKE '%student loan%' OR LOWER(description) LIKE '%mortgage%'
               OR LOWER(description) LIKE '%car payment%' OR LOWER(description) LIKE '%personal loan%'
               OR LOWER(description) LIKE '%credit card%payment%' OR LOWER(description) LIKE '%cc payment%'
               OR LOWER(description) LIKE '%visa payment%' OR LOWER(description) LIKE '%mastercard payment%'
          THEN 'Debt Payments'
          WHEN LOWER(description) LIKE '%loan%' AND amount > 0
          THEN 'Loan Disbursement'
          ELSE NULL
        END as payment_type,
        COUNT(*) as transaction_count,
        ROUND(SUM(ABS(amount)), 2) as amount
      FROM transactions t 
      LEFT JOIN accounts a ON t.account_name = a.name 
      WHERE (a.user_id = ? OR a.user_id IS NULL) 
        AND (LOWER(description) LIKE '%loan%' OR LOWER(description) LIKE '%mortgage%' 
             OR LOWER(description) LIKE '%credit card%' OR LOWER(description) LIKE '%cc payment%'
             OR LOWER(description) LIKE '%visa%' OR LOWER(description) LIKE '%mastercard%')
        AND date >= date('now', '-12 months')
        AND payment_type IS NOT NULL
      GROUP BY month, payment_type
      ORDER BY month ASC
    `;

    // Execute all queries
    const monthlyData = await db.all(monthlyQuery, [userId]);
    const expenseCategories = await db.all(expenseCategoryQuery, [userId]);
    const smartIncomeCategories = await db.all(smartIncomeCategoryQuery, [userId]);
    const loanData = await db.all(loanTrackingQuery, [userId]);

    // Format monthly data with proper month names
    const formattedMonthlyData = monthlyData.map(row => {
      const [year, month] = row.month.split('-');
      const monthName = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      return {
        month: monthName,
        income: row.income,
        expenses: row.expenses,
        net: row.income - row.expenses
      };
    });

    // Process loan data for visualization
    const loanSummary = loanData.reduce((acc, row) => {
      if (!acc[row.payment_type]) {
        acc[row.payment_type] = { total: 0, months: [], avgMonthly: 0 };
      }
      acc[row.payment_type].total += row.amount;
      acc[row.payment_type].months.push({ month: row.month, amount: row.amount });
      return acc;
    }, {});

    // Calculate loan insights (now includes credit card payments)
    const totalDebtPayments = loanSummary['Debt Payments']?.total || 0;
    const totalLoanDisbursements = loanSummary['Loan Disbursement']?.total || 0;
    const netLoanPosition = totalLoanDisbursements - totalDebtPayments;

    // Separate true income from self transfers and loans
    const trueIncomeCategories = smartIncomeCategories.filter(cat => 
      cat.income_type !== '🔄 Self Transfers' && cat.income_type !== '🏦 Loan Disbursement'
    );
    const selfTransferAmount = smartIncomeCategories.find(cat => cat.income_type === '🔄 Self Transfers')?.total_amount || 0;
    const loanDisbursementAmount = smartIncomeCategories.find(cat => cat.income_type === '🏦 Loan Disbursement')?.total_amount || 0;

    res.json({
      monthlyData: formattedMonthlyData,
      expenseCategories: expenseCategories,
      incomeCategories: trueIncomeCategories.map(cat => ({
        category: cat.income_type,
        total: cat.total_amount,
        count: cat.transaction_count,
        avg: cat.avg_amount
      })),
      loanTracking: {
        summary: loanSummary,
        totalPayments: totalDebtPayments, // Now includes credit card payments
        totalDisbursements: totalLoanDisbursements,
        netPosition: netLoanPosition,
        monthlyData: loanData
      },
      financialInsights: {
        selfTransferAmount: selfTransferAmount,
        loanDisbursementAmount: loanDisbursementAmount,
        trueIncome: trueIncomeCategories.reduce((sum, cat) => sum + cat.total_amount, 0),
        totalExpenses: expenseCategories.reduce((sum, cat) => sum + cat.amount, 0),
        availableCashFlow: trueIncomeCategories.reduce((sum, cat) => sum + cat.total_amount, 0) - 
                          expenseCategories.reduce((sum, cat) => sum + cat.amount, 0) - totalDebtPayments
      }
    });
  } catch (err) {
    console.error('Error fetching chart data:', err);
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

module.exports = router;
