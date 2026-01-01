// dom.js - DOM Factory Helper for declarative element creation

/**
 * Create DOM element declaratively
 * @param {string} tag - Element tag name
 * @param {Object} attrs - Attributes, properties, and event handlers
 * @param {Array|string|Element} children - Child elements or text content
 * @returns {HTMLElement}
 *
 * @example
 * // Simple element
 * h('span', { class: 'title' }, 'Hello World')
 *
 * @example
 * // With event handler
 * h('button', { class: 'btn', onclick: () => alert('clicked') }, 'Click me')
 *
 * @example
 * // Nested structure
 * h('div', { class: 'card', 'data-id': '123' }, [
 *   h('img', { src: 'icon.png' }),
 *   h('span', { class: 'title' }, 'Card Title')
 * ])
 *
 * @example
 * // Conditional children
 * h('div', {}, [
 *   showBtn && h('button', {}, 'Optional'),
 *   h('span', {}, 'Always shown')
 * ])
 */
function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);

  for (const [key, val] of Object.entries(attrs)) {
    if (val == null) continue;

    if (key.startsWith('on') && typeof val === 'function') {
      // Event handlers: onclick, onmouseenter, etc.
      el.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (key === 'class' || key === 'className') {
      el.className = val;
    } else if (key === 'style' && typeof val === 'object') {
      // Style object: { display: 'flex', gap: '8px' }
      Object.assign(el.style, val);
    } else if (key.startsWith('data-')) {
      // Data attributes: data-id, data-action
      el.dataset[key.slice(5)] = val;
    } else {
      el.setAttribute(key, val);
    }
  }

  // Handle children (string, element, or array)
  const childArray = Array.isArray(children) ? children : [children];
  for (const child of childArray) {
    if (child == null || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }

  return el;
}

// Expose globally
window.h = h;
