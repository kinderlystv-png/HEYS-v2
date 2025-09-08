// ЭМТ v3.0-stable Test IDs
export const TEST_IDS = {
  // Layout
  HEADER: 'app-header',
  FOOTER: 'app-footer',
  SIDEBAR: 'app-sidebar',
  MAIN: 'main-content',

  // Navigation
  NAV_MENU: 'nav-menu',
  NAV_LINK: 'nav-link',
  NAV_BUTTON: 'nav-button',

  // Forms
  FORM: 'form',
  INPUT: 'form-input',
  SUBMIT: 'form-submit',
  ERROR: 'form-error',
  SUCCESS: 'form-success',

  // UI Components
  BUTTON: 'button',
  MODAL: 'modal',
  DIALOG: 'dialog',
  SPINNER: 'loading-spinner',
  ALERT: 'alert-message'
} as const;

export type TestId = typeof TEST_IDS[keyof typeof TEST_IDS];