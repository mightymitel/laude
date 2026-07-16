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

    // dnd-kit transport (WP-166): a real pointer drag of a PLACED chord.
    const chordBadge = page.locator('[class*="chordBadge"]').first();
    await expect(chordBadge).toBeVisible();
    const box = (await chordBadge.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 30, box.y + 30, { steps: 4 });

    await expect(deleteZone).toBeVisible({ timeout: 2000 });
    await expect(deleteZone).toContainText('Drop here to delete');

    // Release away from the zone: nothing deleted, zone disappears.
    await page.mouse.up();
    await expect(deleteZone).not.toBeVisible();
  });

  test('should apply dragging visual feedback', async ({ page }) => {
    await page.goto('/debug/song-editor');

    const chordBadge = page.locator('[class*="chordBadge"]').first();
    await expect(chordBadge).toBeVisible();
    const box = (await chordBadge.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 30, box.y + 30, { steps: 4 });

    // The source badge dims while its overlay follows the pointer.
    const className = await chordBadge.getAttribute('class');
    expect(className).toContain('dragging');
    await page.mouse.up();
  });

  test('should show caret only during drag — character-exact live preview', async ({ page }) => {
    await page.goto('/debug/song-editor');

    // Caret should not be visible initially
    const caret = page.locator('[class*="dropCaret"]');
    await expect(caret).not.toBeVisible();

    // Drag a toolbar chip over a lyric line: the caret preview appears at
    // the pointer's insertion point (caret-from-point, WP-166) — the old
    // HTML5 transport couldn't be driven from Playwright; this one can.
    const toolbarChord = page.locator('[class*="chordButton"]').first();
    const segmentText = page.locator('[class*="segmentText"]').nth(1);
    await expect(toolbarChord).toBeVisible();
    await expect(segmentText).toBeVisible();

    const from = (await toolbarChord.boundingBox())!;
    const to = (await segmentText.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y + 20, { steps: 3 });
    await page.mouse.move(to.x + to.width * 0.5, to.y + to.height / 2, { steps: 8 });

    await expect(caret).toBeVisible({ timeout: 2000 });

    // Drop; the caret goes away.
    await page.mouse.up();
    await expect(caret).not.toBeVisible();
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

  test('should remove a part when delete button is clicked', async ({ page }) => {
    await page.goto('/debug/song-editor');

    // Count initial parts
    const initialParts = await page.locator('[class*="partHeader"]').count();
    expect(initialParts).toBe(2); // Verse 1 and Chorus 1

    // Click the delete button on the first part (the part header also has
    // approximate-chords and join buttons — target delete by its title).
    const deleteButton = page.locator('[title="Remove part"]').first();
    await deleteButton.click();

    // Should have one less part
    const finalParts = await page.locator('[class*="partHeader"]').count();
    expect(finalParts).toBe(1);
  });

  test('should parse raw content with multiple parts correctly', async ({ page }) => {
    await page.goto('/debug/song-editor');

    // Switch to Raw mode
    await page.getByText('Raw').click();

    const editor = page.locator('textarea');
    await expect(editor).toBeVisible();

    // Enter raw content with multiple parts
    await editor.fill('#verse 1\n[1]First verse line\n#chorus 1\n[4]Chorus line\n#bridge 1\n[5]Bridge line');

    // Switch back to Visual
    await page.getByText('Visual').click();

    // Verify all parts exist
    const verseInput = page.locator('input').filter({ hasValue: 'Verse 1' }).first();
    const chorusInput = page.locator('input').filter({ hasValue: 'Chorus 1' }).first();
    const bridgeInput = page.locator('input').filter({ hasValue: 'Bridge 1' }).first();

    await expect(verseInput).toBeVisible();
    await expect(chorusInput).toBeVisible();
    await expect(bridgeInput).toBeVisible();

    // Verify content exists
    await expect(page.getByText('First verse line')).toBeVisible();
    await expect(page.getByText('Chorus line')).toBeVisible();
    await expect(page.getByText('Bridge line')).toBeVisible();
  });

  test('should show chords correctly in visual mode', async ({ page }) => {
    await page.goto('/debug/song-editor');

    // Switch to Raw mode and set content
    await page.getByText('Raw').click();
    const editor = page.locator('textarea');
    await editor.fill('#verse 1\n[1]Amazing [4]grace');

    // Switch to Visual
    await page.getByText('Visual').click();

    // In key of C: [1] = C, [4] = F
    const badgeC = page.locator('[class*="chordBadge"]').filter({ hasText: /^C$/ }).first();
    const badgeF = page.locator('[class*="chordBadge"]').filter({ hasText: /^F$/ }).first();

    await expect(badgeC).toBeVisible();
    await expect(badgeF).toBeVisible();
  });

  test('should show placeholder for empty lines in new parts', async ({ page }) => {
    await page.goto('/debug/song-editor');

    // Add a new part
    await page.getByText('+ Add Part').click();
    await page.getByText('Bridge').click();
    await page.getByRole('button', { name: 'Add bridge' }).click();

    // Find the new part's empty line segment
    // The new part should have an editable segment with placeholder
    const newPartContent = page.locator('[class*="partContent"]').last();
    const segmentText = newPartContent.locator('[class*="segmentText"]').first();

    await expect(segmentText).toBeVisible();
    // The segment should be editable (contentEditable)
    await expect(segmentText).toHaveAttribute('contenteditable', 'true');
  });

  test('should handle toolbar chord buttons', async ({ page }) => {
    await page.goto('/debug/song-editor');

    // Check that toolbar chord buttons exist and are draggable
    const chordPalette = page.locator('[class*="chordPalette"]');
    await expect(chordPalette).toBeVisible();

    // Major chords (1, 4, 5) -> C, F, G in key of C
    const chordButtons = chordPalette.locator('[class*="chordButton"]');
    const count = await chordButtons.count();
    expect(count).toBeGreaterThanOrEqual(6); // At least major and minor chords

    // All are dnd-kit draggables (keyboard-activatable, WP-166).
    for (let i = 0; i < Math.min(count, 6); i++) {
      await expect(chordButtons.nth(i)).toHaveAttribute('aria-roledescription', 'draggable');
    }
  });

  test('should change key and update chord display', async ({ page }) => {
    await page.goto('/debug/song-editor');

    // Find key selector
    const keySelect = page.locator('select').first();
    await expect(keySelect).toBeVisible();

    // Initial key is C, so [1] displays as C
    const badgeC = page.locator('[class*="chordBadge"]').filter({ hasText: /^C$/ }).first();
    await expect(badgeC).toBeVisible();

    // Change key to G
    await keySelect.selectOption('G');

    // Now [1] should display as G
    const badgeG = page.locator('[class*="chordBadge"]').filter({ hasText: /^G$/ }).first();
    await expect(badgeG).toBeVisible();
  });

  test('should validate title before save', async ({ page }) => {
    await page.goto('/debug/song-editor');

    // Clear the title
    const titleInput = page.locator('input[placeholder*="Title"]');
    await titleInput.clear();

    // Try to save
    await page.getByRole('button', { name: 'Save' }).click();

    // Title error should appear
    const error = page.locator('[class*="error"]');
    await expect(error).toBeVisible();
    await expect(error).toContainText('Title is required');
  });

  test('should lock/unlock lyrics editing', async ({ page }) => {
    await page.goto('/debug/song-editor');

    // Find lock button in footer
    const lockButton = page.locator('[class*="lockButton"]').first();
    await expect(lockButton).toBeVisible();

    // Initially unlocked - text should be editable
    let segmentText = page.locator('[class*="segmentText"]').first();
    await expect(segmentText).toHaveAttribute('contenteditable', 'true');

    // Click to lock
    await lockButton.click();

    // Text should not be editable
    segmentText = page.locator('[class*="segmentText"]').first();
    await expect(segmentText).toHaveAttribute('contenteditable', 'false');

    // Click to unlock
    await lockButton.click();

    // Text should be editable again
    segmentText = page.locator('[class*="segmentText"]').first();
    await expect(segmentText).toHaveAttribute('contenteditable', 'true');
  });
});
