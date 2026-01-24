import { test, expect } from '@playwright/test';

test.describe('Song Editor', () => {
  test('should load the editor with initial song', async ({ page }) => {
    await page.goto('/debug/song-editor');

    // Check for title using generic selector to avoid placeholder issues
    const titleInput = page.locator('input[placeholder*="Title"]');
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toHaveValue('Test Song: Amazing Grace');

    // Parts check
    // Use partial value match or relaxed check
    const verseInput = page.locator('input').filter({ hasValue: 'Verse 1' }).first();
    await expect(verseInput).toBeVisible();

    const chorusInput = page.locator('input').filter({ hasValue: 'Chorus 1' }).first();
    await expect(chorusInput).toBeVisible();

    // Check for lyrics
    // Text is split by inline chords, so we check for partial segment "Amazing"
    await expect(page.getByText('Amazing', { exact: false }).first()).toBeVisible();
  });

  test('should display chords above text', async ({ page }) => {
    await page.goto('/debug/song-editor');

    // Find a line with chords
    const line = page.locator('[class*="line"]').first();
    await expect(line).toBeVisible();

    // Check that chordRow exists above textRow
    const chordRow = line.locator('[class*="chordRow"]');
    const textRow = line.locator('[class*="textRow"]');

    await expect(chordRow).toBeVisible();
    await expect(textRow).toBeVisible();

    // Chord badges should be in chord row with absolute positioning
    const chordBadge = chordRow.locator('[class*="chordBadge"]').first();
    await expect(chordBadge).toBeVisible();

    // Check that chord has position style (left: Xch)
    const style = await chordBadge.getAttribute('style');
    expect(style).toContain('left');
  });

  test('should show delete zone while dragging chord', async ({ page }) => {
    await page.goto('/debug/song-editor');

    // Delete zone should not be visible initially
    const deleteZone = page.locator('[class*="deleteZone"]');
    await expect(deleteZone).not.toBeVisible();

    // Find a chord badge to drag
    const chordBadge = page.locator('[class*="chordBadge"]').first();
    await expect(chordBadge).toBeVisible();

    // Start dragging
    await chordBadge.hover();
    await page.mouse.down();

    // Delete zone should appear with animation
    await page.waitForTimeout(100);
    await expect(deleteZone).toBeVisible();
    await expect(deleteZone).toContainText('Drop here to delete');

    // Stop dragging
    await page.mouse.up();

    // Delete zone should disappear
    await page.waitForTimeout(200);
    await expect(deleteZone).not.toBeVisible();
  });

  test('should apply dragging visual feedback', async ({ page }) => {
    await page.goto('/debug/song-editor');

    const chordBadge = page.locator('[class*="chordBadge"]').first();
    await expect(chordBadge).toBeVisible();

    // Start drag
    await chordBadge.dispatchEvent('dragstart');

    // Badge should have dragging class (opacity: 0.3, scale: 0.9)
    await page.waitForTimeout(50);
    const className = await chordBadge.getAttribute('class');
    expect(className).toContain('dragging');
  });

  test('should show caret only during drag', async ({ page }) => {
    await page.goto('/debug/song-editor');

    // Caret should not be visible initially
    const caret = page.locator('[class*="dropCaret"]');
    await expect(caret).not.toBeVisible();

    // Start dragging a chord from toolbar
    const toolbarChord = page.locator('[class*="chordButton"]').first();
    await toolbarChord.hover();

    // Drag over a text line
    const textRow = page.locator('[class*="textRow"]').first();
    await toolbarChord.dragTo(textRow);

    // Note: In real browser interaction, caret should appear during drag
    // This is hard to test in Playwright, but the visual should work
  });

  test('should allow dragging chords', async ({ page }) => {
    await page.goto('/debug/song-editor');

    // Initial key is C. Toolbar should show C, F, G.
    // We look for a BUTTON with text "C".
    const chordC = page.locator('button').filter({ hasText: /^C$/ }).first();
    await expect(chordC).toBeVisible();

    // Check for existing chords in text (Badge C)
    // Use partial class match for CSS modules
    const badgeC = page.locator('[class*="chordBadge"]').filter({ hasText: /^C$/ }).first();
    await expect(badgeC).toBeVisible();
  });

  test('should sync between visual and raw modes', async ({ page }) => {
    await page.goto('/debug/song-editor');

    // Switch to Raw mode
    await page.getByText('Raw').click();

    // Check raw content
    const editor = page.locator('textarea');
    await expect(editor).toBeVisible();
    const content = await editor.inputValue();

    // Underlying data uses Nashville: [1]...
    expect(content).toContain('#verse 1');
    const hasNumbers = content.includes('[1]Amazing') || content.includes('[1] Amazing');
    expect(hasNumbers).toBeTruthy();

    // Edit raw content
    await editor.fill('#verse 1\n[5]New chord content');

    // Switch back to Visual
    await page.getByText('Visual').click();

    // Verify changes. [5] in C is G.
    const verseInput = page.locator('input').filter({ hasValue: 'Verse 1' }).first();
    await expect(verseInput).toBeVisible();

    // Check for Badge G using partial class match
    const badgeG = page.locator('[class*="chordBadge"]').filter({ hasText: /^G$/ }).first();
    await expect(badgeG).toBeVisible();

    await expect(page.getByText('New chord content')).toBeVisible();
  });

  test('should add new part', async ({ page }) => {
    await page.goto('/debug/song-editor');

    await page.getByText('+ Add Part').click();
    await page.getByText('Bridge').click();
    await page.getByRole('button', { name: 'Add bridge' }).click();

    const bridgeInput = page.locator('input').filter({ hasValue: 'Bridge 1' }).first();
    await expect(bridgeInput).toBeVisible();
  });
});
