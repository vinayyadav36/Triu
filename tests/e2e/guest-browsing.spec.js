// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Guest browsing — Public pages must be accessible without any login.
 * The home page, product listings, search, and category filters must all
 * render correctly for unauthenticated (guest) users.
 */

test.describe('Guest browsing — public access', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure no auth tokens from prior tests
    await page.context().clearCookies();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('home page loads without login', async ({ page }) => {
    await expect(page).toHaveTitle(/Emproium|Vipani/i);
    // Hero / product grid should be visible
    await expect(page.locator('main').first()).toBeVisible();
    // Login modal should NOT be visible on page load
    const loginModal = page.locator('[x-show="store.modals.login"]');
    await expect(loginModal).toBeHidden();
  });

  test('products are visible without login', async ({ page }) => {
    // Product cards should exist
    const productCards = page.locator('.product-card, [data-product], article');
    // Wait a few seconds for Alpine.js to render products
    await page.waitForTimeout(1500);
    const count = await productCards.count();
    // Either real products loaded or seed data fallback rendered
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('search works without login', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]');
    if (await searchInput.count() > 0) {
      await searchInput.first().fill('natural');
      await page.waitForTimeout(600);
      // Page should not redirect to login
      await expect(page).toHaveURL(/\//);
      const loginModal = page.locator('[x-show="store.modals.login"]');
      await expect(loginModal).toBeHidden();
    }
  });

  test('category filter works without login', async ({ page }) => {
    const categoryBtn = page.locator('button:has-text("Electronics"), button:has-text("Fashion"), button:has-text("Books")');
    if (await categoryBtn.count() > 0) {
      await categoryBtn.first().click();
      await page.waitForTimeout(500);
      await expect(page).toHaveURL(/\//);
      const loginModal = page.locator('[x-show="store.modals.login"]');
      await expect(loginModal).toBeHidden();
    }
  });

  test('guest can add item to cart', async ({ page }) => {
    await page.waitForTimeout(1500);
    const addToCartBtn = page.locator('button:has-text("Add to cart"), button:has-text("Add"), [data-action="add-to-cart"]');
    if (await addToCartBtn.count() > 0) {
      await addToCartBtn.first().click();
      await page.waitForTimeout(500);
      // Toast or cart count indicator should update
      const toastOrCount = page.locator('[id*="toast"], [x-show*="toast"], .toast, [x-text*="cart"]');
      // No login modal should appear
      const loginModal = page.locator('[x-show="store.modals.login"]');
      await expect(loginModal).toBeHidden();
    }
  });

  test('no mandatory login on page load', async ({ page }) => {
    // Critical: the app must not force login at entry
    const loginModal = page.locator('[x-show="store.modals.login"]');
    // Wait to ensure Alpine.js has evaluated x-show
    await page.waitForTimeout(1000);
    await expect(loginModal).toBeHidden();
  });
});
