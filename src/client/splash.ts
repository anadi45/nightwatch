const playBtn = document.getElementById('play-btn');

playBtn?.addEventListener('click', () => {
  window.parent.postMessage({ type: 'devvit-navigate', entrypoint: 'game' }, '*');
});
