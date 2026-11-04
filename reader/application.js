const $ = (id) => document.getElementById(id);

// Only the reader workspace and search results switch in place.
export function showView(view) {
  window.dispatchEvent(new Event('reader:viewchange'));
  document.documentElement.dataset.view = view;
  $('readerView').hidden = view !== 'reader';
  $('searchView').hidden = view !== 'search';
  $('openGlobalSearch').classList.toggle('active', view === 'search');
}

export function initReaderNavigation({ read, search }) {
  $('readerNav').addEventListener('click', (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    read();
  });
  $('topSearchForm').addEventListener('submit', (event) => {
    event.preventDefault();
    search($('topSearchQuery').value.trim());
  });
}
