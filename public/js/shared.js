/* ============================================
   AMERICANSIGNLANGUAGE.XYZ - SHARED JAVASCRIPT
   ============================================ */

// ============================================
// NAVIGATION COMPONENT
// ============================================

class Navigation {
  constructor() {
    this.currentPath = window.location.pathname;
    this.user = this.getUser();
    this.init();
  }

  getUser() {
    const token = localStorage.getItem('authToken');
    const userType = localStorage.getItem('userType');
    const userName = localStorage.getItem('userName');
    const userEmail = localStorage.getItem('userEmail');
    
    if (token) {
      return { token, userType, userName, userEmail };
    }
    return null;
  }

  init() {
    this.renderNavbar();
    this.renderFooter();
    this.setupMobileMenu();
    this.highlightCurrentPage();
  }

  renderNavbar() {
    const navbarHTML = `
      <nav class="navbar">
        <div class="navbar-container">
          <a href="/" class="navbar-brand">
            <span class="navbar-brand-icon">🤟</span>
            <span class="brand-full">americansignlanguage.eth</span>
            <span class="brand-short">ASL</span>
          </a>
          
          <div class="navbar-menu">
            <ul class="navbar-links">
              ${this.getNavLinks()}
            </ul>
            <div class="navbar-actions">
              ${this.getNavActions()}
            </div>
          </div>
          
          <button class="navbar-toggle" id="navbarToggle" aria-label="Toggle menu">
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </nav>
      
      <!-- Mobile Menu -->
      <div class="navbar-mobile" id="navbarMobile">
        <div class="navbar-mobile-header">
          <a href="/" class="navbar-brand">
            <span class="navbar-brand-icon">🤟</span>
            <span>americansignlanguage.eth</span>
          </a>
          <button class="navbar-mobile-close" id="navbarMobileClose">&times;</button>
        </div>
        <ul class="navbar-mobile-links">
          ${this.getMobileNavLinks()}
        </ul>
        <div class="navbar-mobile-actions">
          ${this.getMobileNavActions()}
        </div>
      </div>
    `;

    // Insert navbar at the beginning of body
    document.body.insertAdjacentHTML('afterbegin', navbarHTML);
  }

  getNavLinks() {
    if (!this.user) {
      // Public navigation
      return `
        <li><a href="/" class="navbar-link" data-page="home">Home</a></li>
        <li><a href="/about" class="navbar-link" data-page="about">About</a></li>
        <li><a href="/pricing" class="navbar-link" data-page="pricing">Pricing</a></li>
        <li><a href="/interpreter/apply" class="navbar-link" data-page="interpreter-apply">Become Interpreter</a></li>
      `;
    }

    if (this.user.userType === 'interpreter') {
      // Interpreter navigation
      return `
        <li><a href="/interpreter" class="navbar-link" data-page="interpreter">Dashboard</a></li>
        <li><a href="/interpreter/sessions" class="navbar-link" data-page="interpreter-sessions">Sessions</a></li>
        <li><a href="/interpreter/earnings" class="navbar-link" data-page="interpreter-earnings">Earnings</a></li>
        <li><a href="/interpreter/settings" class="navbar-link" data-page="interpreter-settings">Settings</a></li>
      `;
    }

    if (this.user.userType === 'admin') {
      // Admin navigation
      return `
        <li><a href="/admin" class="navbar-link" data-page="admin">Dashboard</a></li>
        <li><a href="/admin/applications" class="navbar-link" data-page="admin-applications">Applications</a></li>
        <li><a href="/admin/users" class="navbar-link" data-page="admin-users">Users</a></li>
        <li><a href="/admin/analytics" class="navbar-link" data-page="admin-analytics">Analytics</a></li>
      `;
    }

    // User navigation (default)
    return `
      <li><a href="/dashboard" class="navbar-link" data-page="dashboard">Dashboard</a></li>
      <li><a href="/dashboard/call" class="navbar-link" data-page="call">Call Now</a></li>
      <li><a href="/dashboard/history" class="navbar-link" data-page="history">History</a></li>
      <li><a href="/dashboard/billing" class="navbar-link" data-page="billing">Billing</a></li>
    `;
  }

  getMobileNavLinks() {
    // Same as desktop but with mobile-specific classes
    const links = this.getNavLinks();
    return links.replace(/navbar-link/g, 'navbar-mobile-link');
  }

