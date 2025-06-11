# Frontend - FinanceFlow Pro

The frontend of FinanceFlow Pro is a single-page application (SPA) built with vanilla JavaScript, HTML5, and CSS3.

## 🚀 Quick Start

### Option 1: Python Server (Recommended)
```bash
cd frontend
python -m http.server 8000
# or for Python 3
python3 -m http.server 8000
```

### Option 2: Node.js Server
```bash
# Install http-server globally
npm install -g http-server

# Start server
http-server -p 8000
```

### Option 3: VS Code Live Server
1. Install "Live Server" extension in VS Code
2. Right-click on `index.html` → "Open with Live Server"

## 📁 File Structure

```
frontend/
├── index.html          # Main HTML file with all pages
├── style.css           # Complete CSS with themes
├── app.js             # JavaScript with API integration
└── README.md          # This file
```

## 🔧 Features

- **Single Page Application**: All pages in one HTML file
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Dark/Light Theme**: Automatic based on system preference
- **API Integration**: Connects to backend REST API
- **Charts**: Interactive charts using Chart.js
- **Real-time Updates**: Data updates without page refresh

## 🌐 API Integration

The frontend connects to the backend API at `http://localhost:3001/api`

### API Endpoints Used:
- `GET /api/health` - Health check
- `GET /api/accounts` - Get all accounts
- `GET /api/transactions` - Get transactions (with filters)
- `POST /api/transactions` - Add new transaction
- `DELETE /api/transactions/:id` - Delete transaction
- `GET /api/budgets` - Get budget data
- `GET /api/goals` - Get savings goals
- `GET /api/investments` - Get investment data
- `GET /api/dashboard` - Get dashboard summary

## 🎨 Styling

The application uses CSS custom properties (variables) for:
- **Colors**: Light and dark theme support
- **Typography**: Consistent font sizing and spacing
- **Components**: Reusable UI components
- **Responsive**: Mobile-first responsive design

## 📱 Pages

1. **Dashboard** - Financial overview with charts
2. **Transactions** - View, add, edit, and filter transactions
3. **Budget** - Budget planning and tracking
4. **Goals** - Savings goals management
5. **Investments** - Investment portfolio overview
6. **Analytics** - Reports and trend analysis
7. **Upload** - Bank statement upload (simulated)
8. **Settings** - User preferences

## 🔧 Configuration

### API Configuration
Update the API base URL in `app.js` if needed:
```javascript
const API_BASE_URL = 'http://localhost:3001/api';
```

### Development
- The app automatically detects if the backend is running
- Shows error messages if API is unavailable
- Graceful fallback for offline mode

## 🚨 Troubleshooting

### Common Issues:
1. **Charts not loading**: Ensure Chart.js CDN is accessible
2. **API errors**: Check if backend server is running on port 3001
3. **CORS issues**: Verify backend CORS settings
4. **Mobile layout issues**: Check viewport meta tag

### Browser Support:
- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## 📈 Performance

- **Lazy Loading**: Charts load only when needed
- **Efficient Updates**: Only update changed elements
- **Minimal Dependencies**: Only Chart.js for charts
- **Optimized CSS**: CSS custom properties for theming

## 🔒 Security Notes

- No sensitive data stored in frontend
- API calls use proper error handling
- Input validation on forms
- XSS protection through proper escaping