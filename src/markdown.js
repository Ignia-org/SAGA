/* Markdown bodies use standard soft breaks. Raw HTML is shown as text. */
function renderMarkdown(text, record = null, editable = false) {
  text = text.replace(/\r\n/g, '\n');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tokens = marked.lexer(text, { gfm: true, breaks: false });
  const lines = text.split('\n'), blocked = new Set();
  const offsets = []; let offset = 0;
  for (const line of lines) { offsets.push(offset); offset += line.length + 1; }
  // Exclude literal code/HTML blocks when mapping editable checkboxes to source lines.
  marked.walkTokens(tokens, token => {
    if (!['code', 'html'].includes(token.type)) return;
    let at = text.indexOf(token.raw);
    while (at !== -1) {
      for (let i = 0; i < offsets.length; i++) if (offsets[i] >= at && offsets[i] < at + token.raw.length) blocked.add(i);
      at = text.indexOf(token.raw, at + token.raw.length);
    }
  });
  let cursor = 0;
  marked.walkTokens(tokens, token => {
    if (token.type !== 'list_item' || !token.task) return;
    const first = token.raw.split('\n')[0].trim();
    const line = lines.findIndex((value, i) => i >= cursor && !blocked.has(i) && value.trim().replace(/^(?:>\s*)+/, '') === first);
    if (line >= 0) cursor = line + 1;
    let assigned = false;
    marked.walkTokens(token.tokens, item => {
      if (item.type === 'checkbox' && !assigned) {
        item.sagaLine = line; item.sagaLabel = token.text.split('\n')[0]; assigned = true;
      }
    });
  });
  const renderer = new marked.Renderer();
  renderer.html = token => escape(token.text);
  renderer.image = token => '<span class="image-reference">' + escape(token.text || 'Image') + '</span>';
  renderer.listitem = function (token) {
    return '<li' + (token.task ? ' class="task' + (token.checked ? ' done' : '') + '"' : '') + '>' + this.parser.parse(token.tokens) + '</li>\n';
  };
  renderer.checkbox = token => {
    const validLine = token.sagaLine >= 0 && /^\s*(?:[-*+]|\d+[.)]) \[[ xX]\]/.test(lines[token.sagaLine] || '');
    const attrs = editable && record && validLine ? ' data-check="' + escape(record.meta.id) + '" data-line="' + token.sagaLine + '"' : ' disabled';
    return '<input type="checkbox" aria-label="' + escape(token.sagaLabel || 'Task') + '"' + (token.checked ? ' checked' : '') + attrs + '> ';
  };
  const rendered = marked.parser(tokens, { gfm: true, breaks: false, renderer });
  const clean = DOMPurify.sanitize(rendered, {
    ALLOWED_TAGS: ['p','br','strong','em','del','code','pre','blockquote','ul','ol','li','hr','h1','h2','h3','h4','h5','h6','table','thead','tbody','tr','th','td','a','input','span'],
    ALLOWED_ATTR: ['href','title','class','start','align','type','checked','disabled','aria-label','data-check','data-line'],
    ALLOW_DATA_ATTR: false
  });
  const template = document.createElement('template'); template.innerHTML = clean;
  for (const anchor of template.content.querySelectorAll('a')) {
    const href = anchor.getAttribute('href');
    if (!href || !/^(?:https?:|mailto:|#)/i.test(href)) anchor.removeAttribute('href');
    else { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
  }
  return template.innerHTML;
}
