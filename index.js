'use strict';

const editor = new Jodit('#editor', {
  buttons: 'bold,italic,underline,strikethrough,eraser,ul,ol,image,file,copyformat,cut,copy,paste,selectall,hr,table,link,paragraph',
  uploader: {
    insertImageAsBase64URI: true
  }
});
const loadDelay = 500;
/** @type {(endpoint: String) => String} */
const api = endpoint => `https://submedit.r2dev2bb8.repl.co${endpoint}`;

const articleTemplate = `
`.trim();

/**
 * Makeshift state manager
 *
 * @template {T}
 * @type {(value: T) => [() => T, (newValue: T) => void, (cb: (value: T) => void) => void]}
 */
const useState = value => {
  const subscribers = [];
  return [
    function get() { return value; },
    function set(newValue) {
      if (newValue == value) return;
      value = newValue;
      subscribers.forEach(cb => cb(value));
    },
    function subscribe(cb) {
      subscribers.push(cb);
      cb(value);
    }
  ]
};

// State
const [articleName, setArticleName, subArticleName] = useState('');
const [articleHTML, setArticleHTML, subArticleHTML] = useState(articleTemplate);

// Computed State
/** @type {() => String} */
const articleMarkdown = () => toMarkdown(articleHTML());

// View
const elements = {
  articleTitle: document.querySelector('#article-title'),
  uploadButton: document.querySelector('button[name=upload]')
};
subArticleName($name => elements.articleTitle.value = $name);
subArticleHTML($html => editor.setEditorValue($html));

// Update State
const turndownService = new TurndownService();
const toMarkdown = turndownService.turndown.bind(turndownService);

/** @type {() => String} */
const getArticleName = () => new URLSearchParams(window.location.search)
  .get('article')
  ?.replaceAll('_', ' ')
  ?? '';

// FIXME: won't call cb with args
const delayed = (cb, int) => {
  let timeoutId = null;
  return (...args) => {
    if (timeoutId != null) clearTimeout(timeoutId);
    timeoutId = setTimeout(cb, int);
  }
};

/**
 * @template {T}
 * @template {E}
 * @type {(fn: (arg: T) => Promise<E>) => (arg: T) => Promise<E>}
 */
const asyncMemoize = fn => {
  /** @type {Map<T, E>} */
  const cache = new Map();
  return async arg => {
    if (cache.has(arg)) return cache.get(arg);
    const result = await fn(arg);
    cache.set(arg, result);
    return result;
  };
};

/** @type {(rawArticle: String) => String} */
const extractArticleHTML = rawArticle => {
  const container = document.createElement('div');
  container.innerHTML = rawArticle;
  return container.querySelector('.article').innerHTML.trim();
};

/** @type {(articleName: String) => Promise<String>} */
const getArticleContents = asyncMemoize(async articleName => {
  const articleRoute = `../wiki/en/${articleName.replaceAll(' ', '_')}.html`;
  return await fetch(articleRoute)
    .then(r => r.text())
    .then(extractArticleHTML)
    .catch(() => '');
});

/** @type {(html: String) => void} */
const initArticleHTML = html => {
  if (articleHTML().trim() === articleTemplate) setArticleHTML(html);
};

/** @type {(url: String, body: any) => Promise} */
const postJSON = (url, body) => fetch(url, {
  method: 'POST',
  mode: 'cors',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(body)
});

const successPopup = () => Swal.fire(
  'Upload succeeded',
  'We will review your contribution and may accept it.',
  'success'
);

const failurePopup = e => Swal.fire(
  'Upload failed',
  `Error: ${e}`,
  'error'
);

setArticleName(getArticleName());
subArticleName($name => getArticleContents($name).then(initArticleHTML));
editor.events.on('change', setArticleHTML);
elements.articleTitle.addEventListener('input', delayed(() => {
  setArticleName(elements.articleTitle.value);
}, loadDelay));
elements.uploadButton.addEventListener('click', () => {
  postJSON(api('/article'), {
    title: articleName(),
    body: articleMarkdown()
  })
    .then(successPopup)
    .catch(failurePopup);
});
