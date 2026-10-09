const tableOfContents = document.querySelector('.ins-toc');
if (tableOfContents && window.matchMedia('(max-width: 700px)').matches) tableOfContents.open = false;

const filters = document.querySelector('.ins-filters');
if (filters) {
  filters.hidden = false;
  const buttons = [...filters.querySelectorAll('button')];
  function select(category) {
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === category)));
    let count = 0;
    document.querySelectorAll('[data-category]').forEach(card => {
      card.hidden = category !== 'All' && card.dataset.category !== category;
      if (!card.hidden) count++;
    });
    document.getElementById('ins-empty').hidden = count > 0;
  }
  buttons.forEach(button => button.addEventListener('click', () => select(button.dataset.filter)));
  function fromHash() {
    const button = buttons.find(button => button.dataset.filter.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === location.hash.slice(1));
    select(button ? button.dataset.filter : 'All');
  }
  fromHash();
  window.addEventListener('hashchange', fromHash);
}