  getNavActions() {
    if (!this.user) {
      return `
        <a href="/login" class="btn btn-ghost">Log In</a>
        <a href="/signup" class="btn btn-primary">Sign Up</a>
      `;
    }

    return `
      <div class="navbar-user">
        <span class="navbar-user-name">${this.user.userName || 'User'}</span>
        <button class="btn btn-ghost btn-sm" onclick="Navigation.logout()">Log Out</button>
      </div>
    `;
  }

  getMobileNavActions() {
    if (!this.user) {
      return `
        <a href="/login" class="btn btn-secondary btn-full">Log In</a>
        <a href="/signup" class="btn btn-primary btn-full">Sign Up</a>
      `;
    }

    return `
      <div class="navbar-mobile-user">
        <p>Logged in as <strong>${this.user.userName || 'User'}</strong></p>
        <button class="btn btn-danger btn-full" onclick="Navigation.logout()">Log Out</button>
      </div>
    `;
  }

  setupMobileMenu() {
    const toggle = document.getElementById('navbarToggle');
    const mobileMenu = document.getElementById('navbarMobile');
    const closeBtn = document.getElementById('navbarMobileClose');

    if (toggle && mobileMenu) {
      toggle.addEventListener('click', () => {
        mobileMenu.classList.add('open');
        document.body.style.overflow = 'hidden';
      });
    }

    if (closeBtn && mobileMenu) {
      closeBtn.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
      });
    }

    // Close on link click
    const mobileLinks = document.querySelectorAll('.navbar-mobile-link');
    mobileLinks.forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  highlightCurrentPage() {
    const links = document.querySelectorAll('.navbar-link, .navbar-mobile-link');
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href === this.currentPath || 
          (href !== '/' && this.currentPath.startsWith(href))) {
        link.classList.add('active');
      }
    });
  }

  renderFooter() {
    const footerHTML = `
      <footer class="footer">
        <div class="container">
          <div class="footer-content">
            <div class="footer-section">
              <h4>🤟 americansignlanguage.eth</h4>
              <p style="color: rgba(255,255,255,0.8); font-size: 0.9rem;">
                Video Remote Interpreting for the Deaf & Hard of Hearing Community. 
                The first Deaf-owned VRI platform.
              </p>
            </div>
            
            <div class="footer-section">
              <h4>Platform</h4>
              <ul class="footer-links">
                <li><a href="/pricing">Pricing</a></li>
                <li><a href="/interpreter/apply">Become an Interpreter</a></li>
                <li><a href="/about">About Us</a></li>
                <li><a href="/contact">Contact</a></li>
              </ul>
            </div>
            
            <div class="footer-section">
              <h4>Resources</h4>
              <ul class="footer-links">
                <li><a href="/help">Help Center</a></li>
                <li><a href="/terms">Terms of Service</a></li>
                <li><a href="/privacy">Privacy Policy</a></li>
                <li><a href="/accessibility">Accessibility</a></li>
              </ul>
            </div>
            
            <div class="footer-section">
              <h4>Connect</h4>
              <div class="footer-social">
                <a href="https://instagram.com/americansignlanguage.eth" target="_blank" aria-label="Instagram">📸</a>
                <a href="https://x.com/aslnfts" target="_blank" aria-label="Twitter">🐦</a>
              </div>
              <p style="color: rgba(255,255,255,0.7); font-size: 0.85rem; margin-top: 12px;">
                Questions? <a href="/contact" style="color: white; text-decoration: underline;">Contact Us</a>
              </p>
            </div>
          </div>
          
          <div class="footer-bottom">
            <p>americansignlanguage.eth &copy; ${new Date().getFullYear()} All Rights Reserved</p>
            <p style="margin-top: 8px;">Empowering the Deaf Community 🤟</p>
          </div>
        </div>
      </footer>
    `;

    document.body.insertAdjacentHTML('beforeend', footerHTML);
  }

  static logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userType');
    localStorage.removeItem('userName');
    localStorage.removeItem('userEmail');
    window.location.href = '/';
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

