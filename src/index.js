#!/usr/bin/env node
// require modules
const puppeteer = require('puppeteer');
const fs = require('fs');

const settings = JSON.parse(fs.readFileSync(__dirname + '/../settings.json'));

// start fetching folders
(async () => {
    var results = {};
    const browser = await puppeteer.launch({
        headless: false,
        // slowMo: 250 // slow down by 250ms 
    });
    const page = await browser.newPage();
    await page.goto('https://quizlet.com/latest');
    // login if necessary
    if (page.url() !== 'https://quizlet.com/latest') {
        const signInButton = await page.$(".SiteHeader-signIn .SiteHeader-signInBtn");
        const [] = await Promise.all([
            page.waitForSelector("form.LoginPromptModal-form input[name='username']"),
            page.waitForSelector("form.LoginPromptModal-form input[name='password']"),
            page.waitForSelector("form.LoginPromptModal-form button[type='submit']"),
            signInButton.tap()
        ]);
        await page.type(".LoginPromptModal-form input[name='username']", settings.username);
        await page.type(".LoginPromptModal-form input[name='password']", settings.password);
        const [] = await Promise.all([
            page.waitForNavigation(),
            page.click(".LoginPromptModal-form button[type='submit']")
        ]);
    }
    // go to folder page
    await page.goto('https://quizlet.com/' + settings.username + '/folders');
    // find all folders
    const folders = await page.$$(".ProfileFoldersPage .DashboardListItem");
    var promisses = [];
    folders.forEach(folderLink => {
        promises.push(handleFolder(page, folderLink));
    });
    await Promise.all(promisses);
    // output results
    console.log(results);

    await browser.close();
})();

async function handleFolder(page, folderLink) {
    // go to folder page
    const folderLinkHeader = await folderLink.$("header.FolderPreview-cardHeader");
    const folderName = await (await folderLinkHeader.getProperty('textContent')).jsonValue();
    const [] = await Promise.all([
        page.waitForNavigation(),
        folderLink.click("a")
    ]);
    results[folderName] = {};
    // find all sets in this folder
    const sets = await page.$$(".FolderPageSetsView .DashboardListItem");
    var promisses = [];
    sets.forEach(setLink => {
        promises.push(handleSet(page, setLink));
    });
    await Promise.all(promisses);
};


async function handleSet(page, setLink) {
    const setLinkHeader = await folderLink.$("header.SetPreview-cardHeader");
    const setName = await (await setLinkHeader.getProperty('textContent')).jsonValue();

    // got to set page
    const [] = await Promise.all([
        page.waitForNavigation(),
        setLink.click("a")
    ]);
    const exportButtonIcon = await page.$("UIIcon--export");
    await exportButtonIcon.click();
    const exportModal = await page.waitForSelector(".SetPageExportModal-content");
    const exportTextarea = await exportModal.$("textarea.UITextarea-textarea");
    const text = await (await exportTextarea.getProperty('textContent')).jsonValue();
    results[folderName][setName] = text;
}
