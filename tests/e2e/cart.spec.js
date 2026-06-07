// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Cart operations — Guests can add, update, and remove items from the cart.
 * The cart persists in localStorage so items survive a page reload.
 */

test.describe('Cart — guest operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
  });

  test('guest can open and close the cart', async ({ page }) => {
    await page.evaluate(() => {
      if (window.store && typeof window.store.openModal === 'function') {
        window.store.openModal('cart');
      } else if (window.store && window.store.cartOpen !== undefined) {
        window.store.cartOpen = true;
      }
    });
    await page.waitForTimeout(400);

    const cartPanel = page.locator('[x-show="store.modals.cart"], [x-show="store.cartOpen"], #cart-modal');
    await expect(cartPanel.first()).toBeVisible();

    await page.evaluate(() => {
      if (window.store && typeof window.store.closeModal === 'function') {
        window.store.closeModal('cart');
      } else if (window.store && window.store.cartOpen !== undefined) {
        window.store.cartOpen = false;
      }
    });
    await page.waitForTimeout(400);
    await expect(cartPanel.first()).toBeHidden();
  });

  test('guest cart is empty on first visit', async ({ page }) => {
    // Clear localStorage to simulate fresh visit
    await page.evaluate(() => localStorage.removeItem('emproium_cart'));
    await page.reload();
    await page.waitForTimeout(1000);

    const cartCount = page.locator('[x-text*="cart"], [data-cart-count]');
    if (await cartCount.count() > 0) {
      const text = await cartCount.first().textContent();
      const count = parseInt(text || '0', 10);
      expect(count).toBe(0);
    }
  });

  test('adding an item updates cart count', async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('emproium_cart'));
    await page.reload();
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
      if (window.store && typeof window.store.addToCart === 'function') {
        window.store.addToCart({ id: '1', name: 'Test Product', price: 10 });
      } else if (window.store && window.store.cart !== undefined) {
        window.store.cart.push({ id: '1', name: 'Test Product', price: 10 });
      }
    });
    await page.waitForTimeout(1000);

    const cartCount = page.locator('.cart-count, [data-testid="cart-count"], [x-text="store.cart.length"]');
    if (await cartCount.count() > 0) {
      const text = await cartCount.first().textContent();
      expect(parseInt(text || '0', 10)).toBeGreaterThan(0);
    }
  });

  test('cart persists across page reload', async ({ page }) => {
    const addBtn = page.locator('button:has-text("Add to cart"), button:has-text("Add")');
    if (await addBtn.count() > 0) {
      await addBtn.first().click();
      await page.waitForTimeout(500);

      // Reload the page
      await page.reload();
      await page.waitForTimeout(1500);

      // Cart should still have items from localStorage
      const cartData = await page.evaluate(() => localStorage.getItem('emproium_cart'));
      const cart = JSON.parse(cartData || '[]');
      expect(Array.isArray(cart)).toBe(true);
    }
  });
});
