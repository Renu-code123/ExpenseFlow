// Theme Toggle Functionality
class ThemeManager {
  constructor() {
    this.STORAGE_KEY = 'expenseflow-theme';
    this.LIGHT_THEME = 'light';
    this.DARK_THEME = 'dark';
    this.init();
  }

  init() {
    // Check if DOM is already loaded (likely since script is at end of body)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.restoreTheme();
        this.setupThemeToggle();
      });
    } else {
      // DOM is already loaded, initialize immediately
      this.restoreTheme();
      this.setupThemeToggle();
    }
  }

  getStoredTheme() {
    return localStorage.getItem(this.STORAGE_KEY);
  }

  setStoredTheme(theme) {
    localStorage.setItem(this.STORAGE_KEY, theme);
  }

  getPreferredTheme() {
    const stored = this.getStoredTheme();
    if (stored) {
      return stored;
    }

    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return this.LIGHT_THEME;
    }

    return this.DARK_THEME;
  }

  applyTheme(theme) {
    const html = document.documentElement;
    
    if (theme === this.LIGHT_THEME) {
      html.setAttribute('data-theme', this.LIGHT_THEME);
    } else {
      html.setAttribute('data-theme', this.DARK_THEME);
    }

    this.setStoredTheme(theme);
    this.updateToggleButton(theme);
  }

  restoreTheme() {
    const theme = this.getPreferredTheme();
    this.applyTheme(theme);
  }

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || this.DARK_THEME;
    const newTheme = currentTheme === this.LIGHT_THEME ? this.DARK_THEME : this.LIGHT_THEME;
    this.applyTheme(newTheme);
  }

  updateToggleButton(theme) {
    const button = document.getElementById('theme-toggle-btn');
    if (button) {
      if (theme === this.LIGHT_THEME) {
        button.classList.add('light-mode');
        button.classList.remove('dark-mode');
        button.title = 'Switch to Dark Mode';
        button.innerHTML = '<i class="fas fa-moon"></i>';
      } else {
        button.classList.add('dark-mode');
        button.classList.remove('light-mode');
        button.title = 'Switch to Light Mode';
        button.innerHTML = '<i class="fas fa-sun"></i>';
      }
    }
  }

  setupThemeToggle() {
    const button = document.getElementById('theme-toggle-btn');
    if (button) {
      button.addEventListener('click', () => this.toggleTheme());
    }
  }
}

// Initialize theme manager
const themeManager = new ThemeManager();
