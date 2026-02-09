(function () {
  const DEFAULT_LOCALE = 'en';
  const DEFAULT_CURRENCY = 'INR';

  const localeTags = {
    en: 'en-US',
    es: 'es-ES',
    fr: 'fr-FR'
  };

  const translations = {
    en: {
      'nav.dashboard': 'Dashboard',
      'nav.analytics': 'Analytics',
      'nav.goals': 'Goals',
      'nav.settings': 'Settings',
      'nav.contributors': 'Contributors',
      'nav.contact': 'Contact',
      'hero.badge': 'Trusted by 10,000+ users worldwide',
      'hero.title': 'Smart Money Management\nMade Simple',
      'hero.subtitle': 'Take control of your finances with our intelligent expense tracker.\nTrack, analyze, and optimize your spending habits effortlessly.',
      'hero.cta.start': 'Start Tracking Now',
      'hero.cta.learn': 'Learn More',
      'feature.heading': 'Powerful Features for Smart Finance',
      'feature.subheading': 'Everything you need to manage your money effectively',
      'stats.balance': 'Total Balance',
      'stats.income': 'This Month Income',
      'stats.expense': 'This Month Expenses',
      'stats.savings': 'Savings Rate',
      'history.title': 'Transaction History',
      'history.search': 'Search transactions...',
      'history.filter.all': 'All',
      'history.filter.income': 'Income',
      'history.filter.expense': 'Expense',
      'history.category.all': 'All Categories',
      'history.clear': 'Clear Filters',
      'data.title': 'Data Management',
      'data.export': 'Export Data',
      'data.export.csv': 'Quick CSV',
      'data.export.pdf': 'Quick PDF',
      'data.export.advanced': 'Advanced Export',
      'data.import': 'Import Data',
      'data.import.choose': 'Choose File',
      'data.import.run': 'Import Data',
      'data.import.merge': 'Merge with existing data',
      'export.modal.title': 'Export Expenses',
      'export.format.title': 'Export Format',
      'export.format.csv': 'CSV',
      'export.format.csv.desc': 'Excel compatible',
      'export.format.pdf': 'PDF Report',
      'export.format.pdf.desc': 'With charts & summary',
      'export.filters.title': 'Filter Options',
      'export.preview.title': 'Export Preview',
      'export.actions.cancel': 'Cancel',
      'export.actions.export': 'Export',
      'form.title': 'Add New Transaction',
      'form.description': 'Description',
      'form.description.placeholder': 'Enter transaction description',
      'form.category': 'Category',
      'form.amount': 'Amount',
      'form.amount.placeholder': 'Enter amount',
      'form.currency': 'Currency',
      'form.type': 'Transaction Type',
      'form.type.income': 'Income',
      'form.type.expense': 'Expense',
      'form.submit': 'Add Transaction',
      'recurring.title': 'Recurring Expenses & Subscriptions',
      'recurring.add': 'Add Recurring',
      'currency.modal.title': 'Currency Settings',
      'currency.preferred': 'Preferred Currency',
      'currency.info': 'All expenses will be converted to this currency for display',
      'currency.exchange': 'Exchange Rate Info',
      'currency.save': 'Save Settings',
      'currency.cancel': 'Cancel',
      'install.title': 'Install ExpenseFlow',
      'install.text': 'Install ExpenseFlow for quick access and offline functionality!',
      'install.install': 'Install',
      'install.dismiss': 'Not now',
      'offline.text': "You're offline. Changes will be saved locally.",
      'update.text': 'A new version is available!',
      'update.action': 'Update Now'
    },
    es: {
      'nav.dashboard': 'Panel',
      'nav.analytics': 'Analiticas',
      'nav.goals': 'Metas',
      'nav.settings': 'Ajustes',
      'nav.contributors': 'Colaboradores',
      'nav.contact': 'Contacto',
      'hero.badge': 'Confiado por mas de 10,000 usuarios en todo el mundo',
      'hero.title': 'Gestion financiera\nFacil',
      'hero.subtitle': 'Toma el control de tus finanzas con nuestro rastreador inteligente.\nControla, analiza y optimiza tus gastos facilmente.',
      'hero.cta.start': 'Comenzar ahora',
      'hero.cta.learn': 'Saber mas',
      'feature.heading': 'Funciones potentes para unas finanzas inteligentes',
      'feature.subheading': 'Todo lo que necesitas para gestionar tu dinero',
      'stats.balance': 'Saldo total',
      'stats.income': 'Ingresos del mes',
      'stats.expense': 'Gastos del mes',
      'stats.savings': 'Tasa de ahorro',
      'history.title': 'Historial de transacciones',
      'history.search': 'Buscar transacciones...',
      'history.filter.all': 'Todo',
      'history.filter.income': 'Ingreso',
      'history.filter.expense': 'Gasto',
      'history.category.all': 'Todas las categorias',
      'history.clear': 'Borrar filtros',
      'data.title': 'Gestion de datos',
      'data.export': 'Exportar datos',
      'data.export.csv': 'CSV rapido',
      'data.export.pdf': 'PDF rapido',
      'data.export.advanced': 'Exportacion avanzada',
      'data.import': 'Importar datos',
      'data.import.choose': 'Elegir archivo',
      'data.import.run': 'Importar datos',
      'data.import.merge': 'Combinar con datos existentes',
      'export.modal.title': 'Exportar gastos',
      'export.format.title': 'Formato de exportacion',
      'export.format.csv': 'CSV',
      'export.format.csv.desc': 'Compatible con Excel',
      'export.format.pdf': 'Informe PDF',
      'export.format.pdf.desc': 'Con graficos y resumen',
      'export.filters.title': 'Opciones de filtro',
      'export.preview.title': 'Vista previa de exportacion',
      'export.actions.cancel': 'Cancelar',
      'export.actions.export': 'Exportar',
      'form.title': 'Agregar transaccion',
      'form.description': 'Descripcion',
      'form.description.placeholder': 'Ingresa la descripcion',
      'form.category': 'Categoria',
      'form.amount': 'Monto',
      'form.amount.placeholder': 'Ingresa el monto',
      'form.currency': 'Moneda',
      'form.type': 'Tipo de transaccion',
      'form.type.income': 'Ingreso',
      'form.type.expense': 'Gasto',
      'form.submit': 'Agregar',
      'recurring.title': 'Gastos y suscripciones recurrentes',
      'recurring.add': 'Agregar recurrente',
      'currency.modal.title': 'Configuracion de moneda',
      'currency.preferred': 'Moneda preferida',
      'currency.info': 'Todos los gastos se mostraran en esta moneda',
      'currency.exchange': 'Informacion de tipo de cambio',
      'currency.save': 'Guardar ajustes',
      'currency.cancel': 'Cancelar',
      'install.title': 'Instalar ExpenseFlow',
      'install.text': 'Instala ExpenseFlow para acceso rapido y modo sin conexion.',
      'install.install': 'Instalar',
      'install.dismiss': 'Ahora no',
      'offline.text': 'Sin conexion. Los cambios se guardaran localmente.',
      'update.text': 'Nueva version disponible',
      'update.action': 'Actualizar ahora'
    },
    fr: {
      'nav.dashboard': 'Tableau de bord',
      'nav.analytics': 'Analytique',
      'nav.goals': 'Objectifs',
      'nav.settings': 'Parametres',
      'nav.contributors': 'Contributeurs',
      'nav.contact': 'Contact',
      'hero.badge': 'Approuve par plus de 10 000 utilisateurs',
      'hero.title': 'Gestion depenses\nsimplifiee',
      'hero.subtitle': 'Controlez vos finances avec notre suivi intelligent.\nSuivez, analysez et optimisez vos depenses facilement.',
      'hero.cta.start': 'Commencer',
      'hero.cta.learn': 'En savoir plus',
      'feature.heading': 'Fonctionnalites puissantes pour vos finances',
      'feature.subheading': 'Tout ce dont vous avez besoin pour gerer votre argent',
      'stats.balance': 'Solde total',
      'stats.income': 'Revenus du mois',
      'stats.expense': 'Depenses du mois',
      'stats.savings': 'Epargne',
      'history.title': 'Historique des transactions',
      'history.search': 'Rechercher des transactions...',
      'history.filter.all': 'Tout',
      'history.filter.income': 'Revenu',
      'history.filter.expense': 'Depense',
      'history.category.all': 'Toutes les categories',
      'history.clear': 'Effacer les filtres',
      'data.title': 'Gestion des donnees',
      'data.export': 'Exporter les donnees',
      'data.export.csv': 'CSV rapide',
      'data.export.pdf': 'PDF rapide',
      'data.export.advanced': 'Export avance',
      'data.import': 'Importer des donnees',
      'data.import.choose': 'Choisir un fichier',
      'data.import.run': 'Importer',
      'data.import.merge': 'Fusionner avec les donnees existantes',
      'export.modal.title': 'Exporter les depenses',
      'export.format.title': 'Format dexport',
      'export.format.csv': 'CSV',
      'export.format.csv.desc': 'Compatible Excel',
      'export.format.pdf': 'Rapport PDF',
      'export.format.pdf.desc': 'Avec graphiques et resume',
      'export.filters.title': 'Options de filtre',
      'export.preview.title': 'Apercu de lexport',
      'export.actions.cancel': 'Annuler',
      'export.actions.export': 'Exporter',
      'form.title': 'Ajouter une transaction',
      'form.description': 'Description',
      'form.description.placeholder': 'Saisir une description',
      'form.category': 'Categorie',
      'form.amount': 'Montant',
      'form.amount.placeholder': 'Saisir le montant',
      'form.currency': 'Devise',
      'form.type': 'Type de transaction',
      'form.type.income': 'Revenu',
      'form.type.expense': 'Depense',
      'form.submit': 'Ajouter',
      'recurring.title': 'Depenses et abonnements recurrents',
      'recurring.add': 'Ajouter',
      'currency.modal.title': 'Parametres de devise',
      'currency.preferred': 'Devise preferee',
      'currency.info': 'Toutes les depenses seront affichees dans cette devise',
      'currency.exchange': 'Taux de change',
      'currency.save': 'Enregistrer',
      'currency.cancel': 'Annuler',
      'install.title': 'Installer ExpenseFlow',
      'install.text': 'Installez ExpenseFlow pour un acces rapide et hors ligne.',
      'install.install': 'Installer',
      'install.dismiss': 'Plus tard',
      'offline.text': 'Hors ligne. Modifications stockees localement.',
      'update.text': 'Une nouvelle version est disponible',
      'update.action': 'Mettre a jour'
    }
  };

  const state = {
    locale: localStorage.getItem('expenseflow:locale') || DEFAULT_LOCALE,
    currency: localStorage.getItem('expenseflow:currency') || DEFAULT_CURRENCY
  };

  function getLocaleTag(locale) {
    return localeTags[locale] || localeTags[DEFAULT_LOCALE];
  }

  function t(key) {
    const active = translations[state.locale] || translations[DEFAULT_LOCALE];
    return active[key] || translations[DEFAULT_LOCALE][key] || key;
  }

  function formatCurrency(value, options = {}) {
    const currency = options.currency || state.currency || DEFAULT_CURRENCY;
    const localeTag = getLocaleTag(options.locale || state.locale);
    try {
      return new Intl.NumberFormat(localeTag, {
        style: 'currency',
        currency,
        minimumFractionDigits: options.minimumFractionDigits ?? 2,
        maximumFractionDigits: options.maximumFractionDigits ?? 2
      }).format(Number(value) || 0);
    } catch (err) {
      return `${getCurrencySymbol(currency)}${Number(value || 0).toFixed(2)}`;
    }
  }

  function formatNumber(value, options = {}) {
    const localeTag = getLocaleTag(options.locale || state.locale);
    return new Intl.NumberFormat(localeTag, options).format(Number(value) || 0);
  }

  function getCurrencySymbol(currencyCode) {
    try {
      const formatter = new Intl.NumberFormat(getLocaleTag(state.locale), {
        style: 'currency',
        currency: currencyCode,
        currencyDisplay: 'symbol'
      });
      const parts = formatter.formatToParts(1);
      const symbolPart = parts.find(part => part.type === 'currency');
      return symbolPart ? symbolPart.value : currencyCode;
    } catch (err) {
      return currencyCode;
    }
  }

  function applyTranslations(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(node => {
      node.textContent = t(node.dataset.i18n);
    });

    root.querySelectorAll('[data-i18n-placeholder]').forEach(node => {
      node.placeholder = t(node.dataset.i18nPlaceholder);
    });

    root.querySelectorAll('[data-i18n-title]').forEach(node => {
      node.title = t(node.dataset.i18nTitle);
    });

    root.querySelectorAll('[data-i18n-aria-label]').forEach(node => {
      node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
    });
  }

  function setLocale(locale) {
    const nextLocale = translations[locale] ? locale : DEFAULT_LOCALE;
    state.locale = nextLocale;
    localStorage.setItem('expenseflow:locale', nextLocale);
    document.documentElement.lang = nextLocale;
    applyTranslations();
    const languageSelect = document.getElementById('language-switcher');
    if (languageSelect) {
      languageSelect.value = nextLocale;
    }
  }

  function getLocale() {
    return state.locale;
  }

  function setCurrency(currency) {
    if (!currency) return;
    state.currency = currency;
    localStorage.setItem('expenseflow:currency', currency);
  }

  function getCurrency() {
    return state.currency;
  }

  function initLanguageSwitcher() {
    const select = document.getElementById('language-switcher');
    if (!select) return;
    select.value = state.locale;
    select.addEventListener('change', (e) => setLocale(e.target.value));
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.lang = state.locale;
    applyTranslations();
    initLanguageSwitcher();
  });

  window.i18n = {
    t,
    setLocale,
    getLocale,
    getLocaleTag,
    formatCurrency,
    formatNumber,
    setCurrency,
    getCurrency,
    getCurrencySymbol,
    applyTranslations
  };
})();
