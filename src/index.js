#!/usr/bin/env node
// require modules
const puppeteer = require('puppeteer');
const fs = require('fs');
const sanitizeFilename = require("sanitize-filename");
const cloudscraper = require('cloudscraper');
// global variables. yes, bad, I know. Ich einfach unverbesserlich.
const settings = JSON.parse(fs.readFileSync(__dirname + '/../settings.json'));
var results = {};
var debug = true;
let browser;

// start fetching folders
(async () => {
    browser = await puppeteer.launch({
        headless: !debug,
        // slowMo: 250 // slow down by 250ms 
    });
    const page = await browser.newPage();
    if (debug) {
        page.setViewport({ width: 0, height: 0 });
    }
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
    const folderSelector = ".ProfileFoldersPage .DashboardListItem";
    // go to folder page
    await Promise.all([
        page.waitForNavigation(),
        page.waitForSelector(folderSelector),
        page.goto('https://quizlet.com/' + settings.username + '/folders')
    ]);

    // find all folders
    // resp. their properties
    const folderNames = await page.$$eval(folderSelector + " header.FolderPreview-cardHeader", (headers) => headers.map(header => header.innerText));
    const folderLinks = await page.$$eval(folderSelector + " .UILinkBox-link a", (links) => links.map(link => link.href));

    console.log("Found " + folderLinks.length + " folders...");

    // process all folders
    await asyncForEach(folderLinks, async (folderLink, index) => {
        try {
            await handleFolder(page, folderLink, folderNames[index]);
        } catch (error) {
            console.log("Failed to handle set: '" + folderNames[index] + "'. Waiting a few seconds...", error);
            await sleep(3751);
        }
    });
    // output results
    console.log(JSON.stringify(results));

    await browser.close();
})();

async function handleFolder(page, folderLink, folderName) {
    const setSelector = ".FolderPageSetsView .UISetCard";
    // go to folder page
    const [] = await Promise.all([
        page.waitForNavigation(),
        page.waitForSelector(setSelector),
        page.goto(folderLink)
    ]);
    results[folderName] = {};
    // find all sets in this folder
    // resp. their properties
    const setNames = await page.$$eval(setSelector + " .UIBaseCardHeader h4.UIHeading", (headers) => headers.map(header => header.innerText));
    const setLinks = await page.$$eval(setSelector + " .UILinkBox-link a", (links) => links.map(link => link.href));

    console.log("Found " + setNames.length + " sets in Folder '" + folderName + "'...");
    // process all sets
    await asyncForEach(setLinks, async (setLink, index) => {
        try {
            await handleSet(page, setLink, folderName, setNames[index]);
        } catch (e) {
            console.error("Failed to handle set: '" + setNames[index] + "'. Waiting a few seconds...", e);
            await sleep(1996);
        }
    });
};

async function handleSet(page, setLink, folderName, setName) {
    await handleSetExport(page, setLink, folderName, setName);
    await handleSetPrintout(page, setLink, folderName, setName);
}

async function handleSetExport(page, setLink, folderName, setName) {
    // got to set page
    const setOptionsSelector = ".SetPage-menuOption .UIIcon--more";
    const exportButtonIconSelector = ".UIIcon--export";
    const [] = await Promise.all([
        page.waitForNavigation(),
        page.waitForSelector(setOptionsSelector),
        page.goto(setLink)
    ]);
    const [] = await Promise.all([
        page.waitForSelector(exportButtonIconSelector),
        page.hover(setOptionsSelector)
    ]);
    const exportModalSelector = ".SetPageExportModal-content";
    const [] = await Promise.all([
        page.waitForSelector(exportModalSelector),
        page.click(exportButtonIconSelector)
    ]);
    const exportTextarea = await page.$(exportModalSelector + " textarea.UITextarea-textarea");
    const textValue = await exportTextarea.getProperty('value');
    const text = await textValue.jsonValue();
    results[folderName][setName] = text;
}

async function handleSetPrintout(page, setLink, folderName, setName) {
    // we also want the printout as we would not have any images otherwise
    const setOptionsSelector = ".SetPage-menuOption .UIIcon--more";
    const printButtonIconSelector = ".UIIcon--print";
    const [] = await Promise.all([
        page.waitForNavigation(),
        page.waitForSelector(setOptionsSelector),
        page.goto(setLink)
    ]);
    const [] = await Promise.all([
        page.waitForSelector(printButtonIconSelector),
        page.hover(setOptionsSelector)
    ]);
    const radioButtonSelector = ".PrintPageOptions-radioWrap input[value='large']";
    const submitButtonSelector = ".PrintPageOptions-openPdfButtonWrapper button"
    const [] = await Promise.all([
        page.waitForNavigation(),
        page.waitForSelector(submitButtonSelector),
        page.waitForSelector(radioButtonSelector),
        page.click(printButtonIconSelector)
    ]);
    await page.click(radioButtonSelector);
    // sleep half a second because of Quizlet's custom form submission taking 
    // setup time
    await sleep(500);
    const [] = await Promise.all([
        new Promise(res => browser.on('targetcreated', res)),
        page.click(submitButtonSelector)
    ]);
    // get pdf URL
    const pages = await browser.pages(); // get all open pages by the browser
    const popup = pages[pages.length - 1]; // the popup should be the last page opened
    const pdfFilepath = __dirname + '/../export/' + sanitizeFilename('quizlet-' + folderName + '-' + setName + '.pdf');

    // catch cloudflare captcha
    cloudscraper.get(popup.url()).on('error', (err) => {
        console.error(err);
    }).pipe(fs.createWriteStream(pdfFilepath));

    await popup.close();
}

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
}
