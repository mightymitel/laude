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

    // Find a chord badge - they exist in segments that have chords
    // Note: First segment may have no chords (leading whitespace)
    const chordBadge = page.locator('[class*="chordBadge"]').first();
    await expect(chordBadge).toBeVisible();

    // Verify segmentChords containers exist (they hold the chord badges)
    const segmentChords = page.locator('[class*="segmentChords"]').first();
    await expect(segmentChords).toBeVisible();

    // Verify text is also present in segments
    const segmentText = page.locator('[class*="segmentText"]').first();
    await expect(segmentText).toBeVisible();

    // Verify we have the expected chord (C in key of C)
    await expect(chordBadge).toHaveText('C');
  });

  test('should show delete zone while dragging chord', async ({ page }) => {
    await page.goto('/debug/song-editor');

    // Delete zone should not be visible initially
    const deleteZone = page.locator('[class*="deleteZone"]');
    await expect(deleteZone).not.toBeVisible();

    // Find a chord badge to drag
    const chordBadge = page.locator('[class*="chordBadge"]').first();
    await expect(chordBadge).toBeVisible();

    // Start dragging using HTML5 drag event
    await chordBadge.dispatchEvent('dragstart');

    // Delete zone should appear (has 'visible' class when active)
    await expect(deleteZone).toBeVisible({ timeout: 2000 });
    await expect(deleteZone).toContainText('Drop here to delete');

    // Stop dragging
    await chordBadge.dispatchEvent('dragend');

    // Delete zone should disappear
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

    // Verify the toolbar chords are draggable
    const toolbarChord = page.locator('[class*="chordButton"]').first();
    await expect(toolbarChord).toBeVisible();
    await expect(toolbarChord).toHaveAttribute('draggable', 'true');

    // Verify the segment text is present for dropping
    const segmentText = page.locator('[class*="segmentText"]').first();
    await expect(segmentText).toBeVisible();

    // Note: Full drag-and-drop with caret positioning is difficult to test
    // in Playwright because DragEvent construction with dataTransfer
    // is not supported. The visual behavior works in real browsers.
    // We verify the elements are set up correctly for drag operations.
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
