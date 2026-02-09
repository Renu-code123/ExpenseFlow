// Simple internationalization service
const i18next = require('i18next');

class InternationalizationService {
  constructor() {
    this.translations = {
      en: {
        expense: 'Expense',
        income: 'Income',
        budget: 'Budget',
        category: 'Category'
      },
      es: {
        expense: 'Gasto',
        income: 'Ingreso',
        budget: 'Presupuesto',
        category: 'Categoría'
      }
    };
  }

  init() {
    i18next.init({
      lng: 'en',
      resources: this.translations
    });
    console.log('Internationalization service initialized');
  }

  translate(key, language = 'en') {
    return this.translations[language]?.[key] || key;
  }
}

module.exports = new InternationalizationService();