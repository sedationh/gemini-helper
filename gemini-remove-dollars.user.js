// ==UserScript==
// @name         Gemini Remove Dollar Signs from Copy
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Removes $ characters from text copied from Gemini
// @match        https://gemini.google.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const TAG = '[GeminiStripDollars]';

    console.log(TAG, 'Script loaded');

    function stripDollars(text) {
        const result = text
            .replace(/\$/g, '')
            .replace(/\\([a-zA-Z]+)/g, '$1');
        if (result !== text) {
            console.log(TAG, 'Stripped from text:', JSON.stringify(text.slice(0, 200)), '->', JSON.stringify(result.slice(0, 200)));
        }
        return result;
    }

    // 1) Intercept copy event in capture phase (fires before Gemini's handler)
    document.addEventListener('copy', function (e) {
        const selection = window.getSelection().toString();
        console.log(TAG, 'Copy event fired (capture phase), selection:', JSON.stringify((selection || '').slice(0, 200)));
        if (selection && selection.includes('$')) {
            console.log(TAG, 'Found $ in selection, overriding clipboard');
            e.clipboardData.setData('text/plain', stripDollars(selection));
            e.preventDefault();
            console.log(TAG, 'Clipboard overridden successfully');
        } else {
            console.log(TAG, 'No $ in selection, passing through');
        }
    }, true);

    // 2) Override Clipboard API (Gemini may use navigator.clipboard.writeText)
    const origWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = function (text) {
        console.log(TAG, 'clipboard.writeText called, text:', JSON.stringify((text || '').slice(0, 200)));
        return origWriteText(stripDollars(text));
    };

    const origWrite = navigator.clipboard.write.bind(navigator.clipboard);
    navigator.clipboard.write = function (data) {
        console.log(TAG, 'clipboard.write called, items:', data.length);
        const cleaned = data.map(function (item) {
            const types = item.types;
            console.log(TAG, 'ClipboardItem types:', types);
            const blobs = {};
            const promises = types.map(function (type) {
                return item.getType(type).then(function (blob) {
                    if (type === 'text/plain' || type === 'text/html') {
                        return blob.text().then(function (text) {
                            console.log(TAG, 'clipboard.write blob type:', type, 'text:', JSON.stringify(text.slice(0, 200)));
                            blobs[type] = new Blob([stripDollars(text)], { type: type });
                        });
                    }
                    blobs[type] = blob;
                });
            });
            return Promise.all(promises).then(function () {
                return new ClipboardItem(blobs);
            });
        });
        return Promise.all(cleaned).then(function (items) {
            console.log(TAG, 'clipboard.write passing cleaned items to original');
            return origWrite(items);
        });
    };

    console.log(TAG, 'All hooks installed');
})();
