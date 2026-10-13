/* Native audio audition on the public PRO development page. No app/project data. */
(() => {
  'use strict';
  const cards = [...document.querySelectorAll('.pro-sample')];
  for (const card of cards) {
    const audio = card.querySelector('audio');
    const status = card.querySelector('.pro-audio-status');
    let switching = 0;
    audio.addEventListener('play', () => {
      if (audio.paused) return;
      for (const other of cards) if (other !== card) other.querySelector('audio').pause();
    });
    audio.addEventListener('error', () => {
      status.textContent = '音声を読み込めませんでした。接続を確認して、再読み込みしてください。';
    });
    for (const button of card.querySelectorAll('button[data-mode]')) {
      button.addEventListener('click', () => {
        if (button.getAttribute('aria-pressed') === 'true') return;
        const time = audio.ended || audio.currentTime >= audio.duration - .1 ? 0 : audio.currentTime || 0;
        const playing = !audio.paused;
        const mode = button.dataset.mode;
        const ticket = ++switching;
        audio.pause();
        for (const other of card.querySelectorAll('button[data-mode]')) other.setAttribute('aria-pressed', String(other === button));
        audio.src = card.dataset[mode];
        audio.addEventListener('loadedmetadata', () => {
          if (ticket !== switching) return;
          audio.currentTime = Math.min(time, Math.max(0, audio.duration - .01));
        }, { once: true });
        audio.load();
        status.textContent = (mode === 'full' ? 'コード＋ベース付き' : 'メロディだけ') + ' · 同じ位置で聴き比べ';
        const save = card.querySelector('.pro-audio-save');
        save.href = card.dataset[mode];
        save.textContent = (mode === 'full' ? '伴奏付き音声' : 'メロディ音声') + 'を保存 ↓';
        // Start in this tap gesture, while metadata loads, for mobile playback.
        if (playing) audio.play().catch(() => {
          if (ticket === switching) status.textContent = '再生ボタンを押すと、続きから聴けます。';
        });
      });
    }
  }
  window.addEventListener('pagehide', () => { for (const card of cards) card.querySelector('audio').pause(); });
})();
