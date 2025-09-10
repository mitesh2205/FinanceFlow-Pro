/**
 * Modern Frontend Router for FinanceFlow Pro
 * Supports browser history, deep linking, and parameter parsing
 */

class Router {
  constructor() {
    this.routes = new Map();
    this.middlewares = [];
    this.currentRoute = null;
    this.isInitialized = false;
    
    // Default route configuration
    this.defaultRoute = '/';
    this.notFoundRoute = '/404';
    
    // Bind methods to maintain context
    this.handlePopState = this.handlePopState.bind(this);
    this.handleLinkClick = this.handleLinkClick.bind(this);
  }

  /**
   * Initialize the router
   */
  init() {
    if (this.isInitialized) return;
    
    // Listen for browser back/forward events
    window.addEventListener('popstate', this.handlePopState);
    
    // Intercept link clicks for SPA navigation
    document.addEventListener('click', this.handleLinkClick);
    
    // Handle initial route
    this.handleRoute(window.location.pathname + window.location.search);
    
    this.isInitialized = true;
    console.log('Router initialized');
  }

  /**
   * Define a route
   * @param {string} path - Route path with optional parameters (:id)
   * @param {Object} config - Route configuration
   */
  route(path, config) {
    // Convert path to regex pattern for parameter matching
    const paramNames = [];
    const regexPath = path.replace(/:([^/]+)/g, (match, paramName) => {
      paramNames.push(paramName);
      return '([^/]+)';
    });
    
    const routePattern = new RegExp(`^${regexPath}(?:\\?.*)?$`);
    
    this.routes.set(path, {
      ...config,
      pattern: routePattern,
      paramNames: paramNames,
      originalPath: path
    });
    
    return this; // For method chaining
  }

  /**
   * Add middleware that runs before route handlers
   * @param {function} middleware - Middleware function
   */
  use(middleware) {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Navigate to a route programmatically
   * @param {string} path - Path to navigate to
   * @param {Object} options - Navigation options
   */
  navigate(path, options = {}) {
    const { replace = false, state = null } = options;
    
    if (replace) {
      window.history.replaceState(state, '', path);
    } else {
      window.history.pushState(state, '', path);
    }
    
    this.handleRoute(path);
  }

  /**
   * Handle route changes
   * @param {string} path - Current path
   */
  async handleRoute(path) {
    try {
      // Parse path and query parameters
      const [pathname, queryString] = path.split('?');
      const queryParams = this.parseQueryString(queryString || '');
      
      // Find matching route
      const route = this.findMatchingRoute(pathname);
      
      if (!route) {
        return this.handleNotFound(pathname);
      }

      // Extract path parameters
      const pathParams = this.extractPathParams(pathname, route);
      
      // Create route context
      const context = {
        path: pathname,
        fullPath: path,
        params: pathParams,
        query: queryParams,
        state: window.history.state,
        route: route.originalPath
      };

      // Run middlewares
      for (const middleware of this.middlewares) {
        const result = await middleware(context);
        if (result === false) {
          // Middleware blocked navigation
          return;
        }
      }

      // Execute route handler
      this.currentRoute = context;
      await route.handler(context);
      
      // Update page title if specified
      if (route.title) {
        document.title = typeof route.title === 'function' 
          ? route.title(context) 
          : route.title;
      }

    } catch (error) {
      console.error('Route handling error:', error);
      this.handleError(error, path);
    }
  }

  /**
   * Find route that matches the current path
   * @param {string} pathname - Current pathname
   */
  findMatchingRoute(pathname) {
    for (const [path, route] of this.routes.entries()) {
      if (route.pattern.test(pathname)) {
        return route;
      }
    }
    return null;
  }

  /**
   * Extract parameters from path
   * @param {string} pathname - Current pathname
   * @param {Object} route - Route configuration
   */
  extractPathParams(pathname, route) {
    const params = {};
    const matches = pathname.match(route.pattern);
    
    if (matches) {
      route.paramNames.forEach((paramName, index) => {
        params[paramName] = matches[index + 1];
      });
    }
    
    return params;
  }

  /**
   * Parse query string into object
   * @param {string} queryString - Query string
   */
  parseQueryString(queryString) {
    const params = {};
    if (!queryString) return params;
    
    const pairs = queryString.split('&');
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key) {
        params[decodeURIComponent(key)] = decodeURIComponent(value || '');
      }
    }
    
    return params;
  }

  /**
   * Handle browser back/forward navigation
   * @param {PopStateEvent} event - PopState event
   */
  handlePopState(event) {
    this.handleRoute(window.location.pathname + window.location.search);
  }

  /**
   * Handle click events for SPA navigation
   * @param {Event} event - Click event
   */
  handleLinkClick(event) {
    const link = event.target.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');
    
    // Skip external links, anchors, and special protocols
    if (!href || 
        href.startsWith('http') || 
        href.startsWith('mailto:') || 
        href.startsWith('tel:') ||
        href.startsWith('#')) {
      return;
    }

    // Skip if link has data-external attribute
    if (link.hasAttribute('data-external')) {
      return;
    }

    event.preventDefault();
    this.navigate(href);
  }

  /**
   * Handle 404 not found
   * @param {string} path - Path that was not found
   */
  handleNotFound(path) {
    console.warn(`Route not found: ${path}`);
    
    // Try to navigate to 404 route or default route
    const notFoundRoute = this.routes.get(this.notFoundRoute);
    if (notFoundRoute && path !== this.notFoundRoute) {
      this.navigate(this.notFoundRoute, { replace: true });
    } else if (path !== this.defaultRoute) {
      this.navigate(this.defaultRoute, { replace: true });
    }
  }

  /**
   * Handle routing errors
   * @param {Error} error - Error that occurred
   * @param {string} path - Path where error occurred
   */
  handleError(error, path) {
    console.error(`Router error on path ${path}:`, error);
    
    // Could integrate with error reporting service here
    // For now, show a user-friendly message
    if (window.showToast) {
      window.showToast('Navigation error occurred. Please try again.', 'error');
    }
  }

  /**
   * Get current route context
   */
  getCurrentRoute() {
    return this.currentRoute;
  }

  /**
   * Check if current path matches pattern
   * @param {string} pattern - Pattern to match
   */
  isActive(pattern) {
    if (!this.currentRoute) return false;
    
    const currentPath = this.currentRoute.path;
    return currentPath === pattern || currentPath.startsWith(pattern + '/');
  }

  /**
   * Generate URL with parameters
   * @param {string} routePath - Route path template
   * @param {Object} params - Parameters to fill in
   * @param {Object} query - Query parameters
   */
  url(routePath, params = {}, query = {}) {
    let url = routePath;
    
    // Replace path parameters
    Object.entries(params).forEach(([key, value]) => {
      url = url.replace(`:${key}`, encodeURIComponent(value));
    });
    
    // Add query parameters
    const queryString = Object.entries(query)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    
    if (queryString) {
      url += '?' + queryString;
    }
    
    return url;
  }

  /**
   * Clean up router (for testing or reinitialization)
   */
  destroy() {
    if (!this.isInitialized) return;
    
    window.removeEventListener('popstate', this.handlePopState);
    document.removeEventListener('click', this.handleLinkClick);
    
    this.routes.clear();
    this.middlewares = [];
    this.currentRoute = null;
    this.isInitialized = false;
  }
}

// Export singleton instance
const router = new Router();
window.router = router; // Make available globally

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = router;
}
