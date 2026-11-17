import './style.css';
import { GameApp, type LoadingView } from '@app/GameApp';

const container = document.getElementById('game')!;
const loadingEl = document.getElementById('loading')!;
const bar = loadingEl.querySelector<HTMLDivElement>('.loading-bar-fill')!;
const text = loadingEl.querySelector<HTMLDivElement>('.loading-text')!;

const loading: LoadingView = {
  progress(p, t) {
    bar.style.width = `${Math.round(p * 100)}%`;
    if (t) text.textContent = t;
  },
  done() {
    loadingEl.classList.add('hidden');
    setTimeout(() => loadingEl.remove(), 600);
  },
  error(msg) {
    text.textContent = msg;
    loadingEl.classList.add('error');
  },
};

const app = new GameApp(container, loading);
app.start().catch((err) => {
  console.error(err);
  loading.error(`啟動失敗：${err instanceof Error ? err.message : String(err)}`);
});

// 除錯用：在 console 存取 window.__game
(window as unknown as { __game: GameApp }).__game = app;
