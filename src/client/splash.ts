import { requestExpandedMode, context } from '@devvit/web/client';

const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
const subtitle = document.querySelector('.subtitle') as HTMLParagraphElement;

playBtn.addEventListener('click', (e) => {
  requestExpandedMode(e, 'game');
});

if (context.username) {
  subtitle.textContent = `The watch begins, ${context.username}...`;
}