const Utils = {
  // Format currency
  formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  },

  // Format duration (seconds to MM:SS)
  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  },

  // Format date
  formatDate(date, options = {}) {
    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return new Date(date).toLocaleDateString('en-US', { ...defaultOptions, ...options });
  },

  // Show toast notification
  showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span>${message}</span>
      <button class="toast-close">&times;</button>
    `;
    
    // Add toast styles if not present
    if (!document.getElementById('toast-styles')) {
      const styles = document.createElement('style');
      styles.id = 'toast-styles';
      styles.textContent = `
        .toast {
          position: fixed;
          bottom: 20px;
          right: 20px;
          padding: 16px 24px;
          border-radius: 8px;
          color: white;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 12px;
          z-index: 9999;
          animation: slideIn 0.3s ease;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .toast-info { background: #3b82f6; }
        .toast-success { background: #10b981; }
        .toast-error { background: #ef4444; }
        .toast-warning { background: #f59e0b; }
        .toast-close {
          background: none;
          border: none;
          color: white;
          font-size: 1.25rem;
          cursor: pointer;
          padding: 0;
          margin-left: 8px;
        }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `;
      document.head.appendChild(styles);
    }

    document.body.appendChild(toast);

    const closeBtn = toast.querySelector('.toast-close');
    const removeToast = () => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    };

    closeBtn.addEventListener('click', removeToast);
    setTimeout(removeToast, duration);
  },

  // Loading overlay
  showLoading(message = 'Loading...') {
    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
      <div style="text-align: center;">
        <div class="spinner" style="width: 48px; height: 48px; margin: 0 auto 16px;"></div>
        <p style="color: var(--gray-600);">${message}</p>
      </div>
    `;
    document.body.appendChild(overlay);
  },

  hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.remove();
  },

  // API helper
  async api(endpoint, options = {}) {
    const token = localStorage.getItem('authToken');
    const defaultHeaders = {
      'Content-Type': 'application/json'
    };

    if (token) {
      defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(endpoint, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Something went wrong');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  // Validate email
  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  // Debounce function
  debounce(func, wait) {
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
};

// ============================================
// AUTH HELPERS
// ============================================

const Auth = {
  isLoggedIn() {
    return !!localStorage.getItem('authToken');
  },

  getUser() {
    if (!this.isLoggedIn()) return null;
    return {
      token: localStorage.getItem('authToken'),
      type: localStorage.getItem('userType'),
      name: localStorage.getItem('userName'),
      email: localStorage.getItem('userEmail')
    };
  },

  setUser(data) {
    localStorage.setItem('authToken', data.token);
    localStorage.setItem('userType', data.userType || 'user');
    localStorage.setItem('userName', data.name || '');
    localStorage.setItem('userEmail', data.email || '');
  },

  logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userType');
    localStorage.removeItem('userName');
    localStorage.removeItem('userEmail');
    window.location.href = '/';
  },

  requireAuth(redirectTo = '/login') {
    if (!this.isLoggedIn()) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  },

  requireUserType(types, redirectTo = '/') {
    const user = this.getUser();
    if (!user || !types.includes(user.type)) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  }
};

// ============================================
// MODAL HELPER
// ============================================

const Modal = {
  open(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  },

  close(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    }
  },

  // Create a confirm dialog
  confirm(message, onConfirm, onCancel) {
    const modalHTML = `
      <div class="modal-backdrop open" id="confirm-modal">
        <div class="modal">
          <div class="modal-header">
            <h3 class="modal-title">Confirm</h3>
            <button class="modal-close" onclick="Modal.close('confirm-modal')">&times;</button>
          </div>
          <div class="modal-body">
            <p>${message}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" id="confirm-cancel">Cancel</button>
            <button class="btn btn-primary" id="confirm-ok">Confirm</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('confirm-ok').addEventListener('click', () => {
      Modal.close('confirm-modal');
      document.getElementById('confirm-modal').remove();
      if (onConfirm) onConfirm();
    });

    document.getElementById('confirm-cancel').addEventListener('click', () => {
      Modal.close('confirm-modal');
      document.getElementById('confirm-modal').remove();
      if (onCancel) onCancel();
    });
  }
};

// ============================================
// INITIALIZE ON DOM READY
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Initialize navigation if not on VRI session page (fullscreen)
  if (!window.location.pathname.startsWith('/session/')) {
    new Navigation();
  }
});

// Export for use in other scripts
window.Navigation = Navigation;
window.Utils = Utils;
window.Auth = Auth;
window.Modal = Modal;
