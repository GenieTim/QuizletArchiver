#!/usr/bin/env node
// require modules
const puppeteer = require('puppeteer');
const fs = require('fs');

const settings = JSON.parse(fs.readFileSync('../settings.json'));

// start fetching folders
(async () => {
    var results = {};
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto('https://quizlet.com/latest');
    // login if necessary
    if (page.url() !== 'https://quizlet.com/latest') {
        const signInButton = await page.$(".SiteHeader-signIn");
        await signInButton.tap();
        page.type("input[name='username']", settings.username);
        page.type("input[name='password']", settings.password);
        const [response] = await Promise.all([
            page.waitForNavigation(),
            page.click("button[type='submit']")
        ]);
    }
    // go to folder page
    await page.goto('https://quizlet.com/' + settings.username + '/folders');
    // find all folders
    const folders = await page.$$(".ProfileFoldersPage .DashboardListItem");
    folders.forEach(folderLink => {
        // go to folder page
        const folderLinkHeader = folderLink.$("header.FolderPreview-cardHeader");
        const folderName = await(await folderLinkHeader.getProperty('textContent')).jsonValue();
        const [response] = await Promise.all([
            page.waitForNavigation(),
            folderLink.click("a")
        ]);
        results[folderName] = {};
        // find all sets in this folder
        const sets = await page.$$(".FolderPageSetsView .DashboardListItem");
        sets.forEach(setLink => {
            const setLinkHeader = folderLink.$("header.SetPreview-cardHeader");
            const setName = await(await setLinkHeader.getProperty('textContent')).jsonValue();

            // got to set page
            const [response] = await Promise.all([
                page.waitForNavigation(),
                setLink.click("a")
            ]);
            const exportButtonIcon = await page.$("UIIcon--export");
            await exportButtonIcon.click();
            const exportModal = await page.waitForSelector(".SetPageExportModal-content");
            const exportTextarea = await exportModal.$("textarea.UITextarea-textarea");
            const text = await(await exportTextarea.getProperty('textContent')).jsonValue();
            results[folderName][setName] = text;
        });
    });
    // output results
    console.log(results);

    await browser.close();
})();
