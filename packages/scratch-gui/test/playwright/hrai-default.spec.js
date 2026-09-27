// @ts-check
const {test, expect} = require('@playwright/test');

test('the default editor renders the HRAI assistant', async ({page}) => {
    const pageErrors = [];
    page.on('pageerror', pageErrors.push.bind(pageErrors));

    await page.goto('index.html');

    await expect(page.getByRole('img', {name: 'HRAI'})).toBeVisible();
    await expect(page.getByRole('textbox', {name: 'Message for HRAI'})).toBeVisible();
    expect(pageErrors, 'uncaught exceptions during HRAI editor load').toEqual([]);
});
