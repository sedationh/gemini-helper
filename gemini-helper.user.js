// ==UserScript==
// @name         Gemini Helper
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Gemini enhancements migrated from Voyager — includes copy dollar-sign removal, chat width, default model, and timeline
// @match        https://gemini.google.com/*
// @license      MIT
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const TAG = '[GeminiHelper]';
    console.log(TAG, 'Script loaded');

    // ═══════════════════════════════════════════════════════════════
    // Trusted Types policy for safe DOM manipulation
    // ═══════════════════════════════════════════════════════════════
    const ghPolicy = (typeof window.trustedTypes !== 'undefined' && window.trustedTypes.createPolicy)
        ? window.trustedTypes.createPolicy('gemini-helper', {
            createHTML: (s) => s,
        })
        : { createHTML: (s) => s };

    function setStyleContent(styleEl, css) {
        // Style elements need special handling under Trusted Types
        try {
            styleEl.textContent = css;
        } catch {
            // Fallback: use sheet API or trusted innerHTML
            styleEl.innerHTML = ghPolicy.createHTML(css);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Settings (persisted in localStorage)
    // ═══════════════════════════════════════════════════════════════
    const SETTINGS_KEY = 'geminiHelperSettings';
    function loadSettings() {
        try {
            return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
        } catch { return {}; }
    }
    function saveSettings(s) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    }
    function getSetting(key, fallback) {
        const s = loadSettings();
        return s[key] !== undefined ? s[key] : fallback;
    }
    function setSetting(key, value) {
        const s = loadSettings();
        s[key] = value;
        saveSettings(s);
    }

    // ═══════════════════════════════════════════════════════════════
    // 1. Strip Dollar Signs from Copy (LaTeX delimiters only)
    // ═══════════════════════════════════════════════════════════════
    function initStripDollars() {
        function stripLatexDelimiters(text) {
            // Remove $$ ... $$ (display math) — strip the delimiters, keep inner content
            text = text.replace(/\$\$([\s\S]*?)\$\$/g, '$1');
            // Remove $ ... $ (inline math) — strip the delimiters, keep inner content
            text = text.replace(/\$([^$\n]+?)\$/g, '$1');
            // Clean up LaTeX backslash commands like \frac → frac
            text = text.replace(/\\([a-zA-Z]+)/g, '$1');
            return text;
        }

        function maybeStrip(text) {
            if (!getSetting('stripDollarsEnabled', true)) return text;
            return stripLatexDelimiters(text);
        }

        document.addEventListener('copy', function (e) {
            if (!getSetting('stripDollarsEnabled', true)) return;
            const selection = window.getSelection().toString();
            if (selection && selection.includes('$')) {
                e.clipboardData.setData('text/plain', stripLatexDelimiters(selection));
                e.preventDefault();
            }
        }, true);

        const origWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
        navigator.clipboard.writeText = function (text) {
            return origWriteText(maybeStrip(text));
        };

        const origWrite = navigator.clipboard.write.bind(navigator.clipboard);
        navigator.clipboard.write = function (data) {
            const cleaned = data.map(function (item) {
                const types = item.types;
                const blobs = {};
                const promises = types.map(function (type) {
                    return item.getType(type).then(function (blob) {
                        if (type === 'text/plain' || type === 'text/html') {
                            return blob.text().then(function (text) {
                                blobs[type] = new Blob([maybeStrip(text)], { type: type });
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
                return origWrite(items);
            });
        };

        // Floating toggle button for strip-dollars
        function createStripDollarsUI() {
            const enabled = getSetting('stripDollarsEnabled', true);

            const btn = document.createElement('button');
            btn.id = 'gemini-helper-strip-dollars-toggle';
            btn.title = 'Strip LaTeX $ on Copy';
            btn.textContent = '$';
            Object.assign(btn.style, {
                position: 'fixed', bottom: '120px', right: '52px', zIndex: '2147483640',
                width: '36px', height: '36px', borderRadius: '50%', border: 'none',
                background: enabled ? '#1a73e8' : '#5f6368', color: '#fff',
                fontSize: '16px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                transition: 'background 0.2s', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontFamily: 'sans-serif', fontWeight: 'bold',
                textDecoration: enabled ? 'line-through' : 'none',
            });

            btn.addEventListener('click', () => {
                const nowEnabled = !getSetting('stripDollarsEnabled', true);
                setSetting('stripDollarsEnabled', nowEnabled);
                btn.style.background = nowEnabled ? '#1a73e8' : '#5f6368';
                btn.style.textDecoration = nowEnabled ? 'line-through' : 'none';
                btn.title = nowEnabled ? 'Strip LaTeX $ on Copy (ON)' : 'Strip LaTeX $ on Copy (OFF)';
            });

            document.body.appendChild(btn);
        }

        if (document.body) {
            createStripDollarsUI();
        } else {
            document.addEventListener('DOMContentLoaded', createStripDollarsUI);
        }

        console.log(TAG, 'Strip dollars hooks installed (LaTeX-aware)');
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. Chat Width Adjuster
    // ═══════════════════════════════════════════════════════════════
    function initChatWidth() {
        const STYLE_ID = 'gemini-helper-chat-width';
        const DEFAULT_PERCENT = 70;
        const MIN_PERCENT = 30;
        const MAX_PERCENT = 100;

        const userSelectors = [
            '.user-query-bubble-container',
            '.user-query-container',
            'user-query-content',
            'user-query',
            'div[aria-label="User message"]',
            'article[data-author="user"]',
            '[data-message-author-role="user"]',
        ];

        const assistantSelectors = [
            'model-response',
            '.model-response',
            'response-container',
            '.response-container',
            '.presented-response-container',
            '[aria-label="Gemini response"]',
            '[data-message-author-role="assistant"]',
            '[data-message-author-role="model"]',
            'article[data-author="assistant"]',
        ];

        const tableSelectors = [
            'table-block',
            '.table-block',
            'table-block .table-block',
            'table-block .table-content',
            '.table-block.new-table-style',
            '.table-block.has-scrollbar',
            '.table-block .table-content',
        ];

        function clamp(value) {
            return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, Math.round(value)));
        }

        function normalizePercent(value) {
            if (!Number.isFinite(value)) return DEFAULT_PERCENT;
            if (value > MAX_PERCENT) return clamp((value / 1200) * 100);
            return clamp(value);
        }

        function applyWidth(widthPercent) {
            const p = normalizePercent(widthPercent);
            const screenW = screen.availWidth || screen.width || 1920;
            const widthValue = Math.round((p / 100) * screenW) + 'px';

            let style = document.getElementById(STYLE_ID);
            if (!style) {
                style = document.createElement('style');
                style.id = STYLE_ID;
                document.head.appendChild(style);
            }

            const ur = userSelectors.join(',\n    ');
            const ar = assistantSelectors.join(',\n    ');
            const tr = tableSelectors.join(',\n    ');

            setStyleContent(style, `
                .content-wrapper:has(chat-window),
                .main-content:has(chat-window),
                .content-container:has(chat-window),
                .content-container:has(.conversation-container) { max-width: none !important; }

                [role="main"]:has(chat-window),
                [role="main"]:has(.conversation-container) { max-width: none !important; }

                chat-window, .chat-container, chat-window-content,
                .chat-history-scroll-container, .chat-history,
                .conversation-container {
                    max-width: none !important;
                    padding-right: 10px !important;
                    box-sizing: border-box !important;
                }

                main > div:has(user-query),
                main > div:has(model-response),
                main > div:has(.conversation-container) {
                    max-width: none !important;
                    width: 100% !important;
                }

                ${ur} {
                    max-width: ${widthValue} !important;
                    width: min(100%, ${widthValue}) !important;
                    margin-left: auto !important;
                    margin-right: auto !important;
                }

                ${ar} {
                    max-width: ${widthValue} !important;
                    width: min(100%, ${widthValue}) !important;
                    margin-left: auto !important;
                    margin-right: auto !important;
                }

                ${tr} {
                    max-width: ${widthValue} !important;
                    width: min(100%, ${widthValue}) !important;
                    margin-left: auto !important;
                    margin-right: auto !important;
                    box-sizing: border-box !important;
                }

                table-block .table-block,
                .table-block.has-scrollbar,
                .table-block.new-table-style { overflow-x: hidden !important; }

                table-block .table-content,
                .table-block .table-content { width: 100% !important; overflow-x: auto !important; }

                model-response:has(> .deferred-response-indicator),
                .response-container:has(img[src*="sparkle"]),
                main > div:has(img[src*="sparkle"]) {
                    max-width: ${widthValue} !important;
                    width: min(100%, ${widthValue}) !important;
                    margin-left: auto !important;
                    margin-right: auto !important;
                }

                user-query, user-query > *, user-query > * > *,
                model-response, model-response > *, model-response > * > *,
                response-container, response-container > *, response-container > * > * {
                    max-width: ${widthValue} !important;
                }

                .presented-response-container,
                [data-message-author-role] { max-width: ${widthValue} !important; }

                input-container { max-width: none !important; width: 100% !important; }

                input-container .input-area-container,
                input-container input-area-v2 {
                    max-width: ${widthValue} !important;
                    width: min(100%, ${widthValue}) !important;
                    margin-left: auto !important;
                    margin-right: auto !important;
                }

                .user-query-bubble-with-background {
                    max-width: ${widthValue} !important;
                    width: fit-content !important;
                }
            `);
        }

        function removeStyles() {
            const el = document.getElementById(STYLE_ID);
            if (el) el.remove();
        }

        // Create slider UI
        function createWidthUI() {
            const enabled = getSetting('chatWidthEnabled', false);
            const percent = normalizePercent(getSetting('chatWidthPercent', DEFAULT_PERCENT));

            if (enabled) applyWidth(percent);

            // Floating toggle button
            const btn = document.createElement('button');
            btn.id = 'gemini-helper-width-toggle';
            btn.title = 'Chat Width';
            btn.textContent = '↔';
            Object.assign(btn.style, {
                position: 'fixed', bottom: '80px', right: '52px', zIndex: '2147483640',
                width: '36px', height: '36px', borderRadius: '50%', border: 'none',
                background: enabled ? '#1a73e8' : '#5f6368', color: '#fff',
                fontSize: '16px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                transition: 'background 0.2s', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontFamily: 'sans-serif',
            });

            let sliderContainer = null;

            btn.addEventListener('click', () => {
                if (sliderContainer) {
                    sliderContainer.remove();
                    sliderContainer = null;
                    return;
                }
                sliderContainer = document.createElement('div');
                Object.assign(sliderContainer.style, {
                    position: 'fixed', bottom: '120px', right: '52px', zIndex: '2147483641',
                    background: '#fff', borderRadius: '12px', padding: '16px',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.15)', width: '220px',
                    fontFamily: 'Google Sans, Roboto, sans-serif',
                });

                // Dark mode detection
                const isDark = document.querySelector('.theme-host.dark-theme') ||
                    window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (isDark) {
                    Object.assign(sliderContainer.style, {
                        background: '#1e1e2e', color: '#e2e8f0',
                    });
                }

                const label = document.createElement('div');
                label.style.cssText = 'font-size:13px;font-weight:500;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;';

                const labelText = document.createElement('span');
                labelText.textContent = 'Chat Width';

                const toggle = document.createElement('input');
                toggle.type = 'checkbox';
                toggle.checked = getSetting('chatWidthEnabled', false);
                toggle.style.cssText = 'cursor:pointer;';
                toggle.addEventListener('change', () => {
                    setSetting('chatWidthEnabled', toggle.checked);
                    btn.style.background = toggle.checked ? '#1a73e8' : '#5f6368';
                    if (toggle.checked) {
                        applyWidth(parseInt(slider.value));
                    } else {
                        removeStyles();
                    }
                });

                label.appendChild(labelText);
                label.appendChild(toggle);

                const valDisplay = document.createElement('div');
                valDisplay.style.cssText = 'font-size:12px;color:#888;text-align:center;margin-bottom:4px;';
                const cur = getSetting('chatWidthPercent', DEFAULT_PERCENT);
                valDisplay.textContent = cur + '%';

                const slider = document.createElement('input');
                slider.type = 'range';
                slider.min = String(MIN_PERCENT);
                slider.max = String(MAX_PERCENT);
                slider.value = String(cur);
                slider.style.cssText = 'width:100%;cursor:pointer;';
                slider.addEventListener('input', () => {
                    valDisplay.textContent = slider.value + '%';
                    if (getSetting('chatWidthEnabled', false)) {
                        applyWidth(parseInt(slider.value));
                    }
                });
                slider.addEventListener('change', () => {
                    setSetting('chatWidthPercent', parseInt(slider.value));
                });

                sliderContainer.appendChild(label);
                sliderContainer.appendChild(valDisplay);
                sliderContainer.appendChild(slider);

                // Close on outside click
                const closeHandler = (e) => {
                    if (sliderContainer && !sliderContainer.contains(e.target) && e.target !== btn) {
                        sliderContainer.remove();
                        sliderContainer = null;
                        document.removeEventListener('pointerdown', closeHandler);
                    }
                };
                setTimeout(() => document.addEventListener('pointerdown', closeHandler), 0);

                document.body.appendChild(sliderContainer);
            });

            document.body.appendChild(btn);

            // Re-apply on DOM changes
            let debounce = null;
            const observer = new MutationObserver(() => {
                if (debounce) clearTimeout(debounce);
                debounce = setTimeout(() => {
                    if (getSetting('chatWidthEnabled', false)) {
                        applyWidth(getSetting('chatWidthPercent', DEFAULT_PERCENT));
                    }
                }, 200);
            });
            const main = document.querySelector('main');
            if (main) observer.observe(main, { childList: true, subtree: true });
        }

        if (document.body) {
            createWidthUI();
        } else {
            document.addEventListener('DOMContentLoaded', createWidthUI);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. Default Model Auto-Selector
    // ═══════════════════════════════════════════════════════════════
    function initDefaultModel() {
        const MODE_ITEM_SELECTOR = '[role="menuitemradio"], [role="menuitem"]';
        const NON_MODEL_MENU_EXCLUSION = '.mat-mdc-menu-panel[role="menu"]:not(.desktop-settings-menu)';
        const FAST_MODEL_IDS = new Set(['56fdd199312815e2']);
        const FAST_MODEL_NAMES = ['flash', '2.0 flash', 'gemini 2.0 flash', 'fast'];
        const CHAT_INPUT_SELECTORS = [
            'main rich-textarea [contenteditable="true"]',
            'rich-textarea [contenteditable="true"]',
            'main div[contenteditable="true"][role="textbox"]',
            'div[contenteditable="true"][role="textbox"]',
            'main .input-area textarea',
            '.input-area textarea',
            'main [contenteditable="true"]',
            'main textarea',
        ];

        const STAR_PATH = 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';
        function createStarSVG(filled) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', STAR_PATH);
            if (filled) {
                path.setAttribute('fill', 'currentColor');
            } else {
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', 'currentColor');
                path.setAttribute('stroke-width', '1.5');
            }
            svg.appendChild(path);
            return svg;
        }

        let currentDefault = null; // { id, name } or null
        let isLocked = false;
        let checkTimer = null;
        let autoSelectSessionId = null;
        let consecutiveFailures = 0;
        let lastCheckedPath = null;
        let originalPushState = null;
        let originalReplaceState = null;

        // Inject star button CSS
        const starStyle = document.createElement('style');
        setStyleContent(starStyle, `
            .gh-default-star-btn {
                background: transparent; border: none; cursor: pointer; padding: 2px;
                width: 20px; height: 20px; border-radius: 50%; color: #5f6368;
                position: relative; margin-left: 6px; display: flex;
                align-items: center; justify-content: center; z-index: 100;
                pointer-events: auto; opacity: 0;
                transition: opacity 0.2s, background-color 0.2s, color 0.2s;
            }
            [role='menuitemradio']:hover .gh-default-star-btn,
            [role='menuitem']:hover .gh-default-star-btn,
            .gh-default-star-btn.is-default { opacity: 1; }
            .gh-default-star-btn:hover { background-color: rgba(60,64,67,0.08); }
            .gh-default-star-btn.is-default { color: #fbbc04; }
            .gh-default-star-btn svg { width: 14px; height: 14px; pointer-events: none; }
            [role='menuitemradio'], [role='menuitem'] { position: relative; }
        `);
        document.head.appendChild(starStyle);

        function loadDefault() {
            try {
                const raw = localStorage.getItem('geminiHelperDefaultModel');
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                if (typeof parsed === 'string') return { id: null, name: parsed };
                if (parsed && parsed.name) return parsed;
            } catch {}
            return null;
        }

        function saveDefault(model) {
            if (model) {
                localStorage.setItem('geminiHelperDefaultModel', JSON.stringify(model));
            } else {
                localStorage.removeItem('geminiHelperDefaultModel');
            }
        }

        function getModelName(item) {
            const el = item.querySelector('.mode-title, .gds-title-m, .gds-label-l');
            return el ? el.textContent.trim() : '';
        }

        function getModelId(item) {
            const raw = item.getAttribute('data-mode-id') || item.dataset.modeId;
            if (raw && raw.trim()) return raw.trim();
            const jslog = item.getAttribute('jslog');
            if (jslog) {
                const ids = jslog.match(/[a-f0-9]{16}/gi);
                if (ids && ids.length) return ids[ids.length - 1].trim();
            }
            return null;
        }

        function isDefault(item, modelName) {
            if (!currentDefault) return false;
            if (currentDefault.id) {
                const id = getModelId(item);
                return id === currentDefault.id;
            }
            return currentDefault.name === modelName;
        }

        function updateStarState(item, modelName) {
            const btn = item.querySelector('.gh-default-star-btn');
            if (!btn) return;
            const def = isDefault(item, modelName);
            btn.classList.toggle('is-default', def);
            btn.replaceChildren(createStarSVG(def));
            btn.title = def ? 'Cancel default model' : 'Set as default model';
        }

        function showToast(message) {
            const toast = document.createElement('div');
            Object.assign(toast.style, {
                position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
                background: '#323232', color: 'white', padding: '12px 24px', borderRadius: '4px',
                fontSize: '14px', zIndex: '10000', boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                transition: 'opacity 0.3s',
            });
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        function getMenuPanel() {
            return document.querySelector('.mat-mdc-menu-panel.gds-mode-switch-menu[role="menu"]') ||
                document.querySelector('mat-action-list.gds-mode-switch-menu-list') ||
                document.querySelector(NON_MODEL_MENU_EXCLUSION);
        }

        async function waitForMenuPanel(timeout) {
            const start = Date.now();
            while (Date.now() - start < timeout) {
                const panel = getMenuPanel();
                if (panel && panel.isConnected) return panel;
                await new Promise(r => setTimeout(r, 50));
            }
            return null;
        }

        function injectStarButtons(menuPanel) {
            const items = menuPanel.querySelectorAll(MODE_ITEM_SELECTOR);
            if (!items.length) return false;

            const isModelMenu = menuPanel.querySelector('[data-mode-id]') ||
                menuPanel.querySelector('.mode-title') ||
                menuPanel.querySelector('.title-and-description');
            if (!isModelMenu) return false;

            items.forEach(item => {
                const modelName = getModelName(item);
                if (!modelName) return;

                if (item.querySelector('.gh-default-star-btn')) {
                    updateStarState(item, modelName);
                    return;
                }

                const btn = document.createElement('button');
                btn.className = 'gh-default-star-btn';
                btn.appendChild(createStarSVG(false));
                btn.title = 'Set as default model';

                btn.addEventListener('mousedown', e => e.stopPropagation());
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    e.preventDefault();

                    const isCurrentlyDefault = isDefault(item, modelName);
                    const modelId = getModelId(item);

                    if (isCurrentlyDefault) {
                        currentDefault = null;
                        saveDefault(null);
                        showToast('Default model cleared');
                    } else {
                        currentDefault = { id: modelId, name: modelName };
                        saveDefault(currentDefault);
                        showToast('Default model set to: ' + modelName);
                    }

                    // Update all buttons
                    injectStarButtons(menuPanel);
                });

                const titleContainer = item.querySelector('.title-and-description');
                if (titleContainer) {
                    const titleEl = titleContainer.querySelector('.mode-title, .gds-title-m, .gds-label-l');
                    if (titleEl) {
                        let wrapper = titleContainer.querySelector('.gh-title-wrapper');
                        if (!wrapper && titleEl.parentElement && titleEl.parentElement.classList.contains('gh-title-wrapper')) {
                            wrapper = titleEl.parentElement;
                        }
                        if (!wrapper) {
                            wrapper = document.createElement('div');
                            wrapper.className = 'gh-title-wrapper';
                            wrapper.style.cssText = 'display:flex;align-items:center;width:100%;';
                            if (titleEl.parentElement) {
                                titleEl.parentElement.insertBefore(wrapper, titleEl);
                            } else {
                                titleContainer.appendChild(wrapper);
                            }
                            wrapper.appendChild(titleEl);
                        }
                        wrapper.appendChild(btn);
                    } else {
                        titleContainer.appendChild(btn);
                    }
                } else {
                    item.appendChild(btn);
                }

                updateStarState(item, modelName);
            });

            return true;
        }

        function isNewConversation() {
            const path = window.location.pathname;
            return /^\/(u\/\d+\/)?(app\/?|gem\/.*)$/.test(path);
        }

        function isFastModel(model) {
            if (model.id && FAST_MODEL_IDS.has(model.id)) return true;
            const name = model.name.toLowerCase().trim();
            return FAST_MODEL_NAMES.some(f => name === f || name.includes(f));
        }

        function findChatInput() {
            for (const sel of CHAT_INPUT_SELECTORS) {
                const els = document.querySelectorAll(sel);
                for (const el of els) {
                    if (!el.isConnected) continue;
                    if (el.tagName === 'TEXTAREA' && el.disabled) continue;
                    return el;
                }
            }
            return null;
        }

        async function tryLockToModel(target) {
            const normalize = s => s.toLowerCase().trim();
            const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const targetName = normalize(target.name);
            const targetWord = new RegExp('(^|\\b)' + escape(targetName) + '(\\b|$)', 'i');

            const selectorBtn = document.querySelector('.input-area-switch-label') ||
                document.querySelector('[data-test-id="model-selector"]') ||
                document.querySelector('button[aria-haspopup="menu"].mat-mdc-menu-trigger');
            if (!selectorBtn) return;

            const currentText = normalize(selectorBtn.textContent || '');
            if (targetWord.test(currentText) || currentText === targetName) {
                if (checkTimer) { clearInterval(checkTimer); checkTimer = null; }
                return;
            }

            if (isLocked) return;
            isLocked = true;

            try {
                selectorBtn.click();
                const menuPanel = await waitForMenuPanel(1500);
                if (!menuPanel) return;

                const items = menuPanel.querySelectorAll(MODE_ITEM_SELECTOR);
                let found = false;
                let switched = false;

                // Try by ID first
                if (target.id) {
                    const item = Array.from(items).find(el => getModelId(el) === target.id);
                    if (item) {
                        const selected = item.getAttribute('aria-checked') === 'true' || item.classList.contains('is-selected');
                        if (!selected) { item.click(); switched = true; }
                        else document.body.click();
                        found = true;
                    }
                }

                // Try by name
                if (!found) {
                    for (const item of items) {
                        if (normalize(getModelName(item)) === targetName) {
                            const selected = item.getAttribute('aria-checked') === 'true' || item.classList.contains('is-selected');
                            if (!selected) { item.click(); switched = true; }
                            else document.body.click();
                            found = true;
                            break;
                        }
                    }
                }

                // Fallback: whole-word match on full text
                if (!found) {
                    for (const item of items) {
                        if (targetWord.test(normalize(item.textContent || ''))) {
                            const selected = item.getAttribute('aria-checked') === 'true' || item.classList.contains('is-selected');
                            if (!selected) { item.click(); switched = true; }
                            else document.body.click();
                            found = true;
                            break;
                        }
                    }
                }

                if (found && checkTimer) {
                    clearInterval(checkTimer);
                    checkTimer = null;
                    consecutiveFailures = 0;
                }

                if (switched) {
                    setTimeout(() => {
                        const input = findChatInput();
                        if (input) input.focus({ preventScroll: true });
                    }, 120);
                }

                if (!found) {
                    document.body.click();
                    consecutiveFailures++;
                    if (consecutiveFailures >= 3 && checkTimer) {
                        clearInterval(checkTimer);
                        checkTimer = null;
                    }
                }
            } catch (e) {
                console.error(TAG, 'Auto lock failed:', e);
            } finally {
                isLocked = false;
            }
        }

        function checkAndLockModel() {
            if (!isNewConversation()) return;
            lastCheckedPath = window.location.pathname;

            currentDefault = loadDefault();
            if (!currentDefault) return;
            if (isFastModel(currentDefault)) return;

            const sessionId = window.location.pathname + '-' + Date.now();
            autoSelectSessionId = sessionId;
            consecutiveFailures = 0;

            let attempts = 0;
            if (checkTimer) clearInterval(checkTimer);
            checkTimer = setInterval(() => {
                if (autoSelectSessionId !== sessionId) { clearInterval(checkTimer); checkTimer = null; return; }
                if (++attempts > 20) { clearInterval(checkTimer); checkTimer = null; return; }
                tryLockToModel(currentDefault);
            }, 1000);
        }

        async function checkAndLockWithDelay() {
            await new Promise(r => setTimeout(r, 150));
            checkAndLockModel();
        }

        // Watch for menu panels being added to the DOM -> inject star buttons
        currentDefault = loadDefault();

        const pendingPanels = new WeakSet();
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (!(node instanceof HTMLElement)) continue;
                    const panel = node.matches('.mat-mdc-menu-panel.gds-mode-switch-menu[role="menu"]') ? node :
                        node.matches('mat-action-list.gds-mode-switch-menu-list') ? node :
                        node.matches(NON_MODEL_MENU_EXCLUSION) ? node :
                        node.querySelector('.mat-mdc-menu-panel.gds-mode-switch-menu[role="menu"]') ||
                        node.querySelector('mat-action-list.gds-mode-switch-menu-list') ||
                        node.querySelector(NON_MODEL_MENU_EXCLUSION);
                    if (panel && !pendingPanels.has(panel)) {
                        pendingPanels.add(panel);
                        setTimeout(() => {
                            pendingPanels.delete(panel);
                            injectStarButtons(panel);
                        }, 50);
                    }
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Initial check + SPA navigation hooks
        checkAndLockModel();

        originalPushState = history.pushState;
        originalReplaceState = history.replaceState;
        history.pushState = function () {
            originalPushState.apply(history, arguments);
            checkAndLockWithDelay();
        };
        history.replaceState = function () {
            originalReplaceState.apply(history, arguments);
            checkAndLockWithDelay();
        };
        window.addEventListener('popstate', () => checkAndLockWithDelay());

        // Sidebar click detection
        document.addEventListener('click', e => {
            const link = e.target.closest('a[href*="/app"]') || e.target.closest('a[href*="/gem/"]');
            if (link) checkAndLockWithDelay();
        }, true);

        // Fallback periodic check
        setInterval(() => {
            const path = window.location.pathname;
            if (path !== lastCheckedPath && isNewConversation()) {
                lastCheckedPath = path;
                checkAndLockModel();
            }
        }, 500);

        console.log(TAG, 'Default model hooks installed');
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. Timeline - Visual conversation navigator
    // ═══════════════════════════════════════════════════════════════
    function initTimeline() {
        const USER_TURN_SELECTORS = [
            '.user-query-bubble-with-background',
            '.user-query-bubble-container',
            '.user-query-container',
            'user-query-content .user-query-bubble-with-background',
            'div[aria-label="User message"]',
            'article[data-author="user"]',
            '[data-message-author-role="user"]',
        ];

        const TIMELINE_STYLE_ID = 'gemini-helper-timeline-style';
        let timelineBar = null;
        let trackContent = null;
        let previewPanel = null;
        let scrollContainer = null;
        let convContainer = null;
        let userTurnSelector = '';
        let markers = [];
        let activeTurnId = null;
        let scrollRafId = null;
        let mutationObs = null;
        let intersectionObs = null;
        let activeUpdateTimer = null;
        let visibleTurns = new Set();
        let destroyed = false;
        let isScrollingProgrammatic = false;
        let scrollingTimer = null;

        function injectStyles() {
            if (document.getElementById(TIMELINE_STYLE_ID)) return;
            const style = document.createElement('style');
            style.id = TIMELINE_STYLE_ID;
            setStyleContent(style, `
                :root {
                    --tl-dot-color: #94a3b8;
                    --tl-dot-active: oklch(0.55 0.17 155);
                    --tl-star-color: #f59e0b;
                    --tl-tip-bg: #ffffff;
                    --tl-tip-text: #0f172a;
                    --tl-tip-border: #e2e8f0;
                    --tl-bar-bg: rgba(248,250,252,0.88);
                    --tl-dot-size: 12px;
                    --tl-active-ring: 3px;
                    --tl-track-pad: 16px;
                    --tl-hit: 30px;
                }
                @media (prefers-color-scheme: dark) {
                    :root {
                        --tl-dot-color: #475569;
                        --tl-dot-active: oklch(0.7 0.16 155);
                        --tl-tip-bg: #0b1220;
                        --tl-tip-text: #e2e8f0;
                        --tl-tip-border: #1f2937;
                        --tl-bar-bg: rgba(2,6,23,0.75);
                    }
                }
                .theme-host.dark-theme {
                    --tl-dot-color: #475569;
                    --tl-dot-active: oklch(0.7 0.16 155);
                    --tl-tip-bg: #0b1220;
                    --tl-tip-text: #e2e8f0;
                    --tl-tip-border: #1f2937;
                    --tl-bar-bg: rgba(2,6,23,0.75);
                }
                .theme-host.light-theme {
                    --tl-dot-color: #94a3b8;
                    --tl-dot-active: oklch(0.55 0.17 155);
                    --tl-tip-bg: #ffffff;
                    --tl-tip-text: #0f172a;
                    --tl-tip-border: #e2e8f0;
                    --tl-bar-bg: rgba(248,250,252,0.88);
                }
                .gh-timeline-bar {
                    position: fixed;
                    top: 60px;
                    right: 15px;
                    width: 24px;
                    height: calc(100vh - 100px);
                    z-index: 2147483646;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    border-radius: 12px;
                    background-color: var(--tl-bar-bg);
                    backdrop-filter: blur(6px);
                    -webkit-backdrop-filter: blur(6px);
                    overflow: visible;
                    contain: layout;
                    box-shadow: 0 2px 12px oklch(0 0 0 / 0.06);
                    transition: opacity 0.3s;
                }
                .gh-timeline-track {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    overflow: visible;
                }
                .gh-timeline-track-content {
                    position: relative;
                    width: 100%;
                    height: 100%;
                }
                .gh-tl-dot {
                    position: absolute;
                    left: 50%;
                    top: calc(var(--tl-track-pad) + (100% - 2 * var(--tl-track-pad)) * var(--n, 0));
                    transform: translate(-50%, -50%);
                    width: var(--tl-hit);
                    height: var(--tl-hit);
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    padding: 0;
                }
                .gh-tl-dot::after {
                    content: '';
                    position: absolute;
                    left: 50%;
                    top: 50%;
                    width: var(--tl-dot-size);
                    height: var(--tl-dot-size);
                    transform: translate(-50%, -50%);
                    border-radius: 50%;
                    background-color: var(--tl-dot-color);
                    transition: transform 0.15s ease;
                }
                html.dark .gh-tl-dot:not(.active):not(.starred)::after,
                [data-theme='dark'] .gh-tl-dot:not(.active):not(.starred)::after,
                [data-color-scheme='dark'] .gh-tl-dot:not(.active):not(.starred)::after {
                    background: #000;
                }
                .gh-tl-dot:hover::after { transform: translate(-50%, -50%) scale(1.15); }
                .gh-tl-dot:focus { outline: none; }
                .gh-tl-dot:focus-visible::after { box-shadow: 0 0 6px var(--tl-dot-active); }
                .gh-tl-dot.active::after {
                    box-shadow: 0 0 0 var(--tl-active-ring) var(--tl-dot-active),
                                0 0 14px oklch(0.55 0.17 155 / 0.5);
                }
                .gh-tl-dot.starred::after { background-color: var(--tl-star-color); }

                /* Preview panel - shows all messages on hover */
                .gh-tl-preview {
                    position: fixed;
                    z-index: 2147483647;
                    background: var(--tl-tip-bg);
                    color: var(--tl-tip-text);
                    border: 1px solid var(--tl-tip-border);
                    border-radius: 14px;
                    padding: 8px 0;
                    font-size: 13px;
                    line-height: 18px;
                    box-shadow: 0 12px 36px rgba(2,8,23,0.18), 0 3px 8px rgba(2,8,23,0.08);
                    width: 300px;
                    max-height: calc(100vh - 120px);
                    overflow-y: auto;
                    overflow-x: hidden;
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 160ms cubic-bezier(0.2,0.8,0.2,1);
                    scrollbar-width: thin;
                }
                .gh-tl-preview.visible {
                    opacity: 1;
                    pointer-events: auto;
                }
                .gh-tl-preview-item {
                    display: flex;
                    align-items: flex-start;
                    gap: 8px;
                    padding: 8px 14px;
                    cursor: pointer;
                    transition: background 0.1s;
                    border: none;
                    background: none;
                    width: 100%;
                    text-align: left;
                    color: inherit;
                    font: inherit;
                    line-height: 18px;
                }
                .gh-tl-preview-item:hover {
                    background: var(--tl-tip-border);
                }
                .gh-tl-preview-item.is-active {
                    background: color-mix(in oklch, var(--tl-dot-active) 15%, transparent);
                }
                .gh-tl-preview-num {
                    flex-shrink: 0;
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 11px;
                    font-weight: 600;
                    background: var(--tl-dot-color);
                    color: var(--tl-tip-bg);
                }
                .gh-tl-preview-item.is-active .gh-tl-preview-num {
                    background: var(--tl-dot-active);
                }
                .gh-tl-preview-text {
                    flex: 1;
                    min-width: 0;
                    overflow: hidden;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    word-break: break-word;
                }
                .gh-tl-preview::-webkit-scrollbar { width: 4px; }
                .gh-tl-preview::-webkit-scrollbar-thumb {
                    background: var(--tl-dot-color); border-radius: 2px;
                }
            `);
            document.head.appendChild(style);
        }

        function findElements() {
            let firstTurn = null;
            let matchedSel = '';
            for (const sel of USER_TURN_SELECTORS) {
                const el = document.querySelector(sel);
                if (el) { firstTurn = el; matchedSel = sel; break; }
            }
            if (!firstTurn) {
                convContainer = document.querySelector('main') || document.body;
                userTurnSelector = USER_TURN_SELECTORS.join(',');
            } else {
                const isAngular = /user-query/i.test(matchedSel);
                convContainer = isAngular ? (document.querySelector('main') || document.body) : (firstTurn.parentElement || document.body);
                userTurnSelector = matchedSel;
            }

            // Find scroll container
            let p = firstTurn || convContainer;
            while (p && p !== document.body) {
                const st = getComputedStyle(p);
                if (st.overflowY === 'auto' || st.overflowY === 'scroll') {
                    scrollContainer = p;
                    break;
                }
                p = p.parentElement;
            }
            if (!scrollContainer) {
                scrollContainer = document.scrollingElement || document.documentElement || document.body;
            }
            return true;
        }

        function extractText(el) {
            const clone = el.cloneNode(true);
            clone.querySelectorAll('.visually-hidden, [aria-hidden="true"]').forEach(n => n.remove());
            let text = (clone.textContent || '').trim();
            text = text.replace(/^[\u200B-\u200F\uFEFF]*(?:you said|you wrote|user message|your prompt|you asked|你说|你写道|用户消息|你的提示|你问)[:\s\uff1a]*/i, '');
            return text.slice(0, 120) || '(empty)';
        }

        function ensureTurnId(el, idx) {
            let id = el.getAttribute('data-turn-id');
            if (!id) {
                id = 'turn-' + idx + '-' + hashStr((el.textContent || '').slice(0, 80));
                el.setAttribute('data-turn-id', id);
            }
            return id;
        }

        function hashStr(s) {
            let h = 2166136261 >>> 0;
            for (let i = 0; i < s.length; i++) {
                h ^= s.charCodeAt(i);
                h = Math.imul(h, 16777619);
            }
            return (h >>> 0).toString(36);
        }

        function filterTopLevel(els) {
            return els.filter((el, i) => {
                for (let j = 0; j < els.length; j++) {
                    if (i !== j && els[j].contains(el) && els[j] !== el) return false;
                }
                return true;
            });
        }

        function buildMarkers() {
            if (!convContainer || !trackContent) return;
            const turns = Array.from(convContainer.querySelectorAll(userTurnSelector));
            if (!turns.length) {
                setTimeout(buildMarkers, 300);
                return;
            }

            // Clear existing dots
            trackContent.querySelectorAll('.gh-tl-dot').forEach(n => n.remove());

            const allEls = filterTopLevel(turns);
            if (!allEls.length) return;

            const firstOffset = allEls[0].offsetTop;
            const lastOffset = allEls.length > 1 ? allEls[allEls.length - 1].offsetTop : firstOffset;
            const span = Math.max(lastOffset - firstOffset, 1);

            markers = allEls.map((el, idx) => {
                const n = allEls.length <= 1 ? 0.5 : (el.offsetTop - firstOffset) / span;
                const id = ensureTurnId(el, idx);
                const summary = extractText(el);

                const dot = document.createElement('button');
                dot.className = 'gh-tl-dot';
                dot.setAttribute('role', 'button');
                dot.setAttribute('aria-label', summary);
                dot.dataset.targetTurnId = id;
                dot.dataset.markerIndex = String(idx);
                dot.style.setProperty('--n', String(Math.max(0, Math.min(1, n))));
                trackContent.appendChild(dot);

                return { id, element: el, summary, n, dotElement: dot };
            });

            // Set active to last visible or last marker
            if (!activeTurnId && markers.length) {
                activeTurnId = markers[markers.length - 1].id;
            }
            updateActiveDots();
            setupIntersectionObserver();
        }

        function updateActiveDots() {
            markers.forEach(m => {
                if (m.dotElement) m.dotElement.classList.toggle('active', m.id === activeTurnId);
            });
            updatePreviewActiveItem();
        }

        function smoothScrollTo(element) {
            isScrollingProgrammatic = true;
            if (scrollingTimer) clearTimeout(scrollingTimer);

            const done = () => {
                scrollContainer.removeEventListener('scrollend', onEnd);
                clearTimeout(scrollingTimer);
                // small extra delay so final intersection entries settle
                scrollingTimer = setTimeout(() => { isScrollingProgrammatic = false; }, 200);
            };
            const onEnd = () => done();
            scrollContainer.addEventListener('scrollend', onEnd, { once: true });

            element.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // fallback if scrollend never fires
            scrollingTimer = setTimeout(() => {
                scrollContainer.removeEventListener('scrollend', onEnd);
                isScrollingProgrammatic = false;
            }, 2000);
        }

        // ── Preview Panel ──
        let previewHideTimer = null;

        function buildPreviewPanel() {
            if (!previewPanel) return;
            // Clear existing items
            while (previewPanel.firstChild) previewPanel.removeChild(previewPanel.firstChild);

            markers.forEach((m, idx) => {
                const item = document.createElement('button');
                item.className = 'gh-tl-preview-item';
                if (m.id === activeTurnId) item.classList.add('is-active');
                item.dataset.markerIndex = String(idx);

                const num = document.createElement('span');
                num.className = 'gh-tl-preview-num';
                num.textContent = String(idx + 1);

                const text = document.createElement('span');
                text.className = 'gh-tl-preview-text';
                text.textContent = m.summary;

                item.appendChild(num);
                item.appendChild(text);

                item.addEventListener('click', () => {
                    activeTurnId = m.id;
                    updateActiveDots();
                    smoothScrollTo(m.element);
                });

                previewPanel.appendChild(item);
            });
        }

        function updatePreviewActiveItem() {
            if (!previewPanel) return;
            const items = previewPanel.querySelectorAll('.gh-tl-preview-item');
            items.forEach((item, idx) => {
                const isActive = markers[idx] && markers[idx].id === activeTurnId;
                item.classList.toggle('is-active', isActive);
                if (isActive && previewPanel.classList.contains('visible')) {
                    // Scroll active item into view within the panel
                    const panelRect = previewPanel.getBoundingClientRect();
                    const itemRect = item.getBoundingClientRect();
                    if (itemRect.top < panelRect.top || itemRect.bottom > panelRect.bottom) {
                        item.scrollIntoView({ block: 'nearest' });
                    }
                }
            });
        }

        function showPreviewPanel() {
            if (!previewPanel || !timelineBar) return;
            if (previewHideTimer) { clearTimeout(previewHideTimer); previewHideTimer = null; }
            buildPreviewPanel();

            const barRect = timelineBar.getBoundingClientRect();
            const panelW = 300;
            let left = barRect.left - 8 - panelW;
            if (left < 8) left = barRect.right + 8;
            const top = barRect.top;
            const maxH = window.innerHeight - top - 20;

            previewPanel.style.left = left + 'px';
            previewPanel.style.top = top + 'px';
            previewPanel.style.maxHeight = maxH + 'px';

            requestAnimationFrame(() => previewPanel.classList.add('visible'));

            // Scroll active item into view
            const activeItem = previewPanel.querySelector('.is-active');
            if (activeItem) setTimeout(() => activeItem.scrollIntoView({ block: 'nearest' }), 20);
        }

        function hidePreviewPanel() {
            if (previewHideTimer) clearTimeout(previewHideTimer);
            previewHideTimer = setTimeout(() => {
                if (previewPanel) previewPanel.classList.remove('visible');
                previewHideTimer = null;
            }, 200);
        }

        function cancelHidePreview() {
            if (previewHideTimer) { clearTimeout(previewHideTimer); previewHideTimer = null; }
        }

        function setupIntersectionObserver() {
            if (intersectionObs) intersectionObs.disconnect();
            if (!scrollContainer) return;

            const root = scrollContainer === document.documentElement || scrollContainer === document.body ? null : scrollContainer;
            intersectionObs = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) visibleTurns.add(entry.target);
                    else visibleTurns.delete(entry.target);
                });
                if (isScrollingProgrammatic) return;
                // Debounce to avoid rapid active-dot toggling during scroll
                if (activeUpdateTimer) clearTimeout(activeUpdateTimer);
                activeUpdateTimer = setTimeout(() => {
                    for (const m of markers) {
                        if (visibleTurns.has(m.element)) {
                            if (activeTurnId !== m.id) {
                                activeTurnId = m.id;
                                updateActiveDots();
                            }
                            break;
                        }
                    }
                }, 100);
            }, { root, threshold: 0.1 });

            markers.forEach(m => intersectionObs.observe(m.element));
        }

        function scheduleScrollSync() {
            if (scrollRafId) return;
            scrollRafId = requestAnimationFrame(() => {
                scrollRafId = null;
                // Use intersection observer for active tracking, no extra work needed
            });
        }

        function injectUI() {
            injectStyles();

            timelineBar = document.createElement('div');
            timelineBar.className = 'gh-timeline-bar';

            const track = document.createElement('div');
            track.className = 'gh-timeline-track';

            trackContent = document.createElement('div');
            trackContent.className = 'gh-timeline-track-content';

            track.appendChild(trackContent);
            timelineBar.appendChild(track);

            // Preview panel
            previewPanel = document.createElement('div');
            previewPanel.className = 'gh-tl-preview';
            document.body.appendChild(previewPanel);

            // Event: click to navigate
            timelineBar.addEventListener('click', e => {
                const dot = e.target.closest('.gh-tl-dot');
                if (!dot) return;
                const idx = parseInt(dot.dataset.markerIndex);
                const marker = markers[idx];
                if (marker && marker.element) {
                    activeTurnId = marker.id;
                    updateActiveDots();
                    smoothScrollTo(marker.element);
                }
            });

            // Event: hover shows preview panel
            timelineBar.addEventListener('mouseenter', () => showPreviewPanel());
            timelineBar.addEventListener('mouseleave', () => hidePreviewPanel());
            previewPanel.addEventListener('mouseenter', () => cancelHidePreview());
            previewPanel.addEventListener('mouseleave', () => hidePreviewPanel());

            // Event: scroll passthrough
            timelineBar.addEventListener('wheel', e => {
                e.preventDefault();
                scrollContainer.scrollTop += (e.deltaY || 0);
            }, { passive: false });

            // Scroll tracking
            scrollContainer.addEventListener('scroll', scheduleScrollSync, { passive: true });

            document.body.appendChild(timelineBar);
        }

        function initialize() {
            if (destroyed) return;
            // Clean up previous instance
            document.querySelectorAll('.gh-timeline-bar, .gh-tl-tooltip').forEach(el => el.remove());
            if (mutationObs) { mutationObs.disconnect(); mutationObs = null; }
            if (intersectionObs) { intersectionObs.disconnect(); intersectionObs = null; }
            markers = [];
            activeTurnId = null;
            visibleTurns.clear();

            if (!findElements()) return;
            injectUI();
            buildMarkers();

            // Watch for new messages
            mutationObs = new MutationObserver(() => {
                // Debounced rebuild
                clearTimeout(mutationObs._timer);
                mutationObs._timer = setTimeout(() => {
                    if (!destroyed) buildMarkers();
                }, 300);
            });
            mutationObs.observe(convContainer, { childList: true, subtree: true });
        }

        function isConversationRoute(path) {
            return /^\/(?:u\/\d+\/)?(app|gem)(\/|$)/.test(path || location.pathname);
        }

        function destroy() {
            destroyed = true;
            if (mutationObs) { mutationObs.disconnect(); mutationObs = null; }
            if (intersectionObs) { intersectionObs.disconnect(); intersectionObs = null; }
            document.querySelectorAll('.gh-timeline-bar, .gh-tl-preview').forEach(el => el.remove());
            markers = [];
        }

        // SPA navigation handling
        let currentUrl = location.href;
        let initTimer = null;

        function handleUrlChange() {
            if (location.href === currentUrl) return;
            currentUrl = location.href;

            if (initTimer) { clearTimeout(initTimer); initTimer = null; }

            if (isConversationRoute()) {
                destroyed = false;
                initTimer = setTimeout(initialize, 500);
            } else {
                destroy();
            }
        }

        const origPush = history.pushState;
        const origReplace = history.replaceState;
        history.pushState = function () {
            origPush.apply(history, arguments);
            handleUrlChange();
        };
        history.replaceState = function () {
            origReplace.apply(history, arguments);
            handleUrlChange();
        };
        window.addEventListener('popstate', handleUrlChange);

        // Initial setup
        function setup() {
            if (isConversationRoute()) {
                destroyed = false;
                initialize();
            }
        }

        if (document.body) {
            setup();
        } else {
            const readyObs = new MutationObserver(() => {
                if (document.body) { readyObs.disconnect(); setup(); }
            });
            readyObs.observe(document.documentElement, { childList: true });
        }

        // Periodic fallback
        setInterval(() => {
            if (location.href !== currentUrl) handleUrlChange();
        }, 800);

        window.addEventListener('beforeunload', destroy, { once: true });

        console.log(TAG, 'Timeline installed');
    }

    // ═══════════════════════════════════════════════════════════════
    // Bootstrap - Initialize all features
    // ═══════════════════════════════════════════════════════════════
    initStripDollars();

    function onReady() {
        initChatWidth();
        initDefaultModel();
        initTimeline();
        console.log(TAG, 'All features initialized');
    }

    if (document.body) {
        onReady();
    } else {
        document.addEventListener('DOMContentLoaded', onReady);
    }
})();
